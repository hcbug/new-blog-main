import type { FeedEntry } from '~/types/feed'
import blogConfig from '~~/blog.config'
/**
 * 朋友圈：抓取友链中博客的订阅源最新文章。
 * - 数据源为 app/feeds.ts 中配置了 feed 的友链
 * - 服务端内存缓存 60 分钟，可用 ?refresh=1 强制刷新
 * - 客户端另有 localStorage 缓存，见 /fcircle 页面
 */
import feeds from '~/feeds'

const CACHE_TTL = 60 * 60 * 1000
const FEED_TIMEOUT = 5000
const BATCH_SIZE = 10
const MAX_POSTS_PER_SITE = 8

interface FcirclePost {
	title: string
	link: string
	date: number
	summary?: string
}

interface FcircleSite {
	name: string
	link: string
	avatar: string
	posts: FcirclePost[]
}

interface CacheEntry {
	data: FcircleSite[]
	at: number
}

const cache = new Map<string, CacheEntry>()

function readCache(): FcircleSite[] | null {
	const hit = cache.get('all')
	if (!hit)
		return null
	if (Date.now() - hit.at >= CACHE_TTL) {
		cache.delete('all')
		return null
	}
	return hit.data
}

function decodeEntities(text: string): string {
	return text
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, '\'')
		.replace(/&nbsp;/g, ' ')
}

function stripHtml(html: string): string {
	return decodeEntities(html)
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function parseDate(raw?: string): number {
	if (!raw)
		return 0
	const time = Date.parse(raw)
	return Number.isFinite(time) ? time : 0
}

/** 轻量 RSS / Atom 解析，避免引入重量级 XML 依赖 */
function parseFeedXml(xml: string): FcirclePost[] {
	const posts: FcirclePost[] = []
	const isAtom = /<feed[\s>]/i.test(xml)

	if (isAtom) {
		const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/gi
		for (const match of xml.matchAll(entryRe)) {
			const block = match[1] ?? ''
			const title = stripHtml(block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
			const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i) ?? block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)
			const link = decodeEntities(linkMatch?.[1]?.trim() ?? '')
			const dateRaw = block.match(/<(?:published|updated)[^>]*>([\s\S]*?)<\/(?:published|updated)>/i)?.[1]
			const summaryRaw = block.match(/<(?:summary|content)[^>]*>([\s\S]*?)<\/(?:summary|content)>/i)?.[1]
			if (title && link) {
				posts.push({
					title,
					link,
					date: parseDate(dateRaw),
					summary: summaryRaw ? stripHtml(summaryRaw).slice(0, 200) : undefined,
				})
			}
		}
	}
	else {
		const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi
		for (const match of xml.matchAll(itemRe)) {
			const block = match[1] ?? ''
			const title = stripHtml(block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
			const link = decodeEntities(block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? '')
			const dateRaw = block.match(/<(?:pubDate|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|dc:date)>/i)?.[1]
			const summaryRaw = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]
			if (title && link) {
				posts.push({
					title,
					link,
					date: parseDate(dateRaw),
					summary: summaryRaw ? stripHtml(summaryRaw).slice(0, 200) : undefined,
				})
			}
		}
	}
	return posts
}

async function fetchFeedXml(feedUrl: string): Promise<string | null> {
	try {
		const res = await fetch(feedUrl, {
			headers: { 'user-agent': 'FcircleBot/1.0 (+blog.hcbu.cn)' },
			signal: AbortSignal.timeout(FEED_TIMEOUT),
		})
		if (!res.ok)
			return null
		return await res.text()
	}
	catch {
		return null
	}
}

async function crawlSite(entry: FeedEntry): Promise<FcircleSite | null> {
	if (!entry.feed)
		return null
	const xml = await fetchFeedXml(entry.feed)
	if (!xml)
		return null
	const posts = parseFeedXml(xml)
		.sort((a, b) => b.date - a.date)
		.slice(0, MAX_POSTS_PER_SITE)
	if (!posts.length)
		return null
	return {
		name: entry.sitenick || entry.title || entry.author || '未知站点',
		link: entry.link,
		avatar: entry.avatar || entry.icon || '',
		posts,
	}
}

export default defineEventHandler(async (event) => {
	const force = getQuery(event).refresh === '1'
	const hit = !force ? readCache() : null
	if (hit)
		return { sites: hit, generatedAt: Date.now() }

	const entries = feeds
		.flatMap(group => group.entries)
		.filter(entry => entry.feed && !entry.link.includes(blogConfig.url))

	// 分批并发抓取，避免一次打爆所有友链
	const sites: FcircleSite[] = []
	for (let i = 0; i < entries.length; i += BATCH_SIZE) {
		const batch = entries.slice(i, i + BATCH_SIZE)
		const results = await Promise.all(batch.map(entry => crawlSite(entry)))
		sites.push(...results.filter((site): site is FcircleSite => site !== null))
	}

	if (sites.length)
		cache.set('all', { data: sites, at: Date.now() })

	const stats = {
		sites: sites.length,
		posts: sites.reduce((sum, site) => sum + site.posts.length, 0),
		failed: entries.length - sites.length,
	}

	return {
		sites,
		stats,
		generatedAt: Date.now(),
	}
})

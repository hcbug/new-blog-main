/**
 * Meting API 代理：浏览器直连受 CORS 限制且不支持 JSONP，由服务端转发。
 * - type: playlist | url | lrc
 * - 内存缓存 30 分钟；主实例失败时自动切换备用实例
 */
import blogConfig from '~~/blog.config'

const CACHE_TTL = 30 * 60 * 1000
const CACHE_MAX = 200

interface CacheEntry {
	data: unknown
	at: number
}

const cache = new Map<string, CacheEntry>()

const INSTANCES = [
	blogConfig.music.apiBase,
	'https://api.qijieya.cn/meting/',
]

function readCache(key: string): unknown | undefined {
	const hit = cache.get(key)
	if (!hit)
		return undefined
	if (Date.now() - hit.at >= CACHE_TTL) {
		cache.delete(key)
		return undefined
	}
	return hit.data
}

function writeCache(key: string, data: unknown) {
	if (cache.size >= CACHE_MAX) {
		const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
		if (oldest)
			cache.delete(oldest[0])
	}
	cache.set(key, { data, at: Date.now() })
}

export default defineEventHandler(async (event) => {
	const query = getQuery(event)
	const type = String(query.type ?? '')
	const id = String(query.id ?? '')
	if (!['playlist', 'url', 'lrc'].includes(type) || !/^\d{1,12}$/.test(id))
		throw createError({ statusCode: 400, statusMessage: '非法参数' })

	const key = `${type}:${id}`
	const hit = readCache(key)
	if (hit !== undefined)
		return hit

	for (const base of INSTANCES) {
		try {
			let url = `${base}?server=netease&type=${type}&id=${id}`
			if (type === 'playlist')
				url += `&limit=${Number(query.limit) || 300}`
			const res = await fetch(url, {
				// type=url 时上游返回 302 重定向，手动取 Location 即可（带签名，不缓存）
				redirect: 'manual',
				headers: {
					'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
					'referer': 'https://music.163.com/',
				},
				signal: AbortSignal.timeout(15_000),
			})
			if (type === 'url' && res.status >= 300 && res.status < 400) {
				setHeader(event, 'Cache-Control', 'no-store')
				return { url: res.headers.get('location') ?? '' }
			}
			if (!res.ok)
				continue
			// type=lrc 上游返回纯文本 LRC，统一包装成 { lyric }
			if (type === 'lrc') {
				const text = await res.text()
				if (!text.trim())
					continue
				writeCache(key, { lyric: text })
				setHeader(event, 'Cache-Control', 'public, max-age=1800')
				return { lyric: text }
			}
			const data = await res.json()
			if (type === 'playlist' && !Array.isArray(data))
				continue
			writeCache(key, data)
			setHeader(event, 'Cache-Control', 'public, max-age=1800')
			return data
		}
		catch (e) {
			console.warn(`Meting 实例请求失败，切换备用实例: ${base}`, e)
		}
	}

	throw createError({ statusCode: 502, statusMessage: 'Meting 全部实例请求失败' })
})

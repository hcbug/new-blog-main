/**
 * 网易云歌词代理：浏览器直连官方接口受 CORS 限制，由服务端转发。
 * - 返回 lrc / tlyric / yrc（逐字歌词，官方接口仍在返回时）原始文本
 * - 内存缓存 30 分钟，降低官方接口压力
 */

const LRC_TTL = 30 * 60 * 1000
const LRC_MAX = 300

interface LyricPayload {
	lyric: string
	tlyric?: string
	yrc?: string
}

interface CacheEntry {
	data: LyricPayload
	at: number
}

const cache = new Map<string, CacheEntry>()

function readCache(id: string): LyricPayload | null {
	const hit = cache.get(id)
	if (!hit)
		return null
	if (Date.now() - hit.at >= LRC_TTL) {
		cache.delete(id)
		return null
	}
	return hit.data
}

function writeCache(id: string, data: LyricPayload) {
	if (cache.size >= LRC_MAX) {
		const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
		if (oldest)
			cache.delete(oldest[0])
	}
	cache.set(id, { data, at: Date.now() })
}

export default defineEventHandler(async (event) => {
	const id = String(getQuery(event).id ?? '')
	if (!/^\d{1,12}$/.test(id))
		throw createError({ statusCode: 400, statusMessage: '非法歌曲 ID' })

	const hit = readCache(id)
	if (hit)
		return hit

	try {
		const url = `https://music.163.com/api/song/lyric?id=${id}&lv=-1&kv=-1&tv=-1`
		const res = await fetch(url, {
			headers: {
				'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
				'referer': 'https://music.163.com/',
			},
			signal: AbortSignal.timeout(6000),
		})
		if (!res.ok)
			throw new Error(`网易云歌词接口 ${res.status}`)
		const json = await res.json()
		if (json.code !== 200)
			throw new Error(`网易云歌词接口 code ${json.code}`)

		const data: LyricPayload = {
			lyric: json.lrc?.lyric ?? '',
			tlyric: json.tlyric?.lyric || undefined,
			yrc: json.yrc?.lyric || undefined,
		}
		if (!data.lyric && !data.yrc)
			throw new Error('歌词为空')
		writeCache(id, data)
		setHeader(event, 'Cache-Control', 'public, max-age=1800')
		return data
	}
	catch (e) {
		console.warn(`歌词获取失败 id=${id}`, e)
		throw createError({ statusCode: 502, statusMessage: '歌词获取失败' })
	}
})

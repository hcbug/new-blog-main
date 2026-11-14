/**
 * 歌词解析工具（纯函数，供播放器使用）：
 * - LRC / YRC / 翻译行解析
 * - 无官方逐字时间轴时，按字符权重合成卡拉OK节奏
 */

export interface WordSeg {
	text: string
	start: number
	dur: number
}

export interface LrcLine {
	time: number
	text: string
	words: WordSeg[]
	trans?: string
}

const CJK_RE = /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/
const PUNCT_RE = /[，。、！？…～·；;：:,.'"“”‘’!?()（）<>《》【】[\]&*+=_~-]/

function isPunct(ch: string) {
	return PUNCT_RE.test(ch)
}

/** 把一行歌词切分成卡拉OK单元：汉字逐字、西文按词 */
export function tokenizeLine(text: string): string[] {
	const units: string[] = []
	let current = ''
	let currentIsCjk = false

	const flush = () => {
		if (current)
			units.push(current)
		current = ''
	}

	for (const ch of text) {
		if (/\s/.test(ch)) {
			if (current && !currentIsCjk)
				flush()
			continue
		}
		if (isPunct(ch)) {
			if (current)
				current += ch
			continue
		}
		const cjk = CJK_RE.test(ch)
		if (!current) {
			current = ch
			currentIsCjk = cjk
			continue
		}
		if (cjk || currentIsCjk) {
			flush()
			current = ch
			currentIsCjk = cjk
			continue
		}
		current += ch
	}
	flush()
	return units
}

/** 没有官方逐字时间轴时，按单元权重把行时长摊到每个字/词上 */
export function synthesizeWords(text: string, start: number, dur: number): WordSeg[] {
	const units = tokenizeLine(text)
	const weights = units.map((unit) => {
		const cjkCount = [...unit].filter(ch => CJK_RE.test(ch)).length
		return cjkCount > 0 ? cjkCount : Math.max(1, Math.ceil(unit.trim().length / 2))
	})
	const total = weights.reduce((a, b) => a + b, 0) || 1
	let cursor = start
	return units.map((unit, index) => {
		const seg = { text: unit, start: cursor, dur: (weights[index] ?? 1) / total * dur }
		cursor += seg.dur
		return seg
	})
}

/** 解析官方 YRC 逐字歌词：[start,dur](字)(字时长)... */
export function parseYrc(yrc: string): LrcLine[] {
	const lines: LrcLine[] = []
	for (const raw of yrc.split('\n')) {
		const head = raw.match(/^\[(\d+),(\d+)\](.*)$/)
		if (!head)
			continue
		const start = Number(head[1]) / 1000
		const rest = head[3] ?? ''
		const words: WordSeg[] = []
		let cursor = start
		const segRe = /([^(]+)\((\d+)(?:,\d+)?\)/g
		for (const match of rest.matchAll(segRe)) {
			const text = match[1]?.trim()
			const dur = Number(match[2]) / 1000
			if (text) {
				words.push({ text, start: cursor, dur })
				cursor += dur
			}
		}
		if (!words.length) {
			const text = rest.replace(/[()]/g, '').trim()
			if (text)
				words.push({ text, start, dur: Number(head[2]) / 1000 })
		}
		if (!words.length)
			continue
		lines.push({ time: start, text: words.map(w => w.text).join(''), words })
	}
	return lines
}

/** 解析 LRC 并合成逐字节奏，附带匹配翻译行 */
export function parseLrcWithWords(lrc: string, tlyric?: string): LrcLine[] {
	const rawLines: { time: number, text: string }[] = []
	for (const raw of lrc.split('\n')) {
		const matches = [...raw.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)]
		const text = raw.replace(/\[[^\]]*\]/g, '').trim()
		if (!matches.length || !text)
			continue
		for (const match of matches) {
			const min = Number(match[1])
			const sec = Number(match[2])
			const frac = match[3] ? Number(match[3]) / 10 ** match[3].length : 0
			rawLines.push({ time: min * 60 + sec + frac, text })
		}
	}
	rawLines.sort((a, b) => a.time - b.time)

	const transLines = tlyric ? parseLrcPlain(tlyric) : []
	let transCursor = 0

	return rawLines.map((line, index) => {
		const nextTime = rawLines[index + 1]?.time ?? line.time + 8
		const dur = Math.min(Math.max(nextTime - line.time, 0.4), 8)
		let trans: string | undefined
		while (transCursor < transLines.length && transLines[transCursor]!.time < line.time - 0.35)
			transCursor++
		const candidate = transLines[transCursor]
		if (candidate && candidate.time <= line.time + 0.35) {
			trans = candidate.text
			transCursor++
		}
		return {
			time: line.time,
			text: line.text,
			words: synthesizeWords(line.text, line.time, dur),
			trans,
		}
	})
}

/** 解析纯 LRC（不含逐字合成），用于翻译行等 */
export function parseLrcPlain(lrc: string): { time: number, text: string }[] {
	const lines: { time: number, text: string }[] = []
	for (const raw of lrc.split('\n')) {
		const match = raw.match(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\](.*)/)
		if (!match)
			continue
		const text = match[4]?.trim()
		if (!text)
			continue
		const frac = match[3] ? Number(match[3]) / 10 ** match[3].length : 0
		lines.push({ time: Number(match[1]) * 60 + Number(match[2]) + frac, text })
	}
	return lines.sort((a, b) => a.time - b.time)
}

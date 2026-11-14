<script setup lang="ts">
/**
 * 全局音乐播放器。
 * 交互模型：
 * - 默认胶囊 = 封面 + 播放按钮，胶囊下方一条细线显示播放进度
 * - 点击封面 → 展开歌单详情面板（点击外部/ESC 回收）
 * - 面板头部“歌词”按钮 → 歌词页向右展开，胶囊顺势拉长、中部常驻显示当前歌词
 * - 关闭详情面板后，含歌词的胶囊保留（歌词常驻），点击胶囊歌词区可重新打开详情
 *
 * 技术约定：
 * - 数据统一走站内代理 /api/meting 与 /api/lyric，无 CORS/JSONP 问题
 * - 逐字歌词：有 YRC 用官方逐字时间轴；没有时按行时长 + 字符权重合成节奏
 * - 播放进度 / 时间标签 / 逐字高亮这类高频更新只改 DOM，不进 Vue 响应式
 * - 进度条支持拖动（预览 + 松手落点）与键盘微调；歌词行点击可跳转到对应时间
 */

interface Song {
	id: string
	name: string
	artist: string
	pic?: string
	lrcUrl?: string
}

interface WordSeg {
	text: string
	start: number
	dur: number
}

interface LrcLine {
	time: number
	text: string
	words: WordSeg[]
	trans?: string
}

const appConfig = useAppConfig()
const music = appConfig.music

const STORAGE_MODE = 'music-player.mode'
const STORAGE_VOLUME = 'music-player.volume'
const STORAGE_PROGRESS = 'music-player.progress'
const STORAGE_LYRIC = 'music-player.lyrics'
const PLAYLIST_CACHE = `music-player.playlist-${music.playlistId}`
const CACHE_TTL = 30 * 60 * 1000

type PlayMode = 'list' | 'single' | 'random'
type PlayerStatus = 'idle' | 'loading' | 'ready' | 'error'

const status = ref<PlayerStatus>('idle')
const songs = ref<Song[]>([])
const currentIdx = ref(-1)
const playing = ref(false)
const mode = ref<PlayMode>('list')
const expanded = ref(false)
const lyricMode = ref(false)
const volume = ref(music.defaultVolume ?? 0.6)
const lrcLines = ref<LrcLine[]>([])
const lrcIndex = ref(-1)
// 胶囊常驻歌词区的逐字高亮（只有当前行，响应式开销极小）
const stripWordIdx = ref(-1)

const rootEl = useTemplateRef<HTMLDivElement>('root')
const audioEl = useTemplateRef<HTMLAudioElement>('audio')
const fillEl = useTemplateRef<HTMLDivElement>('fill')
const thumbEl = useTemplateRef<HTMLDivElement>('thumb')
const curTimeEl = useTemplateRef<HTMLSpanElement>('cur-time')
const durEl = useTemplateRef<HTMLSpanElement>('dur')
const lineFillEl = useTemplateRef<HTMLDivElement>('line-fill')
const lyricsEl = useTemplateRef<HTMLDivElement>('lyrics')

let currentSec = 0
let pendingSeek = 0
let lrcFetchSeq = 0
// 音频出错兜底时是否恢复播放（selectSong 的 autoplay 意图）
let keepPlaying = false
// 歌词页逐字高亮与拖动的非响应式状态（直接操作 DOM）
let prevPaneLine = -1
let prevPaneWord = -1
let dragging = false
let dragRatio = 0

const currentSong = computed(() => songs.value[currentIdx.value])
const currentLine = computed(() => lrcLines.value[lrcIndex.value])

// ---------- 数据加载 ----------

function extractId(song: any): string {
	if (song?.id)
		return String(song.id)
	const match = String(song?.url ?? '').match(/id=(\d+)/)
	return match?.[1] ?? ''
}

function readCache<T>(key: string): T | null {
	try {
		const raw = sessionStorage.getItem(key)
		if (!raw)
			return null
		const parsed = JSON.parse(raw)
		if (Date.now() - (parsed.at ?? 0) > CACHE_TTL)
			return null
		return parsed.value as T
	}
	catch {
		return null
	}
}

function writeCache(key: string, value: unknown) {
	try {
		sessionStorage.setItem(key, JSON.stringify({ value, at: Date.now() }))
	}
	catch {}
}

async function loadPlaylist() {
	status.value = 'loading'
	try {
		const cached = readCache<Song[]>(PLAYLIST_CACHE)
		if (cached?.length) {
			songs.value = cached
		}
		else {
			// 歌单走站内代理，绕开 CORS / JSONP 限制
			const raw: unknown = await $fetch('/api/meting', {
				params: { type: 'playlist', id: music.playlistId, limit: music.playlistLimit ?? 300 },
				timeout: 20_000,
			})
			const list = (Array.isArray(raw) ? raw : [])
				.map(item => ({
					id: extractId(item),
					name: String(item?.name ?? '').trim(),
					artist: String(item?.artist ?? '').trim(),
					pic: typeof item?.pic === 'string' ? item.pic : undefined,
					lrcUrl: typeof item?.lrc === 'string' ? item.lrc : undefined,
				}))
				.filter(item => item.id && item.name)
			if (!list.length)
				throw new Error('歌单为空')
			songs.value = list
			writeCache(PLAYLIST_CACHE, list)
		}
		status.value = 'ready'
		restoreProgress()
	}
	catch (e) {
		console.warn('歌单加载失败', e)
		status.value = 'error'
	}
}

/** 恢复上次的歌曲与进度（只定位，不自动播放） */
function restoreProgress() {
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_PROGRESS) ?? 'null')
		if (!saved?.songId || Date.now() - (saved.at ?? 0) > 2 * 60 * 60 * 1000)
			return
		const index = songs.value.findIndex(song => song.id === saved.songId)
		if (index >= 0) {
			currentIdx.value = index
			pendingSeek = Number(saved.time) || 0
			nextTick(() => {
				const song = songs.value[index]
				if (song)
					selectSong(song, false)
			})
		}
	}
	catch {}
}

function persistProgress() {
	const song = currentSong.value
	if (!song)
		return
	try {
		localStorage.setItem(STORAGE_PROGRESS, JSON.stringify({
			songId: song.id,
			time: audioEl.value?.currentTime ?? 0,
			at: Date.now(),
		}))
	}
	catch {}
}

/**
 * 音频直链：直接使用 Meting url 端点（服务端 302 到真实 mp3，
 * audio 标签会跟随重定向）。播放失败时由 onAudioError 兜底为官方外链。
 */
function resolveUrl(song: Song): string {
	return `${music.apiBase}?server=netease&type=url&id=${song.id}`
}

// ---------- 歌词 ----------

interface LyricPayload {
	lyric?: string
	tlyric?: string
	yrc?: string
}

/** 网易云官方歌词 → 站内代理 → Meting 歌词代理兜底 */
async function fetchLyricPayload(song: Song): Promise<LyricPayload | null> {
	try {
		const res = await $fetch<LyricPayload>(`/api/lyric?id=${song.id}`, { timeout: 8000 })
		if (res?.lyric || res?.yrc)
			return res
	}
	catch {}
	try {
		return await $fetch<LyricPayload>('/api/meting', {
			params: { type: 'lrc', id: song.id },
			timeout: 8000,
		})
	}
	catch {
		return null
	}
}

const CJK_RE = /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/
const PUNCT_RE = /[，。、！？…～·；;：:,.'"“”‘’!?()（）<>《》【】[\]&*+=_~-]/

function isPunct(ch: string) {
	return PUNCT_RE.test(ch)
}

/** 把一行歌词切分成卡拉OK单元：汉字逐字、西文按词 */
function tokenizeLine(text: string): string[] {
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
function synthesizeWords(text: string, start: number, dur: number): WordSeg[] {
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
function parseYrc(yrc: string): LrcLine[] {
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
function parseLrcWithWords(lrc: string, tlyric?: string): LrcLine[] {
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

function parseLrcPlain(lrc: string): { time: number, text: string }[] {
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

async function loadLyrics(song: Song) {
	const seq = ++lrcFetchSeq
	lrcLines.value = []
	lrcIndex.value = -1
	stripWordIdx.value = -1
	prevPaneLine = -1
	prevPaneWord = -1
	try {
		const payload = await fetchLyricPayload(song)
		if (seq !== lrcFetchSeq || !payload)
			return
		const parsed = payload.yrc?.trim()
			? parseYrc(payload.yrc)
			: parseLrcWithWords(payload.lyric ?? '', payload.tlyric)
		if (seq !== lrcFetchSeq)
			return
		lrcLines.value = parsed
	}
	catch {
		if (seq === lrcFetchSeq)
			lrcLines.value = []
	}
}

/** 歌词页的逐字高亮：直接操作 DOM，避免整棵歌词树重渲染 */
function updatePaneHighlight(lineIdx: number, wordIdx: number) {
	const container = lyricsEl.value
	if (!container)
		return
	if (lineIdx !== prevPaneLine)
		container.querySelectorAll('.word.on').forEach(el => el.classList.remove('on'))
	else if (prevPaneWord >= 0 && wordIdx !== prevPaneWord)
		container.querySelectorAll(`.lyric-line[data-line="${lineIdx}"] .word.on`).forEach(el => el.classList.remove('on'))
	if (wordIdx >= 0) {
		const target = container.querySelector(`.lyric-line[data-line="${lineIdx}"] .word[data-wi="${wordIdx}"]`)
		target?.classList.add('on')
	}
	prevPaneLine = lineIdx
	prevPaneWord = wordIdx
}

// ---------- 播放控制 ----------

function playAt(index: number, autoplay = true) {
	if (index < 0 || index >= songs.value.length)
		return
	const song = songs.value[index]
	if (!song)
		return
	currentIdx.value = index
	pendingSeek = 0
	selectSong(song, autoplay)
}

async function selectSong(song: Song, autoplay: boolean) {
	const audio = audioEl.value
	if (!audio)
		return
	playing.value = false
	keepPlaying = autoplay
	loadLyrics(song)
	audio.src = resolveUrl(song)
	audio.load()
	if (autoplay) {
		audio.volume = volume.value
		audio.play().catch(() => {})
	}
}

/** 音频加载失败：Meting 302 链失效时用网易云官方外链兜底重试一次 */
function onAudioError() {
	const audio = audioEl.value
	const song = currentSong.value
	if (!audio || !song || !audio.src.includes('/meting/'))
		return
	audio.src = `https://music.163.com/song/media/outer/url?id=${song.id}.mp3`
	audio.load()
	if (keepPlaying)
		audio.play().catch(() => {})
}

function togglePlay() {
	const audio = audioEl.value
	if (!audio)
		return
	if (!currentSong.value && songs.value.length) {
		playAt(0)
		return
	}
	if (audio.paused)
		audio.play().catch(() => {})
	else
		audio.pause()
}

function step(offset: number) {
	if (!songs.value.length)
		return
	// 尚未选曲时，无论点上一首还是下一首都从第一首开始
	if (currentIdx.value < 0) {
		playAt(0)
		return
	}
	// 播了一会儿时点“上一首”应重播当前曲
	if (offset < 0 && currentSec > 3) {
		const audio = audioEl.value
		if (audio) {
			audio.currentTime = 0
			audio.play().catch(() => {})
		}
		return
	}
	let next = currentIdx.value + offset
	if (next < 0)
		next = songs.value.length - 1
	if (next >= songs.value.length)
		next = 0
	playAt(next)
}

function stepNext() {
	if (mode.value === 'random' && songs.value.length > 1) {
		let next = currentIdx.value
		while (next === currentIdx.value)
			next = Math.floor(Math.random() * songs.value.length)
		playAt(next)
		return
	}
	step(1)
}

function cycleMode() {
	const order: PlayMode[] = ['list', 'single', 'random']
	const next = order[(order.indexOf(mode.value) + 1) % order.length]
	if (next)
		mode.value = next
	localStorage.setItem(STORAGE_MODE, mode.value)
}

function onEnded() {
	if (mode.value === 'single') {
		const audio = audioEl.value
		if (audio) {
			audio.currentTime = 0
			audio.play().catch(() => {})
		}
		return
	}
	stepNext()
}

/** 高频更新只动 DOM：进度条、时间标签、胶囊细线、逐字高亮 */
function onTimeUpdate() {
	const audio = audioEl.value
	if (!audio)
		return
	currentSec = audio.currentTime
	const duration = audio.duration || 0
	if (!dragging && duration > 0)
		updateFill(currentSec / duration)
	if (curTimeEl.value)
		curTimeEl.value.textContent = formatTime(currentSec)
	if (lineFillEl.value && duration > 0)
		lineFillEl.value.style.transform = `scaleX(${Math.min(1, currentSec / duration)})`

	// 歌词行与逐字位置只在跨行/跨字时更新
	let index = -1
	for (let i = lrcLines.value.length - 1; i >= 0; i--) {
		const line = lrcLines.value[i]
		if (line && line.time <= currentSec) {
			index = i
			break
		}
	}
	if (index !== lrcIndex.value)
		lrcIndex.value = index
	let wordIdx = -1
	if (index >= 0) {
		const line = lrcLines.value[index]
		if (line) {
			for (let w = line.words.length - 1; w >= 0; w--) {
				const seg = line.words[w]
				if (seg && seg.start <= currentSec) {
					wordIdx = w
					break
				}
			}
		}
	}
	if (index !== prevPaneLine || wordIdx !== prevPaneWord)
		updatePaneHighlight(index, wordIdx)
	if (wordIdx !== stripWordIdx.value)
		stripWordIdx.value = wordIdx
}

function onLoadedMetadata() {
	const audio = audioEl.value
	if (!audio)
		return
	if (durEl.value)
		durEl.value.textContent = formatTime(audio.duration || 0)
	if (pendingSeek > 0 && Number.isFinite(audio.duration)) {
		audio.currentTime = Math.min(pendingSeek, audio.duration - 1)
		pendingSeek = 0
	}
	updateMediaSession()
}

function formatTime(sec: number): string {
	if (!Number.isFinite(sec) || sec < 0)
		return '0:00'
	const m = Math.floor(sec / 60)
	const s = Math.floor(sec % 60)
	return `${m}:${String(s).padStart(2, '0')}`
}

/** 进度条渲染（拖动预览与播放共用） */
function updateFill(ratio: number) {
	const pct = `${Math.min(100, Math.max(0, ratio * 100))}%`
	if (fillEl.value)
		fillEl.value.style.width = pct
	if (thumbEl.value)
		thumbEl.value.style.insetInlineStart = pct
}

// ---------- 拖动进度条 ----------

function progressRatio(e: PointerEvent, el: HTMLElement): number {
	const rect = el.getBoundingClientRect()
	return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
}

function onProgressDown(e: PointerEvent) {
	const audio = audioEl.value
	if (!audio)
		return
	const el = e.currentTarget as HTMLElement
	el.setPointerCapture(e.pointerId)
	dragging = true
	dragRatio = progressRatio(e, el)
	updateFill(dragRatio)
	const duration = audio.duration || 0
	if (curTimeEl.value && duration > 0)
		curTimeEl.value.textContent = formatTime(dragRatio * duration)
}

function onProgressMove(e: PointerEvent) {
	if (!dragging)
		return
	const el = e.currentTarget as HTMLElement
	dragRatio = progressRatio(e, el)
	updateFill(dragRatio)
	const duration = audioEl.value?.duration || 0
	if (curTimeEl.value && duration > 0)
		curTimeEl.value.textContent = formatTime(dragRatio * duration)
}

/** 松手才真正 seek，避免拖动过程频繁打断播放 */
function onProgressUp() {
	if (!dragging)
		return
	dragging = false
	const audio = audioEl.value
	if (audio && audio.duration) {
		audio.currentTime = dragRatio * audio.duration
		if (playing.value)
			audio.play().catch(() => {})
	}
}

function onProgressKey(e: KeyboardEvent) {
	const audio = audioEl.value
	if (!audio || !audio.duration)
		return
	const stepSeconds = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0
	if (!stepSeconds && e.key !== 'Home' && e.key !== 'End')
		return
	e.preventDefault()
	if (e.key === 'Home')
		audio.currentTime = 0
	else if (e.key === 'End')
		audio.currentTime = audio.duration - 0.5
	else
		audio.currentTime = Math.min(Math.max(0, audio.currentTime + stepSeconds), audio.duration - 0.5)
}

/** 点击某行歌词跳转到对应时间并开始播放 */
function seekToLine(time: number) {
	const audio = audioEl.value
	if (!audio)
		return
	audio.currentTime = time
	if (audio.paused)
		audio.play().catch(() => {})
}

/** 点击进度条（非拖动）定位 */
function onProgressClick(e: MouseEvent) {
	const audio = audioEl.value
	const target = e.currentTarget as HTMLElement
	if (!audio || !audio.duration)
		return
	const rect = target.getBoundingClientRect()
	const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
	audio.currentTime = ratio * audio.duration
}

// 歌词页重新挂载后，高亮状态需要重放
watch([lyricMode, expanded], () => {
	prevPaneLine = -1
	prevPaneWord = -1
})

const modeTip = computed(() => ({
	list: '列表循环',
	single: '单曲循环',
	random: '随机播放',
})[mode.value])

// ---------- 歌词常驻区 ----------

function toggleLyric() {
	lyricMode.value = !lyricMode.value
	localStorage.setItem(STORAGE_LYRIC, lyricMode.value ? '1' : '0')
}

// ---------- 系统媒体会话 ----------

function updateMediaSession() {
	const song = currentSong.value
	if (!('mediaSession' in navigator))
		return
	if (!song) {
		navigator.mediaSession.metadata = null
		return
	}
	navigator.mediaSession.metadata = new MediaMetadata({
		title: song.name,
		artist: song.artist,
		artwork: song.pic ? [{ src: song.pic, sizes: '300x300' }] : [],
	})
}

/** 歌词页自动滚动：跨行时把当前行平滑挪到容器中间 */
watch(lrcIndex, async (index) => {
	if (index < 0)
		return
	await nextTick()
	const container = lyricsEl.value
	const active = container?.querySelector('.lyric-line.active') as HTMLElement | null
	if (container && active) {
		const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
		container.scrollTo({
			top: active.offsetTop - container.clientHeight / 2,
			behavior: reduceMotion ? 'auto' : 'smooth',
		})
	}
})

watch(volume, (value) => {
	const audio = audioEl.value
	if (audio)
		audio.volume = value
	localStorage.setItem(STORAGE_VOLUME, String(value))
})

watch(mode, (value) => {
	localStorage.setItem(STORAGE_MODE, value)
})

watch(() => currentSong.value, (song) => {
	updateMediaSession()
	if (song)
		localStorage.setItem(STORAGE_PROGRESS, JSON.stringify({ songId: song.id, time: 0, at: Date.now() }))
})

onMounted(() => {
	const savedMode = localStorage.getItem(STORAGE_MODE)
	if (savedMode === 'list' || savedMode === 'single' || savedMode === 'random')
		mode.value = savedMode
	const savedVolume = Number(localStorage.getItem(STORAGE_VOLUME))
	if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1)
		volume.value = savedVolume
	lyricMode.value = localStorage.getItem(STORAGE_LYRIC) === '1'

	if ('mediaSession' in navigator) {
		navigator.mediaSession.setActionHandler('play', () => togglePlay())
		navigator.mediaSession.setActionHandler('pause', () => audioEl.value?.pause())
		navigator.mediaSession.setActionHandler('previoustrack', () => step(-1))
		navigator.mediaSession.setActionHandler('nexttrack', stepNext)
	}

	// 详情面板：点击外部或按 ESC 回收
	useEventListener(document, 'pointerdown', (e) => {
		if (!expanded.value)
			return
		const root = rootEl.value
		if (root && e.target instanceof Node && !root.contains(e.target))
			expanded.value = false
	})
	useEventListener(window, 'keydown', (e) => {
		if (e.key === 'Escape' && expanded.value)
			expanded.value = false
	})

	// 离开页面时保存进度（只在此处落盘，装载时不写）
	useEventListener(window, 'pagehide', persistProgress)

	loadPlaylist()
})

onBeforeUnmount(() => {
	if ('mediaSession' in navigator)
		navigator.mediaSession.metadata = null
})
</script>

<template>
<div ref="root" class="music-player" :class="{ expanded }">
	<!-- 详情面板：歌单 + 控制，歌词页向右展开 -->
	<Transition name="panel">
		<div v-if="expanded" class="panel-wrap">
			<section class="music-panel">
				<header class="panel-header">
					<div class="now-cover">
						<img v-if="currentSong?.pic" :src="currentSong.pic" alt="" loading="lazy" referrerpolicy="no-referrer">
						<Icon v-else name="tabler:music" />
					</div>
					<div class="now-info">
						<p class="now-name">
							{{ currentSong?.name || (status === 'error' ? '歌单加载失败' : status === 'loading' ? '歌单加载中…' : '音乐播放器') }}
						</p>
						<p class="now-artist">
							{{ currentSong?.artist || (songs.length ? `${songs.length} 首歌曲` : 'Meting · 网易云') }}
						</p>
					</div>
					<button
						class="icon-btn lyric-toggle"
						:class="{ active: lyricMode }"
						title="歌词常驻"
						aria-label="开关歌词"
						@click="toggleLyric"
					>
						<Icon name="tabler:microphone" />
					</button>
					<button class="icon-btn" aria-label="收起播放器" @click="expanded = false">
						<Icon name="tabler:chevron-down" />
					</button>
				</header>

				<div v-if="status === 'error'" class="panel-message">
					<p>歌单加载失败，请稍后重试</p>
					<button class="retry-btn" @click="loadPlaylist">
						<Icon name="tabler:refresh" />
						重新加载
					</button>
				</div>

				<template v-else>
					<ul class="playlist scrollcheck-y scrollbar-hidden">
						<li v-for="(song, index) in songs" :key="song.id">
							<button
								class="song-row"
								:class="{ active: index === currentIdx }"
								@click="playAt(index)"
							>
								<span class="song-index">{{ index + 1 }}</span>
								<span class="song-name">{{ song.name }}</span>
								<span class="song-artist">{{ song.artist }}</span>
								<Icon v-if="index === currentIdx && playing" class="song-playing" name="tabler:volume" />
							</button>
						</li>
					</ul>

					<footer class="panel-controls">
						<!-- 进度条：左边已播放时间，右边总时间 -->
						<div class="progress-row">
							<span ref="cur-time" class="time-label">0:00</span>
							<div
								class="progress"
								role="slider"
								tabindex="0"
								aria-label="播放进度，左右方向键微调"
								@pointerdown="onProgressDown"
								@pointermove="onProgressMove"
								@pointerup="onProgressUp"
								@keydown="onProgressKey"
								@click="onProgressClick"
							>
								<div ref="fill" class="progress-fill" />
								<div ref="thumb" class="progress-thumb" />
							</div>
							<span ref="dur" class="time-label">0:00</span>
						</div>

						<div class="control-row">
							<button class="icon-btn" :title="modeTip" aria-label="切换播放模式" @click="cycleMode">
								<Icon v-if="mode === 'list'" name="tabler:repeat" />
								<Icon v-else-if="mode === 'single'" name="tabler:repeat-once" />
								<Icon v-else name="tabler:shuffle" />
							</button>
							<button class="icon-btn" aria-label="上一首" @click="step(-1)">
								<Icon name="tabler:player-skip-back-filled" />
							</button>
							<button class="icon-btn play-btn" aria-label="播放/暂停" @click="togglePlay">
								<Icon :name="playing ? 'tabler:player-pause-filled' : 'tabler:player-play-filled'" />
							</button>
							<button class="icon-btn" aria-label="下一首" @click="stepNext">
								<Icon name="tabler:player-skip-forward-filled" />
							</button>
						</div>

						<!-- 音量：喇叭图标 + 音量条（静音直接拖到 0） -->
						<div class="volume-row">
							<Icon class="volume-icon" name="tabler:volume" />
							<input
								v-model.number="volume"
								class="volume-slider"
								type="range"
								min="0"
								max="1"
								step="0.05"
								aria-label="音量"
							>
						</div>
					</footer>
				</template>
			</section>

			<!-- 歌词页：向右展开 -->
			<Transition name="lyric-pane">
				<aside v-if="lyricMode" class="lyric-pane">
					<div ref="lyrics" class="lyrics scrollcheck-y scrollbar-hidden">
						<p v-if="!lrcLines.length" class="lyric-empty">
							{{ status === 'loading' ? '加载中…' : '暂无歌词，纯音乐也动人' }}
						</p>
						<template v-else>
							<p
								v-for="(line, index) in lrcLines"
								:key="`${line.time}-${index}`"
								class="lyric-line"
								:class="{ active: index === lrcIndex }"
								:data-line="index"
								:title="`跳转到 ${formatTime(line.time)}`"
								@click="seekToLine(line.time)"
							>
								<template v-if="line.words.length">
									<span
										v-for="(word, wordIndex) in line.words"
										:key="wordIndex"
										class="word"
										:data-wi="wordIndex"
									>{{ word.text }}</span>
								</template>
								<template v-else>
									{{ line.text }}
								</template>
								<span v-if="line.trans" class="trans">{{ line.trans }}</span>
							</p>
						</template>
					</div>
				</aside>
			</Transition>
		</div>
	</Transition>

	<!-- 胶囊：封面 | 歌词常驻区 | 播放按钮 + 底部细进度线 -->
	<div class="capsule-area">
		<div class="capsule" :class="{ 'lyric-mode': lyricMode }">
			<button
				class="capsule-cover"
				:aria-label="expanded ? '收起歌单详情' : '打开歌单详情'"
				:aria-expanded="expanded"
				@click="expanded = !expanded"
			>
				<div class="cover-disc" :class="{ spinning: playing }">
					<img v-if="currentSong?.pic" :src="currentSong.pic" alt="" loading="lazy" referrerpolicy="no-referrer">
					<Icon v-else-if="status === 'error'" name="tabler:music-off" />
					<Icon v-else name="tabler:music" />
				</div>
			</button>

			<!-- 常驻歌词：详情面板关闭后仍然保留；点击可重新打开详情 -->
			<Transition name="strip">
				<button v-if="lyricMode" class="capsule-lyric" aria-label="打开歌词详情" @click="expanded = true">
					<template v-if="currentLine">
						<span class="strip-line">
							<template v-if="currentLine.words.length">
								<span
									v-for="(word, wordIndex) in currentLine.words"
									:key="wordIndex"
									class="strip-word"
									:class="{ on: wordIndex === stripWordIdx }"
								>{{ word.text }}</span>
							</template>
							<template v-else>{{ currentLine.text }}</template>
						</span>
						<span v-if="currentLine.trans" class="strip-trans">{{ currentLine.trans }}</span>
					</template>
					<span v-else class="strip-empty">
						{{ status === 'loading' ? '歌词加载中…' : '暂无歌词' }}
					</span>
				</button>
			</Transition>

			<button class="capsule-play" aria-label="播放/暂停" @click="togglePlay">
				<Icon :name="playing ? 'tabler:player-pause-filled' : 'tabler:player-play-filled'" />
			</button>
		</div>

		<div class="capsule-progress" aria-hidden="true">
			<div ref="line-fill" class="capsule-progress-fill" />
		</div>
	</div>

	<audio
		ref="audio"
		preload="none"
		@timeupdate="onTimeUpdate"
		@loadedmetadata="onLoadedMetadata"
		@ended="onEnded"
		@error="onAudioError"
		@play="playing = true"
		@pause="playing = false"
	/>
</div>
</template>

<style lang="scss" scoped>
.music-player {
	position: fixed;
	inset-inline-start: min(1rem, 5%);
	bottom: min(2rem, 5%);
	z-index: 90; // 低于弹窗层，避免盖住侧栏遮罩
}

.panel-wrap {
	position: absolute;
	inset-inline-start: 0;
	bottom: calc(100% + 0.8rem);
	display: flex;
	gap: 0.6rem;
	align-items: stretch;
	max-width: calc(100vw - 2rem);
}

.music-panel {
	display: flex;
	flex-shrink: 1;
	flex-direction: column;
	overflow: hidden;
	width: 20rem;
	min-width: 14rem;
	max-height: min(70vh, 36rem);
	border: 1px solid var(--c-border);
	border-radius: 1rem;
	background-color: var(--ld-bg-blur);
	backdrop-filter: blur(0.5rem);
	box-shadow: var(--box-shadow-1), var(--box-shadow-3);
}

.panel-enter-active,
.panel-leave-active {
	transition: opacity 0.2s, transform 0.2s;
}

.panel-enter-from,
.panel-leave-to {
	opacity: 0;
	transform: translateY(0.6rem) scale(0.97);
	transform-origin: bottom left;
}

.panel-header {
	display: flex;
	gap: 0.6em;
	align-items: center;
	padding: 0.7em 0.8em;

	.now-cover {
		flex-shrink: 0;
		width: 2.6em;
		height: 2.6em;
		overflow: hidden;
		border-radius: 0.6em;
		background-color: var(--c-bg-3);
		color: var(--c-text-2);

		img {
			width: 100%;
			height: 100%;
			object-fit: cover;
		}

		.iconify {
			padding: 0.5em;
			width: 100%;
			height: 100%;
		}
	}

	.now-info {
		flex-grow: 1;
		min-width: 0;

		.now-name {
			overflow: hidden;
			font-weight: 600;
			white-space: nowrap;
			text-overflow: ellipsis;
			color: var(--c-text-1);
		}

		.now-artist {
			overflow: hidden;
			font-size: 0.8em;
			white-space: nowrap;
			text-overflow: ellipsis;
			color: var(--c-text-2);
		}
	}

	.lyric-toggle.active {
		background-color: var(--ld-bg-active);
		color: var(--c-primary);
	}
}

.playlist {
	flex: 1 1 auto;
	overflow: auto;
	min-height: 10rem;
	padding: 0 0.6em;
	list-style: none;
	overscroll-behavior: contain;

	.song-row {
		display: flex;
		gap: 0.5em;
		align-items: center;
		overflow: hidden;
		width: 100%;
		padding: 0.45em 0.5em;
		border-radius: 0.5em;
		font: inherit;
		font-size: 0.88em;
		text-align: start;
		color: var(--c-text-2);
		cursor: pointer;
		transition: background-color 0.15s;
		content-visibility: auto;
		contain-intrinsic-size: 2.2em;

		&:hover {
			background-color: var(--c-bg-soft);
			color: var(--c-text-1);
		}

		&.active {
			background-color: var(--ld-bg-active);
			color: var(--c-primary);
		}
	}

	.song-index {
		flex-shrink: 0;
		width: 1.6em;
		font-size: 0.85em;
		text-align: center;
		color: var(--c-text-3);
	}

	.song-name {
		flex: 1 1 auto;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.song-artist {
		flex-shrink: 1;
		overflow: hidden;
		max-width: 40%;
		font-size: 0.85em;
		white-space: nowrap;
		text-overflow: ellipsis;
		opacity: 0.7;
	}

	.song-playing {
		flex-shrink: 0;
	}
}

.panel-message {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	gap: 1em;
	align-items: center;
	justify-content: center;
	padding: 2em;
	color: var(--c-text-2);

	.retry-btn {
		display: flex;
		gap: 0.4em;
		align-items: center;
		padding: 0.4em 1em;
		border-radius: 2em;
		background-color: var(--ld-bg-active);
		font: inherit;
		color: var(--c-primary);
		cursor: pointer;
	}
}

.panel-controls {
	padding: 0.6em 0.8em 0.7em;
	border-top: 1px solid var(--c-border);

	.progress-row {
		display: flex;
		gap: 0.6em;
		align-items: center;

		.time-label {
			flex-shrink: 0;
			font-size: 0.75em;
			font-variant-numeric: tabular-nums;
			color: var(--c-text-3);
		}

		.progress {
			position: relative;
			flex-grow: 1;
			height: 1.2em;
			border-radius: 1em;
			cursor: pointer;
			touch-action: none; // 拖动时不触发页面滚动

			&:focus-visible {
				outline: 2px solid var(--c-primary-soft);
			}

			.progress-fill {
				position: absolute;
				inset-block: 50%;
				transform: translateY(-50%);
				width: 0;
				height: 0.4em;
				border-radius: 1em;
				background-color: var(--c-primary);
				pointer-events: none;
				transition: height 0.15s;
			}

			.progress-thumb {
				position: absolute;
				inset-block: 50%;
				transform: translate(-50%, -50%) scale(0);
				width: 0.9em;
				height: 0.9em;
				border-radius: 50%;
				background-color: var(--c-primary);
				box-shadow: var(--box-shadow-1);
				pointer-events: none;
				transition: transform 0.15s;
			}

			&:hover,
			&:focus-visible {
				.progress-fill {
					height: 0.55em;
				}

				.progress-thumb {
					transform: translate(-50%, -50%) scale(1);
				}
			}
		}
	}

	.control-row {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-top: 0.3em;
	}

	.play-btn {
		font-size: 1.6em;
	}

	.volume-row {
		display: flex;
		gap: 0.5em;
		align-items: center;

		.volume-icon {
			flex-shrink: 0;
			font-size: 1.1em;
			color: var(--c-text-3);
		}

		.volume-slider {
			flex-grow: 1;
			min-width: 0;
			accent-color: var(--c-primary);
		}
	}
}

.icon-btn {
	display: grid;
	place-items: center;
	width: 2.4em;
	height: 2.4em;
	border-radius: 50%;
	background-color: transparent;
	font-size: 1em;
	color: var(--c-text-2);
	cursor: pointer;
	transition: all 0.15s;

	&:hover {
		background-color: var(--c-bg-soft);
		color: var(--c-primary);
	}
}

/* ---------- 歌词页（向右展开） ---------- */

.lyric-pane {
	flex-shrink: 1;
	overflow: hidden;
	width: 17rem;
	min-width: 10rem;
	max-height: min(70vh, 36rem);
	border: 1px solid var(--c-border);
	border-radius: 1rem;
	background-color: var(--ld-bg-blur);
	backdrop-filter: blur(0.5rem);
	box-shadow: var(--box-shadow-1), var(--box-shadow-3);
}

.lyric-pane-enter-active,
.lyric-pane-leave-active {
	transition: width 0.3s ease, opacity 0.25s ease;
}

.lyric-pane-enter-from,
.lyric-pane-leave-to {
	width: 0;
	min-width: 0;
	opacity: 0;
}

.lyrics {
	overflow: auto;
	height: 100%;
	padding: 0.5em 1em;
	text-align: center;
	overscroll-behavior: contain;

	.lyric-line {
		padding: 0.35em 0;
		border-radius: 0.5em;
		font-size: 0.9em;
		line-height: 1.6;
		color: var(--c-text-2);
		cursor: pointer;
		transition: color 0.2s, background-color 0.2s;

		&:hover {
			background-color: var(--c-bg-soft);
		}

		&.active {
			color: var(--c-text-1);
		}

		.word {
			transition: color 0.25s;
		}

		.word.on {
			background: linear-gradient(90deg, var(--c-primary), var(--c-accent), var(--c-primary));
			background-position: 0 0;
			background-size: 200% 100%;
			background-clip: text;
			-webkit-background-clip: text;
			color: transparent;
			animation: lyric-flow 1.6s linear infinite;
		}

		.trans {
			display: block;
			margin-top: 0.15em;
			font-size: 0.85em;
			opacity: 0.75;
		}
	}

	.lyric-empty {
		padding-top: 3em;
		color: var(--c-text-3);
	}
}

/* ---------- 胶囊 ---------- */

.capsule-area {
	width: fit-content;
}

.capsule {
	display: flex;
	gap: 0.25rem;
	align-items: center;
	width: fit-content;
	padding: 0.25rem;
	border: 1px solid var(--c-border);
	border-radius: 2rem;
	background-color: var(--ld-bg-blur);
	backdrop-filter: blur(0.5rem);
	box-shadow: var(--box-shadow-1), var(--box-shadow-2);
}

.capsule-cover,
.capsule-play {
	display: grid;
	flex-shrink: 0;
	place-items: center;
	width: 2.7rem;
	height: 2.7rem;
	padding: 0;
	border-radius: 50%;
	background-color: transparent;
	color: var(--c-text-2);
	cursor: pointer;
	transition: color 0.2s, background-color 0.2s;

	&:hover {
		background-color: var(--c-bg-soft);
		color: var(--c-primary);
	}
}

.capsule-cover {
	padding: 0.15rem;

	.cover-disc {
		width: 100%;
		height: 100%;
		overflow: hidden;
		border-radius: 50%;
		background-color: var(--c-bg-3);

		&.spinning {
			animation: spin 12s linear infinite;
		}

		img {
			width: 100%;
			height: 100%;
			object-fit: cover;
		}

		.iconify {
			padding: 0.6em;
			width: 100%;
			height: 100%;
		}
	}
}

.capsule-play {
	font-size: 1.15em;
}

/* 常驻歌词区：展开/收起动画，占胶囊中部 */
.capsule-lyric {
	flex-grow: 1;
	overflow: hidden;
	min-width: 0;
	max-width: min(18rem, 55vw);
	padding: 0.1em 0.6em;
	border-radius: 1rem;
	background-color: transparent;
	font: inherit;
	text-align: start;
	color: var(--c-text-2);
	cursor: pointer;
	transition: background-color 0.2s;

	&:hover {
		background-color: var(--c-bg-soft);
	}

	.strip-line {
		display: block;
		overflow: hidden;
		font-size: 0.85em;
		line-height: 1.5;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--c-text-1);

		.strip-word {
			transition: color 0.25s;
		}

		.strip-word.on {
			background: linear-gradient(90deg, var(--c-primary), var(--c-accent), var(--c-primary));
			background-position: 0 0;
			background-size: 200% 100%;
			background-clip: text;
			-webkit-background-clip: text;
			color: transparent;
			animation: lyric-flow 1.6s linear infinite;
		}
	}

	.strip-trans {
		display: block;
		overflow: hidden;
		font-size: 0.75em;
		line-height: 1.4;
		white-space: nowrap;
		text-overflow: ellipsis;
		opacity: 0.75;
	}

	.strip-empty {
		display: block;
		font-size: 0.8em;
		color: var(--c-text-3);
	}
}

.strip-enter-active,
.strip-leave-active {
	transition: max-width 0.3s ease, opacity 0.25s ease, padding 0.3s ease;
}

.strip-enter-from,
.strip-leave-to {
	max-width: 0;
	padding-inline: 0;
	opacity: 0;
}

/* 胶囊下方的细进度线：宽度随胶囊伸缩 */
.capsule-progress {
	overflow: hidden;
	height: 3px;
	margin-top: 4px;
	border-radius: 1rem;
	background-color: var(--c-bg-3);

	.capsule-progress-fill {
		width: 100%;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--c-primary), var(--c-accent));
		transform: scaleX(0);
		transform-origin: inline-start;
	}
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

@keyframes lyric-flow {
	to {
		background-position: -200% 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.cover-disc.spinning {
		animation: none;
	}

	.word.on,
	.strip-word.on {
		animation: none;
	}

	.lyric-pane-enter-active,
	.lyric-pane-leave-active,
	.strip-enter-active,
	.strip-leave-active {
		transition: opacity 0.2s;
	}
}

@media (max-width: $breakpoint-mobile) {
	.music-panel {
		width: 15rem;
	}

	.lyric-pane {
		width: 12rem;
	}
}
</style>

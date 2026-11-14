<script setup lang="ts">
/**
 * 全局音乐播放器（悬浮胶囊）。
 * - 数据统一走站内代理 /api/meting（服务端转发，无 CORS/JSONP 问题）
 * - 歌词优先走站内代理 /api/lyric（网易云官方接口）
 * - 逐字歌词：有 YRC 用官方逐字时间轴；没有时按行时长 + 字符权重合成节奏
 * - 播放进度 / 时间标签 / 逐字高亮这类高频更新只改 DOM，不进 Vue 响应式
 * - 进度条支持拖动（预览 + 松手落点）与键盘微调
 * - 歌单缓存 30 分钟（sessionStorage），进度只在离开页面时落盘，恢复时不自动播放
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
const tab = ref<'list' | 'lyric'>('list')
const volume = ref(music.defaultVolume ?? 0.6)
const muted = ref(false)
const lrcLines = ref<LrcLine[]>([])
const lrcIndex = ref(-1)

const audioEl = useTemplateRef<HTMLAudioElement>('audio')
const fillEl = useTemplateRef<HTMLDivElement>('fill')
const thumbEl = useTemplateRef<HTMLDivElement>('thumb')
const curTimeEl = useTemplateRef<HTMLSpanElement>('cur-time')
const durEl = useTemplateRef<HTMLSpanElement>('dur')
const lyricsEl = useTemplateRef<HTMLDivElement>('lyrics')

let currentSec = 0
let pendingSeek = 0
let lrcFetchSeq = 0
// 音频出错兜底时是否恢复播放（selectSong 的 autoplay 意图）
let keepPlaying = false
// 逐字高亮与拖动的非响应式状态（直接操作 DOM）
let prevLineIdx = -1
let prevWordIdx = -1
let dragging = false
let dragRatio = 0

const currentSong = computed(() => songs.value[currentIdx.value])

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
 * audio 标签会跟随重定向，无需 CORS/JSONP）。播放失败时由 onAudioError
 * 兜底为网易云官方外链。
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
	prevLineIdx = -1
	prevWordIdx = -1
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

/** 直接操作 DOM 切换逐字高亮，避免整棵歌词树重渲染 */
function updateWordHighlight(lineIdx: number, wordIdx: number) {
	const container = lyricsEl.value
	if (!container)
		return
	const lineChanged = lineIdx !== prevLineIdx
	if (lineChanged)
		container.querySelectorAll('.word.on').forEach(el => el.classList.remove('on'))
	else if (prevWordIdx >= 0 && wordIdx !== prevWordIdx)
		container.querySelectorAll(`.lyric-line[data-line="${lineIdx}"] .word.on`).forEach(el => el.classList.remove('on'))
	if (wordIdx >= 0) {
		const target = container.querySelector(`.lyric-line[data-line="${lineIdx}"] .word[data-wi="${wordIdx}"]`)
		target?.classList.add('on')
	}
	prevLineIdx = lineIdx
	prevWordIdx = wordIdx
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
		audio.volume = muted.value ? 0 : volume.value
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

/** 高频更新只动 DOM：进度条、时间标签、逐字高亮 */
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

	// 歌词行与逐字位置只在跨行/跨字时更新
	let index = -1
	for (let i = lrcLines.value.length - 1; i >= 0; i--) {
		const line = lrcLines.value[i]
		if (line && line.time <= currentSec) {
			index = i
			break
		}
	}
	if (index !== lrcIndex.value) {
		lrcIndex.value = index
	}
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
	if (index !== prevLineIdx || wordIdx !== prevWordIdx)
		updateWordHighlight(index, wordIdx)
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

function progressRatio(e: PointerEvent | KeyboardEvent, el: HTMLElement): number {
	if (e instanceof KeyboardEvent)
		return 0
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
	const step = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0
	if (!step && e.key !== 'Home' && e.key !== 'End')
		return
	e.preventDefault()
	if (e.key === 'Home')
		audio.currentTime = 0
	else if (e.key === 'End')
		audio.currentTime = audio.duration - 0.5
	else
		audio.currentTime = Math.min(Math.max(0, audio.currentTime + step), audio.duration - 0.5)
}

function seek(e: MouseEvent) {
	const audio = audioEl.value
	const target = e.currentTarget as HTMLElement
	if (!audio || !audio.duration)
		return
	const rect = target.getBoundingClientRect()
	const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
	audio.currentTime = ratio * audio.duration
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

/** 歌词自动滚动：跨行时把当前行挪到容器中间 */
watch(lrcIndex, async (index) => {
	if (index < 0)
		return
	await nextTick()
	const container = lyricsEl.value
	const active = container?.querySelector('.lyric-line.active') as HTMLElement | null
	if (container && active)
		container.scrollTop = active.offsetTop - container.clientHeight / 2
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

function toggleMute() {
	muted.value = !muted.value
	const audio = audioEl.value
	if (audio)
		audio.volume = muted.value ? 0 : volume.value
}

onMounted(() => {
	const savedMode = localStorage.getItem(STORAGE_MODE)
	if (savedMode === 'list' || savedMode === 'single' || savedMode === 'random')
		mode.value = savedMode
	const savedVolume = Number(localStorage.getItem(STORAGE_VOLUME))
	if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1)
		volume.value = savedVolume

	if ('mediaSession' in navigator) {
		navigator.mediaSession.setActionHandler('play', () => togglePlay())
		navigator.mediaSession.setActionHandler('pause', () => audioEl.value?.pause())
		navigator.mediaSession.setActionHandler('previoustrack', () => step(-1))
		navigator.mediaSession.setActionHandler('nexttrack', stepNext)
	}

	// 离开页面时保存进度（只在此处落盘，装载时不写）
	useEventListener(window, 'pagehide', persistProgress)

	loadPlaylist()
})

onBeforeUnmount(() => {
	if ('mediaSession' in navigator)
		navigator.mediaSession.metadata = null
})

// 歌单图标随播放模式变化
const modeIcon = computed(() => ({
	list: 'tabler:repeat',
	single: 'tabler:repeat-once',
	random: 'tabler:shuffle',
})[mode.value])

const modeTip = computed(() => ({
	list: '列表循环',
	single: '单曲循环',
	random: '随机播放',
})[mode.value])
</script>

<template>
<div class="music-player" :class="{ expanded }">
	<Transition name="panel">
		<section v-if="expanded" class="music-panel" aria-label="音乐播放器">
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
				<div class="panel-tabs" role="tablist">
					<button :class="{ active: tab === 'list' }" role="tab" @click="tab = 'list'">
						<Icon name="tabler:playlist" />
						歌单
					</button>
					<button :class="{ active: tab === 'lyric' }" role="tab" @click="tab = 'lyric'">
						<Icon name="tabler:microphone" />
						歌词
					</button>
				</div>

				<ul v-if="tab === 'list'" class="playlist scrollcheck-y scrollbar-hidden">
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

				<div v-else ref="lyrics" class="lyrics scrollcheck-y scrollbar-hidden">
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

				<footer class="panel-controls">
					<div
						class="progress"
						role="slider"
						tabindex="0"
						aria-label="播放进度，左右方向键微调"
						@pointerdown="onProgressDown"
						@pointermove="onProgressMove"
						@pointerup="onProgressUp"
						@keydown="onProgressKey"
						@click="seek"
					>
						<div ref="fill" class="progress-fill" />
						<div ref="thumb" class="progress-thumb" />
					</div>

					<div class="control-row">
						<button class="icon-btn" :title="modeTip" aria-label="切换播放模式" @click="cycleMode">
							<Icon :name="modeIcon" />
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
						<button class="icon-btn" :title="muted ? '取消静音' : '静音'" aria-label="静音开关" @click="toggleMute">
							<Icon :name="muted || !volume ? 'tabler:volume-3' : 'tabler:volume'" />
						</button>
					</div>

					<div class="time-volume">
						<span ref="cur-time" class="time-label">0:00</span>
						<span class="time-label">/</span>
						<span ref="dur" class="time-label">0:00</span>
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
	</Transition>

	<button
		class="capsule"
		:aria-label="expanded ? '收起播放器' : '打开播放器'"
		:aria-expanded="expanded"
		@click="expanded = !expanded"
	>
		<div class="capsule-cover" :class="{ spinning: playing }">
			<img v-if="currentSong?.pic" :src="currentSong.pic" alt="" loading="lazy" referrerpolicy="no-referrer">
			<Icon v-else-if="status === 'error'" name="tabler:music-off" />
			<Icon v-else name="tabler:music" />
		</div>
		<span v-if="playing" class="capsule-wave">
			<i /><i /><i />
		</span>
	</button>

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

.music-panel {
	position: absolute;
	inset-inline-start: 0;
	bottom: calc(100% + 0.8rem);
	display: flex;
	flex-direction: column;
	overflow: hidden;
	width: 20rem;
	max-width: calc(100vw - 2rem);
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
}

.panel-tabs {
	display: flex;
	gap: 0.4em;
	padding: 0 0.8em 0.5em;

	button {
		display: flex;
		gap: 0.3em;
		align-items: center;
		padding: 0.25em 0.7em;
		border-radius: 2em;
		background-color: var(--c-bg-2);
		font: inherit;
		font-size: 0.85em;
		color: var(--c-text-2);
		cursor: pointer;
		transition: all 0.2s;

		&.active {
			background-color: var(--ld-bg-active);
			color: var(--c-primary);
		}
	}
}

.playlist,
.lyrics {
	flex: 1 1 auto;
	overflow: auto;
	min-height: 10rem;
	overscroll-behavior: contain;
}

.playlist {
	list-style: none;
	padding: 0 0.6em;

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

.lyrics {
	padding: 0.5em 1em;
	text-align: center;

	.lyric-line {
		padding: 0.35em 0;
		font-size: 0.9em;
		line-height: 1.6;
		color: var(--c-text-2);
		transition: color 0.2s, transform 0.2s;

		&.active {
			color: var(--c-text-1);
			transform: scale(1.02);
		}

		.word {
			transition: color 0.25s;

			&.on {
				color: var(--c-primary);
			}
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

	.progress {
		position: relative;
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

	.control-row {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-top: 0.3em;
	}

	.play-btn {
		font-size: 1.6em;
	}

	.time-volume {
		display: flex;
		gap: 0.5em;
		align-items: center;

		.time-label {
			flex-shrink: 0;
			font-size: 0.75em;
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

.capsule {
	position: relative;
	display: grid;
	place-items: center;
	width: 3.2rem;
	height: 3.2rem;
	padding: 0.25rem;
	border: 1px solid var(--c-border);
	border-radius: 50%;
	background-color: var(--ld-bg-blur);
	backdrop-filter: blur(0.5rem);
	box-shadow: var(--box-shadow-1), var(--box-shadow-2);
	color: var(--c-text-2);
	cursor: pointer;
	transition: color 0.2s, box-shadow 0.2s;

	&:hover {
		color: var(--c-primary);
		box-shadow: var(--box-shadow-2), var(--box-shadow-3);
	}

	.capsule-cover {
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
			padding: 0.7em;
			width: 100%;
			height: 100%;
		}
	}

	.capsule-wave {
		position: absolute;
		right: -0.15em;
		bottom: -0.15em;
		display: flex;
		gap: 2px;
		align-items: flex-end;
		height: 0.9em;
		padding: 0.15em 0.3em;
		border-radius: 2em;
		background-color: var(--c-primary);
		color: var(--c-bg);

		i {
			width: 2px;
			height: 100%;
			border-radius: 1px;
			background-color: currentcolor;
			animation: wave 0.9s ease-in-out infinite;

			&:nth-child(2) {
				animation-delay: 0.15s;
			}

			&:nth-child(3) {
				animation-delay: 0.3s;
			}
		}
	}
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

@keyframes wave {
	0%,
	100% {
		transform: scaleY(0.4);
	}

	50% {
		transform: scaleY(1);
	}
}

@media (prefers-reduced-motion: reduce) {
	.capsule-cover.spinning,
	.capsule-wave i {
		animation: none;
	}

	.progress-thumb,
	.progress-fill,
	.lyric-line,
	.word {
		transition: none;
	}
}

@media (max-width: $breakpoint-mobile) {
	.music-panel {
		width: min(85vw, 20rem);
		max-height: min(60vh, 30rem);
	}
}
</style>

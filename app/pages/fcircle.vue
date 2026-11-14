<script setup lang="ts">
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

interface FcircleResponse {
	sites: FcircleSite[]
	stats?: { sites: number, posts: number, failed: number }
	generatedAt: number
}

const appConfig = useAppConfig()
useSeoMeta({
	title: '朋友圈',
	description: `${appConfig.title}的朋友圈，聚合了友链博客的最新文章。`,
})

const layoutStore = useLayoutStore()
layoutStore.setAside(['blog-greeting', 'blog-stats', 'blog-log'])

const CACHE_KEY = 'fcircle.cache'
const CACHE_TTL = 30 * 60 * 1000

const status = ref<'loading' | 'ready' | 'error'>('loading')
const response = ref<FcircleResponse | null>(null)
const refreshing = ref(false)

const posts = computed(() => {
	const list = response.value?.sites.flatMap(site => site.posts.map(post => ({ site, post }))) ?? []
	return list
		.sort((a, b) => b.post.date - a.post.date)
		.slice(0, 60)
})

const generatedText = computed(() => {
	const at = response.value?.generatedAt
	if (!at)
		return ''
	return timeAgo(at)
})

function timeAgo(ts: number): string {
	const diff = Math.max(0, Date.now() - ts)
	if (diff < 60_000)
		return '刚刚'
	if (diff < 60 * 60 * 1000)
		return `${Math.floor(diff / 60_000)} 分钟前`
	if (diff < 24 * 60 * 60 * 1000)
		return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`
	if (diff < 30 * 24 * 60 * 60 * 1000)
		return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`
	return new Date(ts).toLocaleDateString('zh-CN')
}

function postTimeAgo(ts: number): string {
	return timeAgo(ts)
}

function readCache(): FcircleResponse | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY)
		if (!raw)
			return null
		const parsed = JSON.parse(raw)
		if (Date.now() - (parsed.at ?? 0) > CACHE_TTL)
			return null
		return parsed.value as FcircleResponse
	}
	catch {
		return null
	}
}

function writeCache(value: FcircleResponse) {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify({ value, at: Date.now() }))
	}
	catch {}
}

async function load(force = false) {
	if (force) {
		refreshing.value = true
	}
	else {
		status.value = 'loading'
	}
	try {
		const data = await $fetch<FcircleResponse>(`/api/fcircle${force ? '?refresh=1' : ''}`, { timeout: 60_000 })
		response.value = data
		writeCache(data)
		status.value = 'ready'
	}
	catch (e) {
		console.warn('朋友圈数据获取失败', e)
		if (response.value)
			status.value = 'ready' // 保留旧数据
		else
			status.value = 'error'
	}
	finally {
		refreshing.value = false
	}
}

function onAvatarError(payload: string | Event) {
	const e = payload instanceof Event ? payload : null
	const img = e?.target as HTMLImageElement | null
	if (img)
		img.style.visibility = 'hidden'
}

onMounted(() => {
	const cached = readCache()
	if (cached) {
		response.value = cached
		status.value = 'ready'
		// 静默后台刷新，保持新鲜
		load()
	}
	else {
		load()
	}
})
</script>

<template>
<div class="mobile-only">
	<BlogHeader to="/" suffix="朋友圈" tag="h1" />
</div>

<section class="fcircle-page">
	<header class="page-head">
		<h2 class="text-creative">
			<Icon name="tabler:planet" />
			朋友圈
		</h2>
		<p class="page-desc">
			聚合友链博客的最新文章，每 30 分钟自动刷新
			<span v-if="generatedText">· 更新于 {{ generatedText }}</span>
			<span v-if="response?.stats">· {{ response.stats.sites }} 个站点 / {{ response.stats.posts }} 篇文章</span>
		</p>
		<button class="refresh-btn" :disabled="refreshing" @click="load(true)">
			<Icon class="refresh-icon" :class="{ spinning: refreshing }" name="tabler:refresh" />
			{{ refreshing ? '刷新中…' : '刷新' }}
		</button>
	</header>

	<p v-if="status === 'loading' && !response" class="hint">
		<Icon class="pulse" name="tabler:loader-2" />
		正在抓取友链博客的最新文章，可能需要几十秒…
	</p>
	<p v-else-if="status === 'error'" class="hint">
		抓取失败了，<button class="link-btn" @click="load(true)">
			点此重试
		</button>
	</p>

	<div v-else-if="posts.length" class="fcircle-masonry">
		<article v-for="{ site, post } in posts" :key="post.link" class="fcircle-card card upraise">
			<a class="card-main" :href="post.link" target="_blank" rel="noopener noreferrer">
				<h3 class="post-title">{{ post.title }}</h3>
				<p v-if="post.summary" class="post-summary">{{ post.summary }}</p>
			</a>
			<footer class="card-foot">
				<a class="site-info" :href="site.link" target="_blank" rel="noopener noreferrer">
					<NuxtImg
						class="site-avatar"
						:src="site.avatar"
						:alt="`${site.name} 的头像`"
						width="20"
						height="20"
						loading="lazy"
						referrerpolicy="no-referrer"
						@error="onAvatarError"
					/>
					<span class="site-name">{{ site.name }}</span>
				</a>
				<time class="post-time" :datetime="new Date(post.date).toISOString()">
					{{ postTimeAgo(post.date) }}
				</time>
			</footer>
		</article>
	</div>

	<p v-else class="hint">
		暂时没有抓取到任何文章，稍后再来看看吧。
	</p>
</section>
</template>

<style lang="scss" scoped>
.fcircle-page {
	margin: 1rem;
}

.page-head {
	padding: 0.5em;

	h2 {
		display: flex;
		gap: 0.4em;
		align-items: center;
		margin-bottom: 0.3em;
		font-size: 1.5em;

		.iconify {
			color: var(--c-primary);
		}
	}

	.page-desc {
		font-size: 0.85em;
		color: var(--c-text-2);
	}

	.refresh-btn {
		display: inline-flex;
		gap: 0.4em;
		align-items: center;
		margin-top: 0.6em;
		padding: 0.3em 0.9em;
		border: 1px solid var(--c-border);
		border-radius: 2em;
		background-color: var(--c-bg-2);
		font: inherit;
		font-size: 0.85em;
		color: var(--c-text-2);
		cursor: pointer;
		transition: all 0.2s;

		&:hover:not(:disabled) {
			border-color: var(--c-primary);
			color: var(--c-primary);
		}

		&:disabled {
			cursor: wait;
			opacity: 0.7;
		}

		.refresh-icon.spinning {
			animation: rotate 1s linear infinite;
		}
	}
}

.hint {
	padding: 2em 0;
	text-align: center;
	color: var(--c-text-3);

	.iconify {
		margin-inline-end: 0.4em;
		vertical-align: -0.15em;
	}
}

.pulse {
	animation: pulse 1.2s ease-in-out infinite;
}

.link-btn {
	display: inline;
	font: inherit;
	color: var(--c-primary);
	cursor: pointer;
}

.fcircle-masonry {
	column-count: 3;
	column-gap: 0.8rem;
	padding: 0.8rem 0;

	@media (max-width: $breakpoint-mobile) {
		column-count: 2;
	}

	@media (max-width: $breakpoint-phone) {
		column-count: 1;
	}
}

.fcircle-card {
	display: inline-block;
	overflow: hidden;
	width: 100%;
	margin-bottom: 0.8rem;
	padding: 0.7em 0.9em;
	border-radius: 0.8rem;
	break-inside: avoid;

	.card-main {
		display: block;

		.post-title {
			font-size: 0.95em;
			line-height: 1.5;
			color: var(--c-text-1);
			transition: color 0.2s;
		}

		&:hover .post-title {
			color: var(--c-primary);
		}

		.post-summary {
			display: -webkit-box;
			overflow: hidden;
			margin-top: 0.3em;
			font-size: 0.85em;
			line-height: 1.5;
			color: var(--c-text-2);
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 3;
			line-clamp: 3;
		}
	}

	.card-foot {
		display: flex;
		gap: 0.5em;
		align-items: center;
		justify-content: space-between;
		margin-top: 0.6em;
		padding-top: 0.5em;
		border-top: 1px solid var(--c-border);

		.site-info {
			display: flex;
			gap: 0.4em;
			align-items: center;
			min-width: 0;

			.site-avatar {
				flex-shrink: 0;
				width: 1.4em;
				height: 1.4em;
				border-radius: 50%;
				object-fit: cover;
			}

			.site-name {
				overflow: hidden;
				font-size: 0.8em;
				white-space: nowrap;
				text-overflow: ellipsis;
				color: var(--c-text-2);
				transition: color 0.2s;
			}

			&:hover .site-name {
				color: var(--c-primary);
			}
		}

		.post-time {
			flex-shrink: 0;
			font-size: 0.75em;
			color: var(--c-text-3);
		}
	}
}

@keyframes rotate {
	to {
		transform: rotate(360deg);
	}
}

@keyframes pulse {
	50% {
		opacity: 0.4;
	}
}

@media (prefers-reduced-motion: reduce) {
	.refresh-icon.spinning,
	.pulse {
		animation: none;
	}
}
</style>

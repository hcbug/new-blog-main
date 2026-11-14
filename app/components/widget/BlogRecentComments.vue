<script setup lang="ts">
interface RecentComment {
	id: string
	nick: string
	avatar: string
	url: string
	created: number
	comment: string
	commentText?: string
}

interface PreviewPart {
	type: 'text' | 'img'
	text?: string
	src?: string
}

interface DisplayComment {
	id: string
	nick: string
	avatar: string
	link: string
	timeText: string
	parts: PreviewPart[]
	plain: string
}

const appConfig = useAppConfig()

const status = ref<'loading' | 'success' | 'error'>('loading')
const comments = ref<DisplayComment[]>([])

/**
 * 把 Twikoo 返回的评论 HTML 转成安全的展示片段：
 * 只保留文本与 http(s) 表情图片，脚本/样式/内嵌框架一律丢弃。
 */
function parseComment(html: string): PreviewPart[] {
	if (!html || typeof DOMParser === 'undefined')
		return []
	const doc = new DOMParser().parseFromString(html, 'text/html')
	const parts: PreviewPart[] = []
	let images = 0

	const visit = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const value = node.textContent?.trim()
			if (value)
				parts.push({ type: 'text', text: value })
			return
		}
		if (!(node instanceof Element))
			return
		if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(node.tagName))
			return
		if (node.tagName === 'IMG' && images < 3) {
			const src = node.getAttribute('src') || ''
			if (/^https?:\/\//i.test(src)) {
				images++
				parts.push({ type: 'img', src })
			}
			return
		}
		node.childNodes.forEach(visit)
		if (['P', 'DIV', 'LI', 'BR'].includes(node.tagName))
			parts.push({ type: 'text', text: ' ' })
	}

	doc.body.childNodes.forEach(visit)
	return parts
}

/** 中文相对时间：秒级时间戳 → “刚刚 / N 分钟前 / …” */
function relTime(created: number): string {
	const diff = Math.max(0, Math.floor(Date.now() / 1000) - created)
	if (diff < 60)
		return '刚刚'
	const units: [number, string][] = [
		[60 * 60 * 24 * 365, '年前'],
		[60 * 60 * 24 * 30, '个月前'],
		[60 * 60 * 24, '天前'],
		[60 * 60, '小时前'],
		[60, '分钟前'],
	]
	for (const [sec, label] of units) {
		if (diff >= sec)
			return `${Math.floor(diff / sec)}${label}`
	}
	return '刚刚'
}

/** 等待全局 twikoo 脚本加载完成 */
function waitTwikoo(timeout = 8000): Promise<boolean> {
	return new Promise((resolve) => {
		const started = Date.now()
		const check = () => {
			if ((window as any).twikoo)
				return resolve(true)
			if (Date.now() - started > timeout)
				return resolve(false)
			setTimeout(check, 200)
		}
		check()
	})
}

async function loadComments() {
	try {
		if (!await waitTwikoo())
			throw new Error('twikoo 脚本加载超时')

		const list: RecentComment[] = await (window as any).twikoo.getRecentComments({
			envId: appConfig.twikoo.envId,
			region: '',
			pageSize: 5,
			includeReply: true,
		})
		if (!Array.isArray(list))
			throw new Error('评论数据格式异常')

		comments.value = list
			.filter(item => item && typeof item === 'object')
			.map((item) => {
				const html = item.comment || ''
				const parts = parseComment(html)
				return {
					id: item.id,
					nick: item.nick || '匿名',
					avatar: item.avatar || appConfig.author.avatar,
					link: `${item.url || '/'}${item.id ? `#${item.id}` : ''}`,
					timeText: item.created ? relTime(item.created) : '',
					parts,
					plain: parts.filter(p => p.type === 'text').map(p => p.text).join('').replace(/\s+/g, ' ').trim(),
				}
			})
			.filter(item => item.plain || item.parts.some(p => p.type === 'img'))
		status.value = 'success'
	}
	catch (e) {
		console.warn('最近评论获取失败', e)
		status.value = 'error'
	}
}

function onAvatarError(payload: string | Event) {
	const e = payload instanceof Event ? payload : null
	const img = e?.target as HTMLImageElement | null
	if (img && img.src !== appConfig.author.avatar)
		img.src = appConfig.author.avatar
}

onMounted(loadComments)
</script>

<template>
<BlogWidget card title="最近评论">
	<template #title>
		<Icon name="tabler:messages" />
		最近评论
	</template>

	<p v-if="status === 'loading'" class="hint">
		<Icon class="pulse" name="tabler:loader-2" />
		正在获取评论…
	</p>
	<p v-else-if="status === 'error'" class="hint">
		评论获取失败，<button class="link-btn" @click="loadComments">
			点此重试
		</button>
	</p>
	<p v-else-if="!comments.length" class="hint">
		还没有评论，来留下第一条吧！
	</p>

	<ul v-else class="comment-list">
		<li v-for="item in comments" :key="item.id">
			<a class="comment-item" :href="item.link">
				<NuxtImg
					class="avatar"
					:src="item.avatar"
					:alt="`${item.nick} 的头像`"
					width="36"
					height="36"
					loading="lazy"
					referrerpolicy="no-referrer"
					@error="onAvatarError"
				/>
				<div class="comment-body">
					<div class="comment-meta">
						<span class="nick">{{ item.nick }}</span>
						<span class="time">{{ item.timeText }}</span>
					</div>
					<div class="comment-preview">
						<template v-for="(part, index) in item.parts" :key="index">
							<img
								v-if="part.type === 'img'"
								class="emoji"
								:src="part.src"
								alt="[表情]"
								loading="lazy"
								referrerpolicy="no-referrer"
							>
							<span v-else>{{ part.text }}</span>
						</template>
					</div>
				</div>
			</a>
		</li>
	</ul>
</BlogWidget>
</template>

<style lang="scss" scoped>
.hint {
	padding: 0.4em 0;
	font-size: 0.9em;
	color: var(--c-text-2);

	> .iconify {
		margin-inline-end: 0.3em;
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

.comment-list {
	list-style: none;

	li + li {
		margin-top: 0.2em;
	}
}

.comment-item {
	display: flex;
	gap: 0.5em;
	align-items: flex-start;
	padding: 0.4em 0.3em;
	border-radius: 0.5em;
	transition: background-color 0.2s;

	&:hover {
		background-color: var(--c-bg-soft);
	}

	.avatar {
		flex-shrink: 0;
		width: 2.2em;
		height: 2.2em;
		border-radius: 50%;
		object-fit: cover;
	}
}

.comment-body {
	min-width: 0;
}

.comment-meta {
	display: flex;
	gap: 0.5em;
	align-items: baseline;

	.nick {
		font-weight: 600;
		color: var(--c-text-1);
	}

	.time {
		flex-shrink: 0;
		font-size: 0.8em;
		color: var(--c-text-3);
	}
}

.comment-preview {
	display: -webkit-box;
	overflow: hidden;
	font-size: 0.85em;
	line-height: 1.5;
	color: var(--c-text-2);
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;

	.emoji {
		height: 1.2em;
		margin: 0 0.1em;
		vertical-align: -0.25em;
	}
}

@keyframes pulse {
	50% {
		opacity: 0.4;
	}
}

@media (prefers-reduced-motion: reduce) {
	.pulse {
		animation: none;
	}
}
</style>

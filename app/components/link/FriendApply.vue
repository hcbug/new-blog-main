<script setup lang="ts">
/**
 * 友链申请：粘贴任意格式的博客信息 → 纯正则解析 → 预览卡片（头像取主色）
 * → 通过 Twikoo 评论接口提交到 /friend-apply 页面，站长在 Twikoo 后台即可看到。
 * 不需要任何后端服务，适合无数据库的博客。
 */
const appConfig = useAppConfig()
const { show } = useToast()

interface Parsed {
	name: string
	link: string
	avatar: string
	desc: string
}

const raw = ref('')
const parsed = ref<Parsed | null>(null)
const themeColor = ref('')
const state = ref<'idle' | 'submitting' | 'done'>('idle')

const URL_RE = /https?:\/\/[^\s"'<>，。；;、()（）[\]{}]+/g

function cleanUrl(url: string): string {
	return url.replace(/[),.。，；;]+$/, '')
}

/** 常见格式逐行提取，失败则按“第一个 URL 是链接、第二个是头像”兜底 */
function parseInput(text: string): Parsed | null {
	const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean)
	if (!lines.length)
		return null

	const findField = (re: RegExp) => {
		for (const line of lines) {
			const match = line.match(re)
			if (match?.[1])
				return match[1].trim()
		}
		return ''
	}

	let name = findField(/^(?:名称|名字|昵称|标题|站名|title|name|sitename)\s*[：:=]\s*(\S.*)$/i)
	let link = findField(/^(?:链接|网址|地址|url|link|站点|blog)\s*[：:=]\s*(https?:\/\/\S+)/i)
	let avatar = findField(/^(?:头像|avatar|logo|图标)\s*[：:=]\s*(https?:\/\/\S+)/i)
	let desc = findField(/^(?:描述|简介|介绍|描述信息|desc(?:ription)?|bio|签名)\s*[：:=]\s*(\S.*)$/i)

	const urls = text.match(URL_RE)?.map(cleanUrl) ?? []
	if (!link && urls.length)
		link = urls.shift() ?? ''
	if (!avatar && urls.length)
		avatar = urls.shift() ?? ''

	if (!name) {
		for (const line of lines) {
			const clean = line.replace(/^[-*•#\s]+/, '')
			if (clean && !/^https?:\/\//.test(clean) && !/^[^：:=]{1,10}[：:=]/.test(line)) {
				name = clean.slice(0, 60)
				break
			}
		}
	}

	if (!desc) {
		for (const line of lines) {
			const clean = line.replace(/^[-*•#\s]+/, '')
			if (clean && clean !== name && clean !== link && clean !== avatar && clean.length >= 5 && !/^https?:\/\//.test(clean) && !/^[^：:=]{1,10}[：:=]/.test(line)) {
				desc = clean.slice(0, 120)
				break
			}
		}
	}

	if (!link)
		return null
	return {
		name: name || '未命名博客',
		link,
		avatar,
		desc,
	}
}

/** 从头像取主色作为预览卡片主题色（跨域失败时退回主题色） */
async function extractThemeColor(url: string): Promise<string> {
	if (!url)
		return ''
	return new Promise((resolve) => {
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => {
			try {
				const canvas = document.createElement('canvas')
				canvas.width = 1
				canvas.height = 1
				const ctx = canvas.getContext('2d')
				if (!ctx) {
					resolve('')
					return
				}
				ctx.drawImage(img, 0, 0, 1, 1)
				const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
				resolve(`rgb(${r}, ${g}, ${b})`)
			}
			catch {
				resolve('')
			}
		}
		img.onerror = () => resolve('')
		img.src = url
	})
}

const parsedDebounced = refDebounced(raw, 400)
watch(parsedDebounced, async (text) => {
	const result = parseInput(text)
	parsed.value = result
	themeColor.value = result?.avatar ? await extractThemeColor(result.avatar) : ''
	if (state.value === 'done' && result)
		state.value = 'idle'
})

function copyJson() {
	if (!parsed.value)
		return
	const json = JSON.stringify({
		author: parsed.value.name,
		title: parsed.value.name,
		desc: parsed.value.desc,
		link: parsed.value.link,
		feed: '',
		icon: parsed.value.avatar,
		avatar: parsed.value.avatar,
		date: new Date().toISOString().slice(0, 10),
	}, null, 2)
	useClipboard({ source: json, legacy: true }).copy()
	show('已复制友链 JSON，可直接发给站长', { icon: 'tabler:copy' })
}

/** 通过 Twikoo 评论接口提交申请（无需后端） */
async function submit() {
	if (!parsed.value || state.value === 'submitting')
		return
	state.value = 'submitting'
	try {
		const body = {
			event: 'COMMENT_SUBMIT',
			url: `${location.origin}/friend-apply`,
			comment: [
				`博客名称：${parsed.value.name}`,
				`博客链接：${parsed.value.link}`,
				parsed.value.avatar ? `头像地址：${parsed.value.avatar}` : '',
				parsed.value.desc ? `博客简介：${parsed.value.desc}` : '',
				'',
				'---- 来自友链申请表单（自动解析）----',
			].filter(Boolean).join('\n'),
			nick: parsed.value.name,
			mail: '',
			link: parsed.value.link,
			ua: navigator.userAgent,
		}
		const res = await $fetch(appConfig.twikoo.envId, { method: 'POST', body })
		if ((res as { code?: number })?.code !== 0)
			throw new Error('Twikoo 返回异常')
		state.value = 'done'
		show('友链申请已提交！站长审核后会添加你的博客', { icon: 'tabler:check' })
	}
	catch (e) {
		console.warn('友链申请提交失败', e)
		state.value = 'idle'
		show('提交失败，可以先复制 JSON 通过其他方式联系站长', { icon: 'tabler:alert-triangle' })
	}
}
</script>

<template>
<section class="friend-apply">
	<h3 class="apply-title text-creative">
		<Icon name="tabler:link-plus" />
		申请友链
	</h3>
	<p class="apply-desc">
		把博客信息（名称 / 链接 / 头像 / 简介）整段粘贴进来，自动解析并提交给站长审核。
		支持「名称：xx 链接：xx」与「- 名称 - 链接」等常见格式。
	</p>

	<textarea
		v-model="raw"
		class="apply-input"
		rows="5"
		placeholder="例如：&#10;名称：小明的博客&#10;链接：https://example.com/&#10;头像：https://example.com/avatar.png&#10;简介：记录生活的点滴"
		aria-label="粘贴博客信息"
	/>

	<div v-if="parsed" class="apply-preview" :style="themeColor ? { '--apply-color': themeColor } : undefined">
		<h4 class="preview-label">
			解析预览
		</h4>
		<div class="preview-card">
			<NuxtImg
				v-if="parsed.avatar"
				class="preview-avatar"
				:src="parsed.avatar"
				:alt="`${parsed.name} 的头像`"
				width="48"
				height="48"
				loading="lazy"
				referrerpolicy="no-referrer"
			/>
			<Icon v-else class="preview-avatar preview-avatar-fallback" name="tabler:photo" />
			<div class="preview-info">
				<p class="preview-name">
					{{ parsed.name }}
				</p>
				<a class="preview-link" :href="parsed.link" target="_blank" rel="noopener noreferrer">
					{{ parsed.link }}
				</a>
				<p v-if="parsed.desc" class="preview-desc">
					{{ parsed.desc }}
				</p>
			</div>
		</div>
		<p v-if="!parsed.avatar" class="preview-warn">
			未识别到头像地址，也可以继续提交（站长会使用默认头像）
		</p>
	</div>

	<p v-else-if="raw.trim()" class="preview-warn">
		暂时没有识别出链接，请检查内容里是否包含 http(s) 开头的网址
	</p>

	<div class="apply-actions">
		<ZButton
			primary
			:disabled="!parsed || state === 'submitting' || state === 'done'"
			:text="state === 'submitting' ? '提交中…' : state === 'done' ? '已提交 ✓' : '提交申请'"
			@click="submit"
		/>
		<ZButton
			:disabled="!parsed"
			text="复制 JSON"
			@click="copyJson"
		/>
	</div>

	<p v-if="state === 'done'" class="apply-tip">
		申请已送达站长，通过后会出现在友链列表中，感谢支持！
	</p>
</section>
</template>

<style lang="scss" scoped>
.friend-apply {
	margin: 2rem 1rem 1rem;
	padding: 1em;
	border-radius: 0.8em;
	background-color: var(--c-bg-2);
}

.apply-title {
	display: flex;
	gap: 0.4em;
	align-items: center;
	font-size: 1.15em;

	.iconify {
		color: var(--c-primary);
	}
}

.apply-desc {
	margin-top: 0.4em;
	font-size: 0.85em;
	color: var(--c-text-2);
}

.apply-input {
	display: block;
	width: 100%;
	margin-top: 0.8em;
	padding: 0.7em 0.9em;
	border: 1px solid var(--c-border);
	border-radius: 0.6em;
	background-color: var(--c-bg);
	font: inherit;
	font-size: 0.9em;
	line-height: 1.6;
	color: var(--c-text-1);
	resize: vertical;
	transition: border-color 0.2s;

	&:focus {
		border-color: var(--c-primary);
		outline: none;
	}
}

.apply-preview {
	--apply-color: var(--c-primary);

	margin-top: 1em;

	.preview-label {
		margin-bottom: 0.5em;
		font: inherit;
		font-size: 0.85em;
		color: var(--c-text-2);
	}

	.preview-card {
		display: flex;
		gap: 0.8em;
		align-items: center;
		padding: 0.8em;
		border: 1px solid color-mix(in srgb, var(--apply-color) 40%, var(--c-border));
		border-radius: 0.8em;
		background: linear-gradient(120deg, color-mix(in srgb, var(--apply-color) 10%, transparent), transparent 60%);
	}

	.preview-avatar {
		flex-shrink: 0;
		width: 3em;
		height: 3em;
		border-radius: 50%;
		object-fit: cover;
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--apply-color) 30%, transparent);
	}

	.preview-avatar-fallback {
		padding: 0.7em;
		color: var(--c-text-3);
	}

	.preview-info {
		min-width: 0;

		.preview-name {
			font-weight: 600;
			color: var(--c-text-1);
		}

		.preview-link {
			display: block;
			overflow: hidden;
			font-size: 0.85em;
			white-space: nowrap;
			text-overflow: ellipsis;
			color: var(--apply-color);
		}

		.preview-desc {
			margin-top: 0.2em;
			font-size: 0.85em;
			color: var(--c-text-2);
		}
	}
}

.preview-warn {
	margin-top: 0.6em;
	font-size: 0.85em;
	color: var(--c-warning);
}

.apply-actions {
	display: flex;
	gap: 0.8em;
	margin-top: 1em;
}

.apply-tip {
	margin-top: 0.8em;
	font-size: 0.85em;
	color: var(--c-success);
}
</style>

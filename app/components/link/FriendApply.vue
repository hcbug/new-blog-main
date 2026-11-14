<script setup lang="ts">
/**
 * 友链申请：粘贴任意格式的博客信息 → 纯正则解析 → 预览卡片（头像取主色）
 * → 通过 Twikoo 评论接口提交到 /friend-apply 页面（站长在 Twikoo 后台可见）。
 * 当 Twikoo 开启 Cloudflare Turnstile 验证码时，自动加载验证组件并在提交前获取 token。
 */
const appConfig = useAppConfig()
const { show } = useToast()

interface Parsed {
	name: string
	link: string
	avatar: string
	desc: string
	feed: string
}

const raw = ref('')
const parsed = ref<Parsed | null>(null)
const themeColor = ref('')
const state = ref<'idle' | 'submitting' | 'done'>('idle')

const captchaEl = useTemplateRef<HTMLDivElement>('captcha')
const captcha = ref<{ provider: string, siteKey: string }>({ provider: '', siteKey: '' })
let turnstileId: string | undefined

const URL_RE = /https?:\/\/[^\s"'<>，。；;、()（）[\]{}]+/g
const FIELD_NAME_RE = /^(?:名称|名字|昵称|标题|站名|title|name|sitename|author|博主)\s*[：:=]\s*(\S.*)$/i
const FIELD_LINK_RE = /^(?:链接|网址|地址|站点|blog|url|link)\s*[：:=]\s*(https?:\/\/\S+)/i
const FIELD_AVATAR_RE = /^(?:头像|avatar|logo|图标)\s*[：:=]\s*(https?:\/\/\S+)/i
const FIELD_DESC_RE = /^(?:描述|简介|介绍|描述信息|desc(?:ription)?|bio|签名)\s*[：:=]\s*(\S.*)$/i
const FIELD_FEED_RE = /^(?:feed|订阅|订阅源|rss|atom)\s*[：:=]\s*(https?:\/\/\S+)/i
const IMG_EXT_RE = /\.(?:png|jpe?g|gif|webp|avif|svg|ico)(?:[?#/]|$)/i

function cleanUrl(url: string): string {
	return url.replace(/[),.。，；;]+$/, '')
}

/** 常见格式逐行提取；识别不出的字段按 URL 特征兜底 */
function parseInput(text: string): Parsed | null {
	const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean)
	if (!lines.length)
		return null

	// 去掉行首列表符号，兼容 "- 名称：xx" 这类 Markdown 写法
	const cleaned = lines.map(line => line.replace(/^[-*•#\s]+/, '').trim()).filter(Boolean)

	const findField = (re: RegExp) => {
		for (const line of cleaned) {
			const match = line.match(re)
			if (match?.[1])
				return match[1].trim()
		}
		return ''
	}

	let name = findField(FIELD_NAME_RE)
	let link = findField(FIELD_LINK_RE)
	let avatar = findField(FIELD_AVATAR_RE)
	let desc = findField(FIELD_DESC_RE)
	let feed = findField(FIELD_FEED_RE)

	const urls = text.match(URL_RE)?.map(cleanUrl) ?? []
	// 博客链接优先取第一个 URL；头像必须排除链接本身，避免张冠李戴
	if (!link && urls.length)
		link = urls.shift() ?? ''
	if (!avatar && urls.length) {
		const index = urls.findIndex(url => url !== link)
		if (index >= 0)
			avatar = urls.splice(index, 1)[0] ?? ''
	}
	if (!feed)
		feed = urls.find(url => /rss|atom|feed|\.xml/i.test(url)) ?? ''
	if (!avatar)
		avatar = urls.find(url => IMG_EXT_RE.test(url)) ?? ''

	// 名称兜底：第一条既不是 URL、也不是“字段：值”样式的行
	if (!name) {
		for (const line of cleaned) {
			if (line && !/^https?:\/\//.test(line) && !/^[^：:=]{1,12}[：:=]/.test(line)) {
				name = line.slice(0, 60)
				break
			}
		}
	}

	// 描述兜底：第一条较长的普通文本行
	if (!desc) {
		for (const line of cleaned) {
			if (line && line !== name && line !== link && line !== avatar && line !== feed
				&& line.length >= 5 && !/^https?:\/\//.test(line) && !/^[^：:=]{1,12}[：:=]/.test(line)) {
				desc = line.slice(0, 120)
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
		feed,
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
		feed: parsed.value.feed,
		icon: parsed.value.avatar,
		avatar: parsed.value.avatar,
		date: new Date().toISOString().slice(0, 10),
	}, null, 2)
	useClipboard({ source: json, legacy: true }).copy()
	show('已复制友链 JSON，可直接发给站长', { icon: 'tabler:copy' })
}

/** 读取 Twikoo 公开配置，判断是否启用了验证码 */
async function loadCaptchaConfig() {
	try {
		const res = await $fetch<{ config?: { CAPTCHA_PROVIDER?: string, TURNSTILE_SITE_KEY?: string } }>(
			appConfig.twikoo.envId,
			{ method: 'POST', body: { event: 'GET_CONFIG' } },
		)
		const config = res?.config ?? {}
		const provider = config.CAPTCHA_PROVIDER || (config.TURNSTILE_SITE_KEY ? 'Turnstile' : '')
		captcha.value = { provider, siteKey: config.TURNSTILE_SITE_KEY ?? '' }
	}
	catch (e) {
		console.warn('验证码配置获取失败', e)
	}
}

function loadTurnstileScript(): Promise<boolean> {
	return new Promise((resolve) => {
		if (window.turnstile)
			return resolve(true)
		const script = document.createElement('script')
		script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
		script.async = true
		script.onload = () => resolve(true)
		script.onerror = () => resolve(false)
		document.head.appendChild(script)
	})
}

/** 渲染 Turnstile 验证组件，挑战成功后拿到 token */
async function runTurnstile(): Promise<string> {
	const el = captchaEl.value
	const ok = await loadTurnstileScript()
	const turnstile = window.turnstile
	if (!ok || !el || !turnstile)
		throw new Error('验证码组件加载失败，请刷新后重试')
	el.innerHTML = ''
	return new Promise<string>((resolve, reject) => {
		const cleanup = () => {
			if (turnstileId)
				turnstile.remove(turnstileId)
			turnstileId = undefined
			el.innerHTML = ''
		}
		turnstileId = turnstile.render(el, {
			'sitekey': captcha.value.siteKey,
			'callback': (token: string) => {
				cleanup()
				resolve(token)
			},
			'error-callback': () => {
				cleanup()
				reject(new Error('验证码校验失败，请重试'))
			},
			'expired-callback': () => {
				cleanup()
				reject(new Error('验证码已过期，请重试'))
			},
			'timeout-callback': () => {
				cleanup()
				reject(new Error('验证码超时，请重试'))
			},
		})
	})
}

/** 通过 Twikoo 评论接口提交申请（无需自建后端） */
async function submit() {
	if (!parsed.value || state.value === 'submitting')
		return
	state.value = 'submitting'
	try {
		// 站点开启了验证码时需要先完成人机校验
		if (captcha.value.provider === 'Turnstile' && captcha.value.siteKey) {
			const token = await runTurnstile()
			await postApplication(token)
		}
		else if (captcha.value.provider) {
			throw new Error(`当前验证码类型（${captcha.value.provider}）暂不支持，请复制 JSON 联系站长`)
		}
		else {
			await postApplication()
		}
	}
	catch (e) {
		console.warn('友链申请提交失败', e)
		state.value = 'idle'
		show(`提交失败：${e instanceof Error ? e.message : '未知错误'}`, { icon: 'tabler:alert-triangle', duration: 5000 })
	}
}

async function postApplication(turnstileToken?: string) {
	const payload: Record<string, unknown> = {
		event: 'COMMENT_SUBMIT',
		url: `${location.origin}/friend-apply`,
		comment: [
			`博客名称：${parsed.value?.name}`,
			`博客链接：${parsed.value?.link}`,
			parsed.value?.avatar ? `头像地址：${parsed.value.avatar}` : '',
			parsed.value?.feed ? `订阅地址：${parsed.value.feed}` : '',
			parsed.value?.desc ? `博客简介：${parsed.value.desc}` : '',
			'',
			'---- 来自友链申请表单（自动解析）----',
		].filter(Boolean).join('\n'),
		nick: parsed.value?.name,
		mail: '',
		link: parsed.value?.link,
		ua: navigator.userAgent,
	}
	if (turnstileToken)
		payload.turnstileToken = turnstileToken

	const res = await $fetch<{ code?: number, message?: string }>(appConfig.twikoo.envId, { method: 'POST', body: payload })
	if (res?.code !== 0)
		throw new Error(res?.message || '提交被拒绝，请稍后再试')
	state.value = 'done'
	show('友链申请已提交！站长审核后会添加你的博客', { icon: 'tabler:check' })
}

onMounted(loadCaptchaConfig)
</script>

<template>
<section class="friend-apply">
	<h3 class="apply-title text-creative">
		<Icon name="tabler:link-plus" />
		申请友链
	</h3>
	<p class="apply-desc">
		把博客信息（名称 / 链接 / 头像 / 简介 / 订阅源）整段粘贴进来，自动解析并提交给站长审核。
		支持「名称：xx 链接：xx」与「- 名称 - 链接」等常见格式。
	</p>

	<textarea
		v-model="raw"
		class="apply-input"
		rows="5"
		placeholder="标题：洪畅的博客&#10;介绍：想，全是问题；做，才有答案。&#10;网址：https://blog.hcbu.cn/&#10;头像：https://gitee.com/hcbug/picture1/raw/master/20260607223324364.webp&#10;RSS：https://blog.hcbu.cn/atom.xml"
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
				<p v-if="parsed.feed" class="preview-feed">
					<Icon name="tabler:rss" />
					{{ parsed.feed }}
				</p>
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

	<div v-if="captcha.provider === 'Turnstile'" ref="captcha" class="captcha-container" aria-label="人机验证" />

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

		.preview-link,
		.preview-feed {
			display: block;
			overflow: hidden;
			font-size: 0.85em;
			white-space: nowrap;
			text-overflow: ellipsis;
		}

		.preview-link {
			color: var(--apply-color);
		}

		.preview-feed {
			margin-top: 0.2em;
			color: var(--c-text-2);

			.iconify {
				margin-inline-end: 0.3em;
				vertical-align: -0.15em;
			}
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

.captcha-container {
	display: flex;
	justify-content: center;
	margin-top: 1em;

	&:empty {
		display: none;
	}
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

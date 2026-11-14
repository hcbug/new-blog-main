<script setup lang="tsx">
import type { TippyComponent } from 'vue-tippy'

const appConfig = useAppConfig()

const commentEl = useTemplateRef('comment')
const popoverEl = useTemplateRef<TippyComponent>('popover')
const popoverJumpTo = ref('')
const popoverInputEl = useTemplateRef('popover-input')
const showUndo = ref(false)

const popoverBind = ref<TippyComponent['$props']>({})

/** 评论区链接守卫 */
useEventListener(commentEl, 'click', (e) => {
	if (!(e.target instanceof Element))
		return

	if (e.target.matches('.tk-avatar-img'))
		e.stopPropagation()

	const popoverTarget = e.target.closest('a[target="_blank"]')
	if (!(popoverTarget instanceof HTMLAnchorElement))
		return

	e.preventDefault()
	popoverEl.value?.hide()

	popoverJumpTo.value = safelyDecodeUriComponent(popoverTarget.href)
	popoverBind.value = {
		getReferenceClientRect: () => popoverTarget.getBoundingClientRect(),
		triggerTarget: popoverTarget,
	}

	nextTick(checkUndoable)
	popoverEl.value?.show()
}, { capture: true })

function checkUndoable() {
	showUndo.value = popoverInputEl.value?.textContent !== popoverJumpTo.value
}

function undo() {
	if (!popoverInputEl.value)
		return
	popoverInputEl.value.textContent = popoverJumpTo.value
	checkUndoable()
}

function confirmOpen() {
	window.open(popoverInputEl.value?.textContent, '_blank')
}

onMounted(() => {
	window.twikoo?.init?.({
		envId: appConfig.twikoo?.envId,
		el: '#twikoo',
		katex: window.katex,
	})
	if (commentEl.value)
		setupEmojiZoom(commentEl.value)
})

/**
 * 评论表情悬停放大：事件委托在评论区容器上，twikoo 重建 DOM 也无需重新绑定。
 * 手机端长按表情不弹系统菜单，避免误触。
 */
function setupEmojiZoom(root: HTMLElement) {
	const preview = document.createElement('div')
	preview.id = 'owo-zoom'
	preview.setAttribute('aria-hidden', 'true')
	document.body.appendChild(preview)

	let timer: ReturnType<typeof setTimeout> | null = null
	let lastSrc = ''

	const hide = () => {
		if (timer)
			clearTimeout(timer)
		timer = null
		preview.style.display = 'none'
		preview.innerHTML = ''
		lastSrc = ''
	}

	const show = (target: HTMLImageElement) => {
		hide()
		lastSrc = target.currentSrc || target.src
		timer = setTimeout(() => {
			const rect = target.getBoundingClientRect()
			const height = rect.height * 3
			const width = rect.width * 3
			let left = rect.left - (width - rect.width) / 2
			let top = rect.top
			if (left + width > window.innerWidth)
				left = window.innerWidth - width - 8
			if (left < 8)
				left = 8
			// 上方放不下就翻到图片下方
			if (top - height < 0)
				top = rect.bottom + 4
			preview.style.cssText = `display:flex;height:${height}px;width:${width}px;left:${left}px;top:${top}px`
			preview.innerHTML = `<img src="${lastSrc}" alt="">`
			timer = null
		}, 300)
	}

	root.addEventListener('mouseover', (e) => {
		const target = e.target
		if (!(target instanceof HTMLImageElement))
			return
		const src = target.currentSrc || target.src
		if (!src || src === lastSrc)
			return
		show(target)
	})

	root.addEventListener('mouseout', (e) => {
		const target = e.target
		if (!(target instanceof HTMLImageElement))
			return
		const related = e.relatedTarget
		if (related instanceof Node && target.contains(related))
			return
		hide()
	})

	root.addEventListener('contextmenu', (e) => {
		if (window.innerWidth <= 768)
			e.preventDefault()
	})
}
</script>

<template>
<section ref="comment" class="z-comment">
	<h3 class="text-creative">
		评论区
	</h3>

	<!-- interactive 默认会把气泡移动到 triggerTarget 的父元素上 -->
	<Tooltip
		ref="popover"
		v-bind="popoverBind"
		:append-to="() => commentEl!"
		interactive
		:aria="{ expanded: false }"
		trigger="focusin"
	>
		<template #content>
			<div class="popover-confirm">
				<span
					ref="popover-input"
					class="input"
					contenteditable="plaintext-only"
					spellcheck="false"
					@input="checkUndoable"
					@keydown.enter.prevent="confirmOpen"
					v-text="popoverJumpTo"
				/>

				<button
					v-if="showUndo"
					aria-label="恢复原始内容"
					@click="undo()"
				>
					<Icon name="tabler:arrow-back-up" />
				</button>

				<ZButton
					primary
					text="访问"
					@click="confirmOpen"
				/>
			</div>
		</template>
	</Tooltip>

	<div id="twikoo">
		<p>评论加载中...</p>
	</div>
</section>
</template>

<style lang="scss" scoped>
.z-comment {
	margin: 3rem 1rem;

	> h3 {
		margin-top: 3rem;
		font-size: 1.25rem;
	}
}

:deep() > [data-tippy-root] > .tippy-box {
	padding: 0;
}

.popover-confirm {
	display: flex;
	align-items: center;
	overflow-wrap: anywhere;

	> .input {
		min-width: 0;
		padding: 0.3em 0.6em;
		outline: none;
	}

	> button {
		flex-shrink: 0;
		align-self: stretch;
		padding: 0.3em;
		border-radius: 0 0.5em 0.5em 0;
	}
}

:deep(#twikoo) {
	margin: 2em 0;

	// 表情栏展开/收起动画：
	// display 用 allow-discrete 参与过渡（收起时 display:none 在过渡结束才生效），
	// 展开时借助 @starting-style 获得入场初始态，双向都有动画。
	.OwO .OwO-body {
		opacity: 0;
		transform: translateY(6px) scale(0.96);
		transform-origin: bottom left;
		transition:
			opacity 0.18s ease,
			transform 0.18s ease,
			display 0.18s allow-discrete;
	}

	.OwO.OwO-open .OwO-body {
		opacity: 1;
		transform: none;

		@starting-style {
			opacity: 0;
			transform: translateY(6px) scale(0.96);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.OwO .OwO-body,
		.OwO.OwO-open .OwO-body {
			transition: none;
		}
	}

	.tk-admin-container {
		position: fixed;
		z-index: calc(var(--z-index-popover) + 1);
	}

	.tk-input {
		font-family: var(--font-monospace);
	}

	.tk-avatar {
		border-radius: 50%;

		@supports (corner-shape: squircle) {
			corner-shape: superellipse(1.2);
		}

		&.tk-clickable {
			cursor: auto;
		}
	}

	.tk-time {
		color: var(--c-text-3);
	}

	.tk-content {
		margin-top: 0;
	}

	.tk-comments-title, .tk-nick {
		font-family: var(--font-creative);
	}

	.tk-owo-emotion {
		width: auto;
		height: 1.4em;
		vertical-align: text-bottom;
	}
	.OwO {
		.OwO-body {
			background-color: #E4E5E6 !important;
			border: 1px solid rgba(0, 0, 0, 0.1) !important;
			border-radius: 8px !important;
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1) !important;
			padding: 0 !important;
			overflow: hidden !important;

			html.dark & {
				background-color: #121314 !important;
				border-color: rgba(255, 255, 255, 0.08) !important;
				box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6) !important;
			}

			.OwO-items {
				padding: 15px !important;
				max-height: 320px !important;
				overflow-y: auto !important;
				color: #333 !important;

				html.dark & {
					color: #d1d1d1 !important;
				}

				&::-webkit-scrollbar { width: 6px; }
				&::-webkit-scrollbar-thumb { background-color: rgba(0, 0, 0, 0.2); border-radius: 4px; }
				html.dark &::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.15); }
			}

			.OwO-item {
				position: relative;
				min-width: 44px !important;
				min-height: 44px !important;
				padding: 4px !important;
				margin: 4px !important;
				display: inline-flex !important;
				justify-content: center;
				align-items: center;
				box-sizing: border-box;
				border-radius: 6px;
				white-space: nowrap !important;
				font-size: 16px;

				transition: transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28), background-color 0.2s !important;
				transform-origin: center center;

				img {
					width: 32px !important;
					height: 32px !important;
					max-width: 32px !important;
					max-height: 32px !important;
					object-fit: contain !important;
				}

				&:hover {
					z-index: 100;
					transform: scale(1.5) !important;
					background-color: #fff !important;
					box-shadow: 0 4px 16px rgba(0,0,0,0.15);

					html.dark & {
						background-color: #1a1b1e !important;
						box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255,255,255,0.1);
					}
				}
			}

			.OwO-bar {
				display: flex !important;
				flex-wrap: wrap !important;
				gap: 6px !important;
				padding: 10px !important;
				background-color: rgba(0, 0, 0, 0.05) !important;
				border-top: 1px solid rgba(0, 0, 0, 0.05) !important;
				border-radius: 0 0 8px 8px !important;

				html.dark & {
					background-color: #161618 !important;
					border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
				}

				span {
					margin: 0 !important;
					padding: 4px 10px !important;
					color: #666 !important;
					font-size: 13px;
					border-radius: 6px;
					cursor: pointer;
					transition: all 0.2s;

					&:hover {
						color: #111 !important;
						background-color: rgba(0, 0, 0, 0.08) !important;
					}
					&.OwO-item-active {
						color: #111 !important;
						background-color: rgba(0, 0, 0, 0.12) !important;
						font-weight: 500;
					}

					html.dark & {
						color: #888 !important;
						&:hover { color: #fff !important; background-color: rgba(255, 255, 255, 0.08) !important; }
						&.OwO-item-active { color: #fff !important; background-color: rgba(255, 255, 255, 0.15) !important; }
					}
				}
			}
		}
	}

	@media screen and (max-width: 768px) {
		.OwO .OwO-body {
			.OwO-item {
				width: 40px !important;
				height: 40px !important;
				margin: 2px !important;

				img {
					width: 30px !important;
					height: 30px !important;
				}

				&:hover img {
					transform: scale(1);
					padding: 0;
					background-color: transparent;
					box-shadow: none;
				}
			}
			.OwO-bar {
				gap: 4px !important;
				padding: 8px !important;
				span {
					font-size: 12px;
					padding: 3px 8px !important;
				}
			}
		}
	}

	@media screen and (max-width: 768px) {
		.OwO .OwO-body {
			.OwO-item {
				width: 40px !important;
				height: 40px !important;
				margin: 2px !important;

				img {
					width: 30px !important;
					height: 30px !important;
				}
			}
			.OwO-item:hover {
				background-color: transparent !important;
			}
		}
	}

	@media screen and (max-width: 768px) {
		.OwO .OwO-body {
			.OwO-item {
				width: 40px !important;
				height: 40px !important;
				margin: 2px !important;

				img {
					width: 30px !important;
					height: 30px !important;
				}
			}

			.OwO-item:hover {
				background-color: transparent;
			}
		}
	}

	@media screen and (max-width: 768px) {
		.OwO .OwO-body {
			.OwO-items {
				grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)) !important;
				gap: 4px !important;
			}
			.OwO-item:hover {
				background-color: transparent;
			}
		}
	}

	.tk-extras, .tk-footer {
		font-size: 0.7em;
		color: var(--c-text-3);
	}

	.tk-replies:not(.tk-replies-expand) {
		mask-image: linear-gradient(to top, transparent, #FFF 4em);
	}

	.tk-expand {
		border-radius: 0.5em;
		transition: background-color 0.1s;
	}

	.tippy-svg-arrow > svg {
		fill: inherit;
		width: auto;
		height: auto;
	}
}

:deep(:where(.tk-preview-container,.tk-content)) {
	pre {
		overflow: auto;
		border-radius: 0.5em;
		font-size: 0.85em;
	}

	a {
		margin: -0.1em -0.2em;
		padding: 0.1em 0.2em;
		background: linear-gradient(var(--c-primary-soft), var(--c-primary-soft)) no-repeat center bottom / 100% 0.1em;
		color: var(--c-primary);
		transition: all 0.2s;

		&:hover {
			border-radius: 0.3em;
			background-size: 100% 100%;
		}
	}

	p {
		margin: 0.2em 0;
	}

	img {
		border-radius: 0.5em;
	}

	menu, ol, ul {
		margin: 0.5em 0;
		padding-inline-start: 1.5em;
		font-size: 0.9rem;
		list-style: revert;

		> li {
			margin: 0.2em 0;

			&::marker {
				color: var(--c-primary);
			}
		}
	}

	blockquote {
		margin: 0.5em 0;
		padding: 0.2em 0.5em;
		border-inline-start: 4px solid var(--c-border);
		border-radius: 4px;
		background-color: var(--c-bg-2);
		font-size: 0.9em;
	}
}
</style>

<style lang="scss" scoped>
/* 评论表情放大预览（由 JS 创建在 body 上，通过 :global 应用全局样式） */
:global(#owo-zoom) {
	position: fixed;
	display: none;
	align-items: center;
	justify-content: center;
	padding: 0.3em;
	border-radius: 0.5em;
	background-color: var(--ld-bg-blur);
	backdrop-filter: blur(0.3rem);
	box-shadow: var(--box-shadow-2), var(--box-shadow-3);
	pointer-events: none;
	z-index: 1000;

	img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
}
</style>

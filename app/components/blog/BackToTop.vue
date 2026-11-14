<script setup lang="ts">
/**
 * 返回顶部按钮 + 页面滚动进度环。
 * 滚动超过 400px 才出现；环形进度直接改 stroke-dashoffset，不进响应式。
 */
const buttonEl = useTemplateRef<HTMLButtonElement>('button')
const ringEl = useTemplateRef<SVGCircleElement>('ring')
let visible = false
let ticking = false

const CIRCUMFERENCE = 2 * Math.PI * 22

function update() {
	ticking = false
	const scrollY = window.scrollY
	const show = scrollY > 400
	if (show !== visible && buttonEl.value) {
		visible = show
		buttonEl.value.classList.toggle('show', show)
	}
	if (show && ringEl.value) {
		const total = document.documentElement.scrollHeight - window.innerHeight
		const progress = total > 0 ? Math.min(1, scrollY / total) : 0
		ringEl.value.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress))
	}
}

function requestUpdate() {
	if (ticking)
		return
	ticking = true
	requestAnimationFrame(update)
}

function scrollToTop() {
	window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
	if (ringEl.value)
		ringEl.value.style.strokeDasharray = String(CIRCUMFERENCE)
	update()
	useEventListener(window, 'scroll', requestUpdate, { passive: true })
})
</script>

<template>
<button
	ref="button"
	class="back-to-top"
	aria-label="返回顶部"
	@click="scrollToTop"
>
	<svg viewBox="0 0 48 48" aria-hidden="true">
		<circle class="ring-bg" cx="24" cy="24" r="22" />
		<circle ref="ring" class="ring-fg" cx="24" cy="24" r="22" />
	</svg>
	<Icon class="arrow" name="tabler:arrow-up" />
</button>
</template>

<style lang="scss" scoped>
.back-to-top {
	position: fixed;
	inset-inline-end: min(1rem, 5%);
	bottom: calc(min(2rem, 5%) + 4rem);
	display: grid;
	place-items: center;
	width: 2.6rem;
	height: 2.6rem;
	padding: 0;
	border: 1px solid var(--c-border);
	border-radius: 50%;
	background-color: var(--ld-bg-blur);
	backdrop-filter: blur(0.5rem);
	box-shadow: var(--box-shadow-1), var(--box-shadow-2);
	color: var(--c-text-2);
	cursor: pointer;
	opacity: 0;
	pointer-events: none;
	transform: translateY(0.8rem);
	transition: opacity 0.25s, transform 0.25s, color 0.2s, box-shadow 0.2s;
	z-index: 90;

	&.show {
		opacity: 1;
		pointer-events: auto;
		transform: none;
	}

	&:hover {
		color: var(--c-primary);
		box-shadow: var(--box-shadow-2), var(--box-shadow-3);
	}

	svg {
		position: absolute;
		inset: -1px;
		width: calc(100% + 2px);
		height: calc(100% + 2px);
		fill: none;
		transform: rotate(-90deg);

		.ring-bg {
			stroke: var(--c-bg-3);
			stroke-width: 2.5;
		}

		.ring-fg {
			stroke: var(--c-primary);
			stroke-width: 2.5;
			stroke-linecap: round;
			stroke-dashoffset: 138.23; // 全圆周长，初始 0%
		}
	}

	.arrow {
		font-size: 1.2em;
	}
}

@media (prefers-reduced-motion: reduce) {
	.back-to-top {
		transition: opacity 0.25s;
	}
}
</style>

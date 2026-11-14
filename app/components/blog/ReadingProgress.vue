<script setup lang="ts">
/**
 * 文章阅读进度条：固定在视口顶部。
 * rAF 节流的滚动监听，直接改 DOM 宽度，不进响应式。
 */
const fillEl = useTemplateRef<HTMLDivElement>('fill')
let ticking = false

function update() {
	ticking = false
	const main = document.querySelector('#main-content')
	if (!main || !fillEl.value)
		return
	const total = main.scrollHeight - window.innerHeight
	const progress = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0
	fillEl.value.style.transform = `scaleX(${progress})`
}

function requestUpdate() {
	if (ticking)
		return
	ticking = true
	requestAnimationFrame(update)
}

onMounted(() => {
	update()
	useEventListener(window, 'scroll', requestUpdate, { passive: true })
	useEventListener(window, 'resize', requestUpdate, { passive: true })
})
</script>

<template>
<div class="reading-progress" aria-hidden="true">
	<div ref="fill" class="reading-progress-fill" />
</div>
</template>

<style lang="scss" scoped>
.reading-progress {
	position: fixed;
	inset: 0 0 auto 0;
	height: 3px;
	pointer-events: none;
	z-index: 300;

	.reading-progress-fill {
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, var(--c-primary), var(--c-accent));
		box-shadow: 0 0 6px var(--c-primary-soft);
		transform: scaleX(0);
		transform-origin: inline-start;
		transition: transform 0.1s linear;
	}

	@media (prefers-reduced-motion: reduce) {
		.reading-progress-fill {
			transition: none;
		}
	}
}
</style>

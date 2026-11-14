/**
 * 全局图片视差：
 * - `[data-parallax]` 元素按属性值（最大位移 px）视差
 * - 文章正文 `.article img` 与碎碎念正文 `.speak-body img` 自动启用轻量视差（6px）
 * - MutationObserver 捕获路由切换后的新元素；rAF 节流；减少动态效果时禁用
 */
export default defineNuxtPlugin(() => {
	if (import.meta.server)
		return
	if (matchMedia('(prefers-reduced-motion: reduce)').matches)
		return

	const targets = new Set<HTMLElement>()
	let ticking = false

	function add(el: HTMLElement) {
		if (targets.has(el))
			return
		targets.add(el)
		el.style.willChange = 'transform'
	}

	function collect(root: ParentNode) {
		root.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => add(el))
		root.querySelectorAll<HTMLElement>('.article img, .speak-body img').forEach(el => add(el))
	}

	function update() {
		ticking = false
		const vh = window.innerHeight
		for (const el of targets) {
			if (!el.isConnected) {
				targets.delete(el)
				continue
			}
			const rect = el.getBoundingClientRect()
			// 跳过视口外很远的元素
			if (rect.bottom < -160 || rect.top > vh + 160)
				continue
			const strength = Number(el.dataset.parallax) || 6
			const center = rect.top + rect.height / 2 - vh / 2
			const ratio = Math.max(-1, Math.min(1, center / (vh / 2 + rect.height / 2)))
			el.style.transform = `translate3d(0, ${(ratio * strength).toFixed(1)}px, 0)`
		}
	}

	function requestUpdate() {
		if (ticking)
			return
		ticking = true
		requestAnimationFrame(update)
	}

	// 初始收集 + 路由切换后动态收集
	collect(document)
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (node instanceof HTMLElement)
					collect(node)
			}
		}
	})
	observer.observe(document.body, { childList: true, subtree: true })

	useEventListener(window, 'scroll', requestUpdate, { passive: true })
	useEventListener(window, 'resize', requestUpdate, { passive: true })
	requestUpdate()
})

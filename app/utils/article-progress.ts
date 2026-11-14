/**
 * 计算当前阅读进度（0~1）：
 * 文章页以正文 `.article` 为准（不含评论区），滚到正文结尾即 100%；
 * 其他页面退回整个 #main-content。
 */
export function getArticleScrollProgress(): number {
	// 页面已无法继续往下滚动时视为 100%（文章偏短或结尾被视口吞没的场景）
	const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
	if (maxScroll <= 0 || window.scrollY >= maxScroll - 2)
		return 1

	const article = document.querySelector<HTMLElement>('.article:not(.speak-body)')
	const fallback = document.querySelector<HTMLElement>('#main-content')
	const target = article && article.offsetHeight > 0 ? article : fallback
	if (!target)
		return 0

	const top = target.getBoundingClientRect().top + window.scrollY
	const total = top + target.offsetHeight - window.innerHeight
	if (total <= 0)
		return 0
	return Math.min(1, Math.max(0, window.scrollY / total))
}

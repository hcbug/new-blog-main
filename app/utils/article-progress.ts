/**
 * 计算当前阅读进度（0~1）：
 * - 浏览器最上端接触文章结尾时即为 100%
 * - 页面已无法继续往下滚动时也视为 100%（短文章场景）
 * - 文章页以正文 `.article` 为准（不含评论区），其他页面退回 #main-content
 */
export function getArticleScrollProgress(): number {
	const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
	if (maxScroll <= 0 || window.scrollY >= maxScroll - 2)
		return 1

	const article = document.querySelector<HTMLElement>('.article:not(.speak-body)')
	const fallback = document.querySelector<HTMLElement>('#main-content')
	const target = article && article.offsetHeight > 0 ? article : fallback
	if (!target)
		return 0

	const rect = target.getBoundingClientRect()
	const bottom = rect.top + window.scrollY + target.offsetHeight
	if (bottom <= 0)
		return 0
	return Math.min(1, Math.max(0, window.scrollY / bottom))
}

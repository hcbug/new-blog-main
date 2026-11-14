/**
 * 计算当前阅读进度（0~1）：
 * 文章页以正文 `.article` 为准（不含评论区），滚到正文结尾即 100%；
 * 其他页面退回整个 #main-content。
 */
export function getArticleScrollProgress(): number {
	const article = document.querySelector<HTMLElement>('.article')
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

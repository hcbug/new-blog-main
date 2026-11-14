interface TwikooRecentComment {
	id: string
	nick: string
	avatar: string
	url: string
	created: number
	comment: string
	commentText?: string
}

interface TwikooInitOptions {
	envId: string
	el: string
	region?: string
	path?: string
	lang?: string
	katex?: unknown
}

declare global {
	interface Window {
		twikoo?: {
			init: (options: TwikooInitOptions) => void
			version: string
			/** 获取全站最近评论（含楼中楼时 includeReply 为 true） */
			getRecentComments: (options: {
				envId: string
				region?: string
				pageSize?: number
				includeReply?: boolean
			}) => Promise<TwikooRecentComment[]>
		}
		/** KaTeX 由 blog.config.ts 的 head 脚本全局加载 */
		katex?: unknown
		/** Cloudflare Turnstile（友链申请表单的人机验证） */
		turnstile?: {
			render: (el: HTMLElement, options: Record<string, unknown>) => string
			remove: (widgetId: string) => void
		}
	}
}

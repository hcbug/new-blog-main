export default defineNuxtPlugin(() => {
	if (import.meta.server)
		return

	const { show } = useToast()

	// 同类提示节流，避免按住 F12 时刷屏
	let lastCopyAt = 0
	let lastDevAt = 0
	const throttled = (last: number, gap = 2500) => Date.now() - last > gap

	// 复制内容时提醒署名出处
	useEventListener(window, 'copy', () => {
		if (!throttled(lastCopyAt))
			return
		lastCopyAt = Date.now()
		show('复制成功！转载记得注明出处哦～', { icon: 'tabler:copy' })
	})

	// 打开开发者工具时提醒许可协议
	useEventListener(window, 'keydown', (e) => {
		const isDevKey = e.key === 'F12'
			|| (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase()))
		if (!isDevKey || !throttled(lastDevAt))
			return
		lastDevAt = Date.now()
		show('打开开发者工具啦？欢迎交流～ 本站内容遵循 CC BY-NC-SA 4.0', { icon: 'tabler:code' })
	})

	// 控制台彩蛋
	// eslint-disable-next-line no-console
	console.log(
		'%c 洪畅的博客 %c 想，全是问题；做，才有答案。',
		'padding:2px 8px;border-radius:4px;background:#3b82f6;color:#fff;font-weight:bold',
		'color:#64748b',
	)
})

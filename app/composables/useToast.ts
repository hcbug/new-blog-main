export interface ToastItem {
	id: number
	icon?: string
	text: string
}

// 模块级单例，插件与组件共享同一份状态
const toasts = ref<ToastItem[]>([])
let toastSeq = 0

export default function useToast() {
	function show(text: string, options: { icon?: string, duration?: number } = {}) {
		const id = ++toastSeq
		toasts.value.push({ id, icon: options.icon, text })
		setTimeout(() => {
			toasts.value = toasts.value.filter(item => item.id !== id)
		}, options.duration ?? 3000)
	}

	return {
		toasts,
		show,
	}
}

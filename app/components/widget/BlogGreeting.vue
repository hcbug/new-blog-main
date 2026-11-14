<script setup lang="ts">
import { UtilHydrateSafe } from '#components'

const appConfig = useAppConfig()

const text = ref(appConfig.visitor.fallback)
const locating = ref(false)

async function fetchGreeting() {
	if (locating.value)
		return
	locating.value = true
	try {
		const res = await $fetch<{ text?: string }>('/api/visitor')
		if (res?.text)
			text.value = res.text
	}
	catch (e) {
		console.warn('访客问候获取失败', e)
	}
	finally {
		locating.value = false
	}
}

onMounted(fetchGreeting)
</script>

<template>
<BlogWidget card title="公告">
	<template #title>
		<Icon name="tabler:bell-ringing" />
		公告
	</template>

	<p class="greeting-text">
		{{ text }}
	</p>

	<UtilHydrateSafe>
		<button class="greeting-refresh" :disabled="locating" @click="fetchGreeting">
			<Icon class="refresh-icon" :class="{ spinning: locating }" name="tabler:refresh" />
			<span>{{ locating ? '定位中…' : '根据 IP 归属地生成' }}</span>
		</button>
	</UtilHydrateSafe>
</BlogWidget>
</template>

<style lang="scss" scoped>
.greeting-text {
	padding: 0.2em 0;
	line-height: 1.6;
}

.greeting-refresh {
	display: flex;
	align-items: center;
	gap: 0.3em;
	margin-top: 0.2em;
	font: inherit;
	font-size: 0.85em;
	line-height: 1.4;
	color: var(--c-text-3);
	transition: color 0.2s;

	&:hover {
		color: var(--c-primary);
	}

	&:disabled {
		cursor: wait;
	}
}

.refresh-icon.spinning {
	animation: rotate 1s linear infinite;
}

@keyframes rotate {
	to {
		transform: rotate(360deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.refresh-icon.spinning {
		animation: none;
	}
}
</style>

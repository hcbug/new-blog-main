<script setup lang="ts">
import { UtilHydrateSafe } from '#components'

const appConfig = useAppConfig()

// 公告正文来自 blog.config.ts 的 visitor.announcement，可自行修改
const announcement = computed(() => appConfig.visitor.announcement)
// IP 归属地问候单独一行，定位失败时显示兜底文案
const greeting = ref(appConfig.visitor.fallback)
const locating = ref(false)

async function fetchGreeting() {
	if (locating.value)
		return
	locating.value = true
	try {
		const res = await $fetch<{ text?: string }>('/api/visitor')
		if (res?.text)
			greeting.value = res.text
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

	<p v-if="appConfig.visitor.showGreeting" class="greeting-text">
		<Icon name="tabler:map-pin" />
		{{ greeting }}
	</p>

	<p class="announcement-text">
		{{ announcement }}
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
	display: flex;
	gap: 0.35em;
	align-items: baseline;
	padding: 0.3em 0.5em;
	border-radius: 0.5em;
	background-color: var(--c-bg-soft);
	font-size: 0.88em;
	line-height: 1.6;
	color: var(--c-text-2);

	> .iconify {
		flex-shrink: 0;
		transform: translateY(0.1em);
		color: var(--c-primary);
	}
}

.announcement-text {
	padding: 0.3em 0 0.2em;
	line-height: 1.6;
	white-space: pre-line;
}

.greeting-refresh {
	display: flex;
	align-items: center;
	gap: 0.3em;
	margin-top: 0.4em;
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

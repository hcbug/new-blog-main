<script setup lang="ts">
import type { ArticleProps } from '~/types/article'

defineOptions({ inheritAttrs: false })
const props = defineProps<ArticleProps>()

const appConfig = useAppConfig()

const coverFilter = computed(() => props.meta?.coverFilter || (props.meta?.coverDim && 'brightness(0.75)') || undefined)

const shareText = `【${appConfig.title}】${props.title}\n\n${
	props.description ? `${props.description}\n\n` : ''}${
	new URL(props.path!, appConfig.url).href}`

const { copy, copied } = useCopy(shareText)

const tags = computed(() => props.tags ?? [])

// 评论数：通过 Twikoo 统计接口获取（含楼中楼），失败则不显示
const commentCount = ref<number | null>(null)
onMounted(async () => {
	if (!props.path)
		return
	try {
		const url = new URL(props.path, appConfig.url).href
		const res = await $fetch<{ code?: number, data?: Record<string, number> }>(appConfig.twikoo.envId, {
			method: 'POST',
			body: { event: 'GET_COMMENTS_COUNT', urls: [url], includeReply: true },
		})
		if (res?.code === 0 && res.data) {
			const counts = Object.values(res.data)
			if (counts.length)
				commentCount.value = counts.reduce((sum, count) => sum + count, 0)
		}
	}
	catch (e) {
		console.warn('评论数获取失败', e)
	}
})
</script>

<template>
<div class="post-header" :class="{ 'has-cover': image }">
	<Pic v-if="image" class="post-cover" :src="image" :alt="title" :filter="coverFilter" />
	<div class="post-nav">
		<div class="operations">
			<Icon v-show="false" name="tabler:check" />
			<ZButton
				:icon="copied ? 'tabler:check' : 'tabler:share'"
				text="文字分享"
				@click="copy()"
			/>
		</div>

		<div v-if="!meta?.hideInfo" class="post-info">
			<UtilDate
				v-if="date"
				v-tip
				:tip-transform="d => `创建于${d}`"
				:date
				icon="tabler:pencil-minus"
			/>

			<UtilDate
				v-if="updated && isTimeDiffSignificant(date, updated, 1)"
				v-tip
				:tip-transform="d => `修改于${d}`"
				:date="updated"
				icon="tabler:clock-edit"
			/>

			<span v-if="categories">
				<Icon :name="getCategoryIcon(categories[0])" />
				{{ categories[0] }}
			</span>

			<span v-if="tags.length" v-tip="tags.join('、')">
				<Icon name="tabler:tag" />
				{{ tags.slice(0, 3).join(' / ') }}<template v-if="tags.length > 3"> +{{ tags.length - 3 }}</template>
			</span>

			<span v-if="commentCount !== null" v-tip="`共 ${commentCount} 条评论`">
				<Icon name="tabler:message-dots" />
				{{ commentCount }} 条评论
			</span>

			<span>
				<Icon name="tabler:pilcrow" />
				{{ formatNumber(readingTime?.words) }} 字
			</span>
		</div>
	</div>

	<h1 class="post-title" :class="getPostTypeClassName(type)">
		{{ title }}
	</h1>
</div>
</template>

<style lang="scss" scoped>
.post-header {
	contain: paint; // overflow hidden + position relative
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	gap: 1rem;
	margin: 0.5rem;
	border-radius: 1rem;
	background-color: var(--c-bg-2);
	color: var(--c-text);

	@media (max-width: $breakpoint-mobile) {
		margin: 0;
		border-radius: 0;
	}

	&:hover .operations,
	&:focus-within .operations {
		opacity: 1;
	}

	&.has-cover {
		min-height: 16rem;
		max-height: 20rem;
		color: white;
		transition: font-size 0.2s;

		.post-info {
			filter: drop-shadow(0 1px 2px #000);
		}

		.post-title {
			background-image: linear-gradient(transparent, #0003, #0005);
			text-shadow: var(--text-shadow-black);

			&.text-story {
				text-align: center;
			}
		}
	}
}

.operations {
	position: absolute;
	opacity: 0;
	inset-inline-end: 1em;
	color: var(--c-text-1);
	transition: opacity 0.2s;
	z-index: 1;
}

.post-cover {
	position: absolute;
	inset: 0;

	> :deep(img) {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
}

.post-title {
	padding: 0.8em 1rem;
	font-size: 1.6em;
	line-height: 1.2;
	z-index: 1;
}

.post-nav {
	padding: 0.8em 1rem;
	font-size: 0.8em;

	.post-info {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em 1.2em;
		column-gap: clamp(1em, 3%, 1.5em);
	}
}
</style>

<script setup lang="ts">
const appConfig = useAppConfig()
useSeoMeta({
	title: '标签',
	description: `${appConfig.title}的文章标签合集，点击标签查看对应文章。`,
})

const layoutStore = useLayoutStore()
layoutStore.setAside(['blog-stats', 'blog-log'])

const { data: listRaw } = await useAsyncData('posts:tags', () => getArticleIndexOptions(), { default: () => [] })
const { listSorted, isAscending, sortOrder } = useArticleSort(listRaw, { bindDirectionQuery: 'asc', bindOrderQuery: 'sort' })

const tag = useRouteQuery('tag', undefined)

const tags = computed(() => {
	const count = new Map<string, number>()
	for (const item of listSorted.value) {
		for (const name of item.tags ?? [])
			count.set(name, (count.get(name) ?? 0) + 1)
	}
	return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
})

const listFiltered = computed(() => {
	const current = tag.value
	if (!current)
		return []
	return listSorted.value.filter(item => item.tags?.includes(current))
})

const { page, totalPages, listPaged } = usePagination(listFiltered, { bindQuery: 'page' })

watch(tag, () => {
	page.value = 1
})

function selectTag(name?: string) {
	const router = useRouter()
	router.push({ query: { ...useRoute().query, tag: name || undefined, page: undefined } })
}
</script>

<template>
<BlogHeader class="mobile-only" to="/" suffix="标签" tag="h1" />

<section class="tags-page">
	<header class="page-head text-creative">
		<h2>全部标签</h2>
		<span class="page-count">{{ tags.length }} 个</span>
	</header>

	<PostOrderToggle
		v-model:is-ascending="isAscending"
		v-model:sort-order="sortOrder"
	/>

	<div class="tag-cloud" role="tablist" aria-label="标签筛选">
		<button
			class="tag-chip"
			:class="{ active: !tag }"
			role="tab"
			:aria-selected="!tag"
			@click="selectTag()"
		>
			全部
			<span class="chip-count">{{ listSorted.length }}</span>
		</button>
		<button
			v-for="[name, count] in tags"
			:key="name"
			class="tag-chip"
			:class="{ active: tag === name }"
			role="tab"
			:aria-selected="tag === name"
			@click="selectTag(name)"
		>
			{{ name }}
			<span class="chip-count">{{ count }}</span>
		</button>
	</div>

	<template v-if="tag">
		<h3 class="filter-title">
			<Icon name="tabler:tags" />
			标签「{{ tag }}」下的 {{ listFiltered.length }} 篇文章
		</h3>

		<TransitionGroup tag="menu" class="proper-height post-list" name="float-in">
			<PostArticle
				v-for="article, index in listPaged"
				:key="article.path"
				v-bind="article"
				:to="article.path"
				:use-updated="sortOrder === 'updated'"
				:style="getFixedDelay(index * 0.05)"
			/>
		</TransitionGroup>

		<ZPagination v-model="page" sticky avoid :total-pages="totalPages" />
	</template>

	<p v-else class="tag-hint">
		<Icon name="tabler:hand-click" />
		点击任意标签查看对应文章
	</p>
</section>
</template>

<style lang="scss" scoped>
.tags-page {
	margin: 1rem;
}

.page-head {
	display: flex;
	gap: 0.6em;
	align-items: baseline;
	padding: 0.5em;

	.page-count {
		font-size: 0.85em;
		color: var(--c-text-3);
	}
}

.tag-cloud {
	display: flex;
	flex-wrap: wrap;
	gap: 0.6em;
	padding: 1em 0.5em;
}

.tag-chip {
	display: inline-flex;
	gap: 0.4em;
	align-items: center;
	padding: 0.35em 0.9em;
	border: 1px solid var(--c-border);
	border-radius: 2em;
	background-color: var(--c-bg-2);
	font: inherit;
	font-size: 0.9em;
	color: var(--c-text-2);
	cursor: pointer;
	transition: all 0.2s;

	.chip-count {
		font-size: 0.8em;
		opacity: 0.7;
	}

	&:hover {
		color: var(--c-primary);
		border-color: var(--c-primary);
		transform: translateY(-1px);
	}

	&.active {
		background-color: var(--ld-bg-active);
		border-color: transparent;
		color: var(--c-primary);
	}
}

.filter-title {
	display: flex;
	gap: 0.4em;
	align-items: center;
	margin: 0.5em;
	font: inherit;
	font-size: 0.95em;
	color: var(--c-text-1);
}

.tag-hint {
	padding: 2em 0;
	text-align: center;
	color: var(--c-text-3);

	.iconify {
		margin-inline-end: 0.4em;
		vertical-align: -0.15em;
	}
}
</style>

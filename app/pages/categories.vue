<script setup lang="ts">
const appConfig = useAppConfig()
useSeoMeta({
	title: '分类',
	description: `${appConfig.title}的文章分类合集，点击分类查看对应文章。`,
})

const layoutStore = useLayoutStore()
layoutStore.setAside(['blog-stats', 'blog-log'])

const { data: listRaw } = await useAsyncData('posts:categories', () => getArticleIndexOptions(), { default: () => [] })
const { listSorted, isAscending, sortOrder } = useArticleSort(listRaw, { bindDirectionQuery: 'asc', bindOrderQuery: 'sort' })

const category = useRouteQuery('category', undefined)

const categories = computed(() => {
	const count = new Map<string, number>()
	for (const item of listSorted.value)
		count.set(item.categories?.[0] ?? appConfig.defaultCategory, (count.get(item.categories?.[0] ?? appConfig.defaultCategory) ?? 0) + 1)
	return [...count.entries()]
})

const listFiltered = computed(() => {
	if (!category.value)
		return []
	return listSorted.value.filter(item => (item.categories?.[0] ?? appConfig.defaultCategory) === category.value)
})

const { page, totalPages, listPaged } = usePagination(listFiltered, { bindQuery: 'page' })

watch(category, () => {
	page.value = 1
})

function selectCategory(name?: string) {
	const router = useRouter()
	router.push({ query: { ...useRoute().query, category: name || undefined, page: undefined } })
}
</script>

<template>
<BlogHeader class="mobile-only" to="/" suffix="分类" tag="h1" />

<section class="categories-page">
	<header class="page-head text-creative">
		<h2>全部分类</h2>
		<span class="page-count">{{ categories.length }} 个 · {{ listSorted.length }} 篇</span>
	</header>

	<PostOrderToggle
		v-model:is-ascending="isAscending"
		v-model:sort-order="sortOrder"
	/>

	<div class="category-grid" role="tablist" aria-label="分类筛选">
		<button
			v-for="[name, count] in categories"
			:key="name"
			class="category-card"
			:class="{ active: category === name }"
			role="tab"
			:aria-selected="category === name"
			:style="getCategoryColor(name) ? { '--cat-color': getCategoryColor(name) } : undefined"
			@click="selectCategory(name)"
		>
			<span class="cat-icon">
				<Icon :name="getCategoryIcon(name)" />
			</span>
			<span class="cat-name">{{ name }}</span>
			<span class="cat-count">{{ count }} 篇</span>
		</button>
	</div>

	<template v-if="category">
		<h3 class="filter-title">
			<Icon :name="getCategoryIcon(category)" />
			分类「{{ category }}」下的 {{ listFiltered.length }} 篇文章
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

	<p v-else class="category-hint">
		<Icon name="tabler:hand-click" />
		点击任意分类查看对应文章
	</p>
</section>
</template>

<style lang="scss" scoped>
.categories-page {
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

.category-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
	gap: 0.8em;
	padding: 1em 0.5em;
}

.category-card {
	--cat-color: var(--c-primary);

	display: flex;
	flex-direction: column;
	gap: 0.3em;
	align-items: center;
	padding: 1.2em 0.8em;
	border: 1px solid var(--c-border);
	border-radius: 0.8em;
	background-color: var(--c-bg-2);
	font: inherit;
	color: var(--c-text-1);
	cursor: pointer;
	transition: all 0.2s;

	.cat-icon {
		display: grid;
		place-items: center;
		width: 2.6em;
		height: 2.6em;
		border-radius: 50%;
		background-color: color-mix(in srgb, var(--cat-color) 15%, transparent);
		font-size: 1.3em;
		color: var(--cat-color);
		transition: transform 0.2s;
	}

	.cat-name {
		font-weight: 600;
	}

	.cat-count {
		font-size: 0.8em;
		color: var(--c-text-3);
	}

	&:hover {
		border-color: var(--cat-color);
		transform: translateY(-2px);
		box-shadow: var(--box-shadow-2);

		.cat-icon {
			transform: scale(1.1) rotate(-6deg);
		}
	}

	&.active {
		border-color: var(--cat-color);
		background-color: color-mix(in srgb, var(--cat-color) 8%, var(--c-bg-2));
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

	.iconify {
		color: var(--c-primary);
	}
}

.category-hint {
	padding: 2em 0;
	text-align: center;
	color: var(--c-text-3);

	.iconify {
		margin-inline-end: 0.4em;
		vertical-align: -0.15em;
	}
}
</style>

<script setup lang="ts">
const appConfig = useAppConfig()
useSeoMeta({
	title: '碎碎念',
	description: `${appConfig.title}的碎碎念，随手记录零碎的想法与思考。`,
})

const layoutStore = useLayoutStore()
layoutStore.setAside(['blog-greeting', 'blog-stats', 'blog-log'])

// 碎碎念与文章共用 content 集合，靠路径前缀区分；feed 只收录 posts/% 不受影响
const { data: speaks } = await useAsyncData('content:speaks', () => queryCollection('content')
	.where('stem', 'LIKE', 'speaks/%')
	.order('date', 'DESC')
	.all(), { default: () => [] })
</script>

<template>
<div class="mobile-only">
	<BlogHeader to="/" suffix="碎碎念" tag="h1" />
</div>

<section class="speaks-page">
	<header class="page-head text-creative">
		<h2>
			<Icon name="tabler:message-2" />
			碎碎念
		</h2>
		<p class="page-desc">
			一些零碎的想法与思考，随手记在这里，不含入订阅源。
		</p>
	</header>

	<p v-if="!speaks?.length" class="hint">
		还没有碎碎念，敬请期待。
	</p>

	<div v-else class="speaks-masonry">
		<article v-for="speak in speaks" :key="speak.path" class="speak-card card upraise">
			<!-- 封面图：容器裁剪，图片带视差（data-parallax 为最大位移 px） -->
			<div v-if="speak.image" class="speak-cover">
				<NuxtImg
					class="cover-img"
					:src="speak.image"
					alt=""
					loading="lazy"
					referrerpolicy="no-referrer"
					data-parallax="14"
				/>
			</div>

			<ContentRenderer class="speak-body article" :value="speak" />

			<footer class="speak-foot">
				<UtilDate :date="speak.date" icon="tabler:clock" relative />
			</footer>
		</article>
	</div>
</section>
</template>

<style lang="scss" scoped>
.speaks-page {
	margin: 1rem;
}

.page-head {
	padding: 0.5em;

	h2 {
		display: flex;
		gap: 0.4em;
		align-items: center;
		margin-bottom: 0.3em;
		font-size: 1.5em;

		.iconify {
			color: var(--c-primary);
		}
	}

	.page-desc {
		font-size: 0.85em;
		color: var(--c-text-2);
	}
}

.hint {
	padding: 2em 0;
	text-align: center;
	color: var(--c-text-3);
}

.speaks-masonry {
	column-count: 3;
	column-gap: 0.8rem;
	padding: 0.8rem 0;

	@media (max-width: $breakpoint-mobile) {
		column-count: 2;
	}

	@media (max-width: $breakpoint-phone) {
		column-count: 1;
	}
}

.speak-card {
	display: inline-block;
	overflow: hidden;
	width: 100%;
	margin-bottom: 0.8rem;
	border-radius: 0.8em;
	break-inside: avoid;

	.speak-cover {
		overflow: hidden;
		height: 11em;

		.cover-img {
			width: 100%;
			height: 130%;
			margin-top: -15%;
			object-fit: cover;
		}
	}

	// 卡片内复用文章排版，但去掉 .article 自带的外边距
	:deep(.article) {
		margin: 0;
		padding: 0.4em 1em;
		font-size: 0.92em;
	}

	.speak-foot {
		padding: 0.5em 1em 0.7em;
		border-top: 1px solid var(--c-border);
		font-size: 0.8em;
		color: var(--c-text-3);
	}
}
</style>

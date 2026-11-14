<script setup lang="ts">
import type { ArticleProps } from '~/types/article'

const props = defineProps<{ useUpdated?: boolean } & ArticleProps>()
const showAllDate = isTimeDiffSignificant(props.date, props.updated)

/** 卡片光晕与 3D 内倾：直接写 CSS 变量，不进响应式；触摸设备不启用 */
function onPointerMove(e: PointerEvent) {
	const el = e.currentTarget as HTMLElement
	if (!matchMedia('(hover: hover)').matches)
		return
	const rect = el.getBoundingClientRect()
	const x = (e.clientX - rect.left) / rect.width
	const y = (e.clientY - rect.top) / rect.height
	el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
	el.style.setProperty('--my', `${e.clientY - rect.top}px`)
	// 鼠标所在位置向内凹陷：绕 X 轴最多 5deg，绕 Y 轴最多 7deg
	el.style.setProperty('--tilt-x', `${(0.5 - y) * 5}deg`)
	el.style.setProperty('--tilt-y', `${(x - 0.5) * 7}deg`)
}

function onPointerLeave(e: PointerEvent) {
	const el = e.currentTarget as HTMLElement
	el.style.setProperty('--tilt-x', '0deg')
	el.style.setProperty('--tilt-y', '0deg')
}
</script>

<template>
<UtilLink class="article-card card upraise" @pointermove="onPointerMove" @pointerleave="onPointerLeave">
	<NuxtImg v-if="image" class="article-cover" :src="image" :alt="title" />
	<article>
		<h2 class="article-title text-creative">
			{{ title }}
		</h2>

		<p v-if="description" class="article-description">
			{{ description }}
		</p>

		<div class="article-info">
			<UtilDate
				v-if="date && (showAllDate || !useUpdated)"
				:date
				icon="tabler:pencil-minus"
			/>

			<UtilDate
				v-if="updated && (showAllDate || useUpdated)"
				:class="{ 'use-updated': useUpdated }"
				:date="updated"
				icon="tabler:clock-edit"
			/>

			<span v-if="categories" :style="{ color: getCategoryColor(categories[0]) }">
				<Icon :name="getCategoryIcon(categories[0])" />
				{{ categories[0] }}
			</span>

			<span v-if="readingTime?.words" class="article-words">
				<Icon name="tabler:pilcrow" />
				{{ formatNumber(readingTime?.words) }}字
			</span>
		</div>
	</article>
</UtilLink>
</template>

<style lang="scss" scoped>
.article-card {
	container-type: inline-size;
	position: relative;
	margin: 1em 0;
	border-radius: 0.8em;
	color: var(--c-text);
	animation: float-in 0.2s var(--delay) backwards;

	// 鼠标跟随光晕，压在卡片底色之上、内容之下
	&::after {
		content: "";
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: radial-gradient(16rem circle at var(--mx, 50%) var(--my, 50%), var(--c-primary-soft), transparent 65%);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.25s;
		z-index: -1;
	}

	@media (hover: hover) {
		&:hover::after {
			opacity: 1;
		}
	}

	> article {
		display: grid;
		gap: 0.5em;
		padding: 1em;
	}
}

/* 3D 内倾：悬停处向内凹陷，移开平滑回正（覆盖 .card.upraise 的位移） */
@media (hover: hover) {
	.article-card.card.upraise:hover {
		box-shadow: var(--box-shadow-3);
		transform: perspective(700px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)) translateY(-2px);
		transition: box-shadow 0.2s, transform 0.12s linear;
	}

	.article-card.card.upraise:not(:hover) {
		transform: perspective(700px) rotateX(0deg) rotateY(0deg);
		transition: transform 0.4s cubic-bezier(0.2, 0.9, 0.4, 1);
	}
}

@media (prefers-reduced-motion: reduce) {
	.article-card.card.upraise:hover,
	.article-card.card.upraise:not(:hover) {
		transform: none;
		transition: none;
	}
}

.article-info {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5em clamp(1em, 5%, 1.5em);
	font-size: 0.8em;
	color: var(--c-text-2);

	&:empty {
		display: none;
	}

	.use-updated {
		order: -1;
	}
}

.article-title {
	font-size: 1.2em;
	color: var(--c-text);
}

.article-description {
	font-size: 0.9em;
	color: var(--c-text-2);
}

.article-cover {
	position: absolute;
	opacity: 0.8;
	inset-inline-end: 0;
	top: 0;
	width: calc(40% + 2em);
	height: 100%;
	margin: 0;
	mask-image: linear-gradient(to var(--end), transparent, #FFF 50%);
	transition: opacity 0.2s;
	object-fit: cover;

	:hover > & {
		opacity: 1;
	}

	& + article {
		position: relative;
		width: 60%;
	}

	@mixin cover-narrow {
		position: revert;
		width: 100%;
		height: auto;
		max-width: none;
		max-height: 256px;
		aspect-ratio: 2.4;
		margin-bottom: -10%;
		mask-image: linear-gradient(#FFF 50%, transparent);

		& + article {
			width: auto;

			> .article-title {
				text-shadow: 0 0 0.2em var(--ld-bg-card), 0 0 0.5em var(--ld-bg-card), 0 0 1em var(--ld-bg-card);
			}
		}
	}

	@media (max-width: $breakpoint-phone) {
		@include cover-narrow;
	}

	@container (max-width: #{$breakpoint-phone}) {
		@include cover-narrow;
	}
}
</style>

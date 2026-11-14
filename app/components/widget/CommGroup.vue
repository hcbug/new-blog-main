<template>
<BlogWidget
	card
	dim
	title="Game"
	bg-img="https://api.iconify.design/mingcute:horn-line.svg"
	bg-right
>
	<div class="title text-creative">
		网站系统后台
	</div>

	<UtilLink class="tip" to="https://game.hcbu.cn/console">
		<Icon name="tabler:brand-apple-arcade" />
		<span class="tip-text">game.hcbu.cn/console</span>
		<Icon class="external-tip" name="tabler:arrow-up-right" />
	</UtilLink>
</BlogWidget>
</template>

<style lang="scss" scoped>
.title {
	background-clip: text;
	background-image: linear-gradient(60deg, var(--c-accent) -30%, var(--c-primary), var(--c-text-1));
	background-position: 100% 0;
	background-size: 200%;
	font-size: 1.8em;
	color: transparent;
	transition: background-position 0.2s;

	.blog-widget:hover & {
		background-position: 0 0;
	}
}

.tip {
	display: flex;
	gap: 0.35em;
	align-items: center;
	font-size: 0.9em;
	line-height: 2;
	color: var(--c-text-2);
	transition: color 0.2s;

	&:hover {
		color: var(--c-primary);
	}

	.tip-text {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.external-tip {
		flex-shrink: 0;
		opacity: 0.5;
		font-size: 0.9em;
	}
}

:deep(.bg-img).bg-img.bg-img {
	opacity: 0.5;
}
</style>

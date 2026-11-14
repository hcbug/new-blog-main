<script setup lang="ts">
const { toasts } = useToast()
</script>

<template>
<TransitionGroup
	tag="div"
	class="blog-toast-root"
	name="toast"
	role="status"
	aria-live="polite"
>
	<div v-for="item in toasts" :key="item.id" class="blog-toast">
		<Icon v-if="item.icon" :name="item.icon" />
		<span>{{ item.text }}</span>
	</div>
</TransitionGroup>
</template>

<style lang="scss" scoped>
.blog-toast-root {
	position: fixed;
	inset-inline: 0;
	bottom: 12%;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
	pointer-events: none;
	z-index: 1000;
}

.blog-toast {
	display: flex;
	gap: 0.5em;
	align-items: center;
	max-width: min(90vw, 32rem);
	padding: 0.6em 1.2em;
	border: 1px solid var(--c-border);
	border-radius: 2em;
	background-color: var(--ld-bg-blur);
	backdrop-filter: blur(0.5rem);
	box-shadow: var(--box-shadow-1), var(--box-shadow-3);
	font-size: 0.9em;
	line-height: 1.4;
	color: var(--c-text-1);

	> .iconify {
		flex-shrink: 0;
		font-size: 1.2em;
		color: var(--c-primary);
	}
}

.toast-enter-active,
.toast-leave-active {
	transition: opacity 0.25s, transform 0.25s;
}

.toast-enter-from,
.toast-leave-to {
	opacity: 0;
	transform: translateY(0.8em);
}
</style>

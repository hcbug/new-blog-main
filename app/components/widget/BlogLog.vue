<script setup lang="ts">
const { timeEstablished } = useAppConfig()

const blogLog = [
	{ label: '2026-07-29', value: '公安备案成功' },
	{ label: '2026-07-27', value: 'ICP备案成功' },
	{ label: '2026-06-07', value: '更换主题为 Clarity' },
	{ label: '2026-05-10', value: '更换框架为 Astro，更换主题为 Mizuki' },
	{ label: '2026-05-02', value: '更换框架为 Hexo，升级博客' },
	{ label: '2026-05-01', value: '使用 hcbu.cn 域名' },
	{ label: timeEstablished, value: '发布第一篇文章' },
]
</script>

<template>
<BlogWidget card title="更新日志">
	<ZDlGroup size="large" :items="blogLog" />
</BlogWidget>
</template>

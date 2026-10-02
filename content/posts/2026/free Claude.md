---
title: 免费本地部署开源 AI 接入 Claude Desktop
description: 使用 Ollama 本地模型和 CC Switch 路由，实现Claude接入本地模型，离线使用。
date: 2026-08-04 12:50:40
updated: 2026-08-06 14:01:00
image: https://gitee.com/hcbug/picture1/raw/master/20261002110715020.webp
categories: [技术]
tags: [AI, 教程]
---

## 演示环境

1. Windows 电脑：独显模式；
2. 魔法：规则模式；
3. Gmail 等国外邮箱；
4. 安装 Git: [安装链接](https://git-scm.com/install/windows)；
5. 运行所有 App 都用管理员身份，安C盘可以避免权限问题；
6. 下以 `gemma4:e4b` 模型为例。

## 安装开源模型（15min）

### 安装 Ollama.

[安装链接](https://ollama.com/download/windows)。

### 安装模型

推荐： [Qwen 3.6](https://ollama.com/library/qwen3.6)/[3.5](https://ollama.com/library/qwen3.5) 、[Gemma4](https://ollama.com/library/gemma4)、[Deepseek R1](https://ollama.com/library/deepseek-r1)、[GLM](https://ollama.com/library/glm-4.7-flash) 。

根据自己电脑的显存选择模型的规格。粗略讲 `1B` 需要 `1GB` 显存。 

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20260804140440660.webp
caption: 模型规格在 Details 看
---
::

用 CMD 安装 `gemma4:e4b` ，其他模型举一反三。命令如下：

```CLI
ollama run gemma4:e4b
```

::folding
#title
如何以管理员身份运行 CMD ?
#default
按下 :key{code="Win" icon} 打开开始菜单，输入 `cmd` ，右键点击“命令提示符”，选择“以管理员身份运行”。
::

安装好后可以在 Ollama 选择该模型对话，支持离线对话。

## 接入 Claude Code (45min)

::alert{type="warning" card}
#title
谨慎尝试
#default
难以折腾，容易红温。用 Ollama 就足够了。
::

### 安装 CC Switch.

[安装链接](https://github.com/farion1231/cc-switch/releases/latest) ，Windows选 `CC-Switch-v3.19.1-Windows.msi` 安装，其他系统举一反三；

CC Switch 用于将 Claude 的请求拦截并发送给 Ollama 本地模型。

### 安装 Claude.

[安装链接](https://claude.com/download)；

**先不要登录**，待会从 Gateway（网关）登录。

### 为 CC Switch 添加供应商

点 CC Switch 加号，选自定义配置，按如下填写：

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20260804172757801.webp
caption: CC Switch 路由配置
---
::

`http://127.0.0.1:11434/v1` 是 Ollama 的本地地址。API key 自拟。

::alert{type="info" title="注意"}
修改配置或切换网络环境后，必须重启 CC Switch，使新配置生效。
::

### 配置 CC Switch 路由

打开 CC Switch 的设置，如下图配置：

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20260804144734476.webp
caption: CC Switch 路由配置
---
::

### 开启电脑虚拟化功能。

按下 :key{code="Win" icon} 打开开始菜单，输入 `启用或关闭 Windows 功能` ，打开 `Windows 虚拟机监控程序平台`、`适用于 Linux 的 Windows 子系统`、`虚拟机平台`。确定后重启电脑。

**务必关闭魔法**。

### 进入 Claude 开发者模式。

点 Claude 左上角 > Help > Troubleshooting > Enable Developer Mode。Claude 自动会重启。

再点 Claude 左上角 > Developer > Configure Third-Party Inference > Connection，按如下填写，API key 填之前自定义的API key.

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20260804154501218.webp
caption: Connection 界面配置
---
::

再点 Export, 以 `reg` 格式导出（Windows）。用记事本打开，结尾添加 `"inferenceModels"="[\"haiku\",\"sonnet\",\"opus\"]"`。此时内容大致如下：

```reg
Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\SOFTWARE\Policies\Claude]
"inferenceGatewayBaseUrl"="http://127.0.0.1:15721"
"inferenceGatewayApiKey"="123456"
"inferenceProvider"="gateway"
"inferenceCredentialKind"="static"
"inferenceModels"="[\"haiku\",\"sonnet\",\"opus\"]"

```

保存后，双击运行 `Claude.reg`，然后重启 Claude, 点`以Gateway进入`。 

### 尝试聊天

后台 Ollama, CC Switch, Claude 要同时运行。

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20260804172550569.webp
caption: 示例：Gemma4 以为自己是 Claude
---
::

## 参考资料

https://www.bilibili.com/video/BV1ENLV63EKZ （已失效）

该视频与本教程有部分出入，原因在于发布时间早晚。
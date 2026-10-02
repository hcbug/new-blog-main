---
title: Ubuntu(WSL) 配置 AstrBot 并部署为 QQ 机器人
description: 让 QQ 好友感受 AI 猫娘，亦或作为 AI Agent 管理电脑.
date: 2026-10-02 11:18:30
updated: 2026-10-02 15:55:00
image: https://gitee.com/hcbug/picture1/raw/master/20261002111331017.webp
categories: [技术]
tags: [AI，教程]
---

## 前提

1. 有 AI 的 API 可以省去本地部署的麻烦；
2. 默认不开启魔法，出现下载卡死再开；
3. 电脑保持开启，不要锁屏，保持 Ubuntu 在运行；
4. SSH 建议不要一直用 root 用户。

## 安装 Ubuntu(WSL)

### 启用功能

1. 按下 :key{code="S" win} 搜索“启用或关闭 Windows 功能”并打开;
2. 勾选 `Hyper-V`、`虚拟机平台`、`Windows Subsystem for Linux`. 确认并重启；
3. 主板也要开启虚拟化，方法自搜。

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20261002120726692.webp
caption: 从任务管理器看主板是否开启虚拟化
---
::

### 安装 WSL

管理员运行 CMD, 输入 `wsl --install --no-distribution` 安装 Linux 内核，再输入 `wsl.exe --install` 安装 WSL.
设置用户名和密码。

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20261002121313683.webp
caption: 已进入 SSH
---
::

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20261002121454675.webp
caption: WSL 主界面
---
::

输入`wsl.exe --update` 检查更新。

### 启动 Ubuntu

管理员运行 CMD, 输入 `wsl.exe -d Ubuntu`. 或在“开始”屏幕打开。

### 修改为 Ubuntu 24.04.3 LTS

为保证与参考视频一致，**建议修改版本**。如不修改，可能发生未知错误。喜欢折腾的请跳过这步。

在 PowerShell 输入：

1. `wsl -l -v` 检查版本为 `Ubuntu`;

2. 运行 `wsl --unregister Ubuntu` 来删除原系统；

3. 运行 `wsl --install --web-download -d Ubuntu-24.04` 来安装目标系统。

配置同上。

## 通过 Docker Compose 部署 AstrBot

### 克隆 AstrBot 仓库

```bash
git clone https://github.com/AstrBotDevs/AstrBot
cd AstrBot
```

卡住请按一次 :key{code="C" ctrl} .

### 安装 Docker

1. 更新软件包列表并安装依赖

```bash
sudo apt update
sudo apt install apt-transport-https ca-certificates curl software-properties-common -y
```

2. 添加 Docker 的官方 GPG 密钥

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
```

3. 添加 Docker 的官方 APT 源

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

4. 安装 Docker 引擎及相关组件

```bash
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y
```

5. 启动 Docker 服务并设置开机自启

```bash
sudo systemctl start docker
sudo systemctl enable docker
```

### 加速拉取

```bash
nano compose.yml
```

将其中的 `image: soulter/astrbot:latest` 替换为 `image: m.daocloud.io/docker.io/soulter/astrbot:latest`.

[nano 怎么用？](https://blog.hcbu.cn/2026/easyimage/#配置-nginx)

### 运行 Compose

```bash
sudo docker compose up -d
```

### 查看日志

```bash
sudo docker logs --tail 100 astrbot
```

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20261002140617961.webp
caption: 登录信息
---
::

## 登录并配置 AstrBot

1. 配置 AI 模型

选供应商，选模型，填 API key.

2. 配置平台机器人

可先在 “人格设定” 处创建人格，并设为默认。

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20261002144652046.webp
caption: 神秘鲸鱼娘
---
::

在 [QQ 开放平台](https://q.qq.com/)创建机器人。

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20261002152523822.webp
caption: 连接其他第三方机器人服务
---
::

## 提权机器人

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20261002153344726.webp
caption: 获取机器人 ID
---
::

AstrBot > 平台配置 > 添加管理员 ID

还可以配置知识库和插件等。

## 参考视频

::video-embed
---
type: bilibili
id: BV13rXKBPEFb
---
::

该视频与本教程有很大出入，原因在于我没有闲置电脑。
---
title: Twikoo 评论的图床配置
description: 免费自建 EasyImage 图床，不止用于 Twikoo. 使用谷歌免费云服务器，免数据库，免服务器备案。
date: 2026-08-10 12:00:00
updated: 2026-08-10 12:45:00
image: https://gitee.com/hcbug/picture1/raw/master/20260810223120526.webp
categories: [技术]
tags: [博客，教程]
---

## 前提

1. 电脑（以 Windows 11 为例）；
2. 魔法；
3. Gmail 邮箱（推荐）：用其他邮箱也可以，但要验证，手机可能无法发送短信。而 Gmail 可以关联你的 Google 账号，更方便；
4. 外币卡（必需）：我用的是[中国银行长城卡（白金 Visa）](https://www.boc.cn/bcservice/bc1/201306/t20130609_2307142.html)。虚拟卡没试过；
5. 博客使用 Twikoo 但没有配置图床。

# 谷歌云服务器

## 注册谷歌云账户

[注册链接](https://cloud.google.com/?hl=zh_cn)，用 Gmail, 地区选美国。

支付资料的地址推荐俄勒冈州（免税州）。（[在线生成](https://www.meiguodizhi.com/usa-address/oregon)）

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20260811131629373.webp
caption: 注册成功页面
---
::

> 我激活了完整账号（免费），但其他教程 [^copyright] 说 “不要立即点击“激活完整账号”。

[^copyright]: [永久白嫖谷歌云服务器 | 3个月试用过后依然有效 | 全网最详细小白教程](https://7techlife.blogspot.com/2025/05/3.html)

## 创建完全免费的虚拟实例

左上角菜单 > Compute Engine > 虚拟机实例 > 创建实例。

### 机器配置

左边栏 - 机器配置。

- 名称：自定义；
- 区域：推荐选 `us-west1（俄勒冈）` 。免费地区有 `us-central1（爱荷华）` 、 `us-east1（南卡罗来纳）` 、 `us-west1（俄勒冈）` ；
- 可用区：默认 `不限` ；
- 机器类型：要选择 `E2` 系列的 `e2-micro` .

### 操作系统和存储空间

左边栏 - 操作系统和存储空间。

- 操作系统和版本：要选择 Linus 的系统。小白无脑选 `Ubuntu 22.04 LTS Minimal (x86/64)` ;
- 启动磁盘类型：要选择 `标准永久性磁盘` ；
- 大小(GB)：要改为 `30` .

### 数据保护

左边栏 - 数据保护。

要选择 `无备份` 。

### 网络

左边栏 - 网络。

- 防火墙：要勾选 `允许 HTTP 流量` 和 `允许 HTTPS 流量`。

展开 `网络接口` 。

- 网络服务层级：要选择 `标准` 。

点击 `创建` 。如果提示无库存，那就等一等再重试。

::alert{type="info" title="注意"}
免费 ip 是临时的，重启实例后会改变。所有不要重启。

可免费创建多个实例。
::

## 开放防火墙

左边栏 - 虚拟机实例 > SSH 右边的三个点 > 查看网络详情 > 左边栏 - 防火墙

按需开放。小白无脑开放所有端口（如果服务器上不打算存放特别重要的文件的话）。

1. 点击 `创建防火墙规则` ：修改为以下内容；
2. 名称：自定义；
3. 流量方向： `入站` ；
4. 目标： `网络中的所有实例` ；
5. 来源 IPv4 范围： `0.0.0.0/0` ;
6. 协议和端口： `全部允许` ；
7. 点击 `创建` ；
8. 重复以上步骤，将流量方向改为 `出站` 。

## SSH 登录

### 谷歌云自带网页 SSH

左上角菜单 > Compute Engine > 虚拟机实例 > SSH.

可以用魔法来加速，但不要用不稳定的节点或自动选择模式。

::alert{type="question"}
我用谷歌账户只用点 `Authorize` 就可以登录，不知道其他账户是否也可以。
::

### 第三方 SSH 客户端登录

打开：[创建 SSH 密钥对](https://docs.cloud.google.com/compute/docs/connect/create-ssh-keys?hl=zh-cn#create_an_ssh_key_pair)

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20260811164239327.webp
caption: 替换代码内容并复制
---
::

请根据自己的情况修改 `WINDOWS_USER`, `KEY_FILENAME`, `USERNAME`.

**例如**：WINDOWS_USER=szwai, KEY_FILENAME=key, USERNAME=hongchang

1. 在C盘 `用户` 文件夹下创建名为 `.ssh` 的文件夹；
2. 在 CMD 中执行”复制的命令“（右键粘贴），再按两次回车跳过设置密码（当然你也可以设置密码）。此时在 `.ssh` 文件夹会生成 `key` 和 `key.pub` 两个文件。右键用记事本打开 `key.pub` ，复制所有内容；

3. 左边栏 - 元数据 > SSH 密钥 > 添加 SSH 密钥 > 粘贴到输入框 > 保存；

4. 在第三方 SSH 客户端中用公钥登录。名称自定义，主机是 `服务器 ip`， 端口是默认的 `22`，用户名是 `hongchang`, 私钥是 `key` （文件）。

::folding
#title
如何打开 CMD 并获取我的用户名?
#default
按下 :key{code="R" win} ，输入 `cmd` 并回车。输入 `whoami` 并回车。`\`后为当前用户名。
::

# EasyImage 图床 

以下教程仅适用于 Ubuntu 22.04 LTS Minimal (x86/64) 系统。

请提前将你的图床域名解析到服务器。下以 `img.hcbu.cn` 为例，**请替换成你自己的**。

推荐以 root 权限执行。要获取 root 权限请在 SSH 中执行 `sudo -i` 。

请一次性复制整个代码块。请用右键打开菜单，手动点击“粘贴”来粘贴，不要用 :key{code="C" ctrl} 。注释可一起复制。

## 安装 PHP 7.4 及必要扩展

EasyImage 需要 PHP 7.4 环境。Ubuntu 22.04 默认源不含 PHP 7.4，需添加第三方源：

```bash
# 添加 PHP 源
sudo apt install -y lsb-release apt-transport-https ca-certificates curl
curl -sSLo /usr/share/keyrings/deb.sury.org-php.gpg https://packages.sury.org/php/apt.gpg
echo "deb [signed-by=/usr/share/keyrings/deb.sury.org-php.gpg] https://packages.sury.org/php/ $(lsb_release -sc) main" | sudo tee /etc/apt/sources.list.d/php.list
sudo apt update && sudo apt upgrade -y
```

```bash
# 安装 PHP 7.4 及扩展
sudo apt install -y php7.4 php7.4-fpm php7.4-cli php7.4-common php7.4-mbstring php7.4-gd php7.4-intl php7.4-xml php7.4-zip php7.4-curl
```

## 修改 PHP 上传限制

PHP 默认仅允许上传 2MB 的文件，需调大限制：

```bash
sudo sed -i 's/^;*upload_max_filesize = .*/upload_max_filesize = 30M/' /etc/php/7.4/fpm/php.ini
sudo sed -i 's/^;*post_max_size = .*/post_max_size = 30M/' /etc/php/7.4/fpm/php.ini
sudo sed -i 's/^;*memory_limit = .*/memory_limit = 128M/' /etc/php/7.4/fpm/php.ini
```

保存后重启 PHP-FPM：

```bash
sudo systemctl restart php7.4-fpm
```

## 下载 EasyImage 源码

```bash
# 创建网站根目录
sudo mkdir -p /var/www/img.hcbu.cn
cd /var/www/img.hcbu.cn
```

由于系统默认没有 unzip, 要手动安装：

```bash
sudo apt install -y unzip
```

```bash
# 下载并解压 EasyImage
sudo wget https://github.com/icret/EasyImages2.0/archive/refs/heads/master.zip
sudo unzip master.zip
sudo mv EasyImages2.0-master/* . && sudo rm -rf EasyImages2.0-master master.zip
```

## 配置 Nginx

由于系统默认没有 nano, 要手动安装：

```bash
sudo apt install -y nano
```

::folding
#title
nano 编辑器怎么用？
#default
nano 是一个文本编辑器，用于编辑配置文件。它的使用方法如下：

1. 打开文件：在终端中输入 `nano 文件名`，例如 `sudo nano /etc/nginx/sites-available/img.hcbu.cn`。
2. 编辑文件：使用方向键移动光标，用键盘输入修改内容。
3. 保存文件：按下 :key{code="O" ctrl} （屏幕底部会提示 `File Name to Write` ），直接按 :key{code="Enter"} 确认覆盖。
4. 退出编辑器：按下 :key{code="X" ctrl} （如果未保存，会提示是否保存，按 :key{code="Y"} 确认，再按 :key{code="Enter"}）。
5. 特别提醒： `^` 代表键盘上的 :key{code="Control"} 键。
::

::alert{type="warning" card}
#title
不要在谷歌云自带的网页 SSH 中使用 nano 时查找内容
#default
“查找”的快捷键是 :key{code="W" ctrl} ，而 :key{code="W" ctrl} 可以关闭当前的标签页或窗口。

不信现在你试试。
::

创建 Nginx 站点配置文件：

```bash
sudo nano /etc/nginx/sites-available/img.hcbu.cn
```

```nginx
server {
    listen 80;
    server_name img.hcbu.cn;
    root /var/www/img.hcbu.cn;
    index index.php;
    client_max_body_size 20M;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php7.4-fpm.sock;
    }
}
```

启用站点并重载 Nginx：

```bash
sudo ln -s /etc/nginx/sites-available/img.hcbu.cn /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 配置 SSL 证书

使用 acme.sh 申请证书。若你已有证书，可跳过此步，直接将其放入 `/etc/nginx/ssl/` 并命名为 `img.hcbu.cn.crt` 和 `img.hcbu.cn.key` .

若需新申请：

```bash
# 安装 acme.sh
curl https://get.acme.sh | sh
source ~/.bashrc
```

```bash
# 注册账户
acme.sh --register-account -m 你的邮箱@example.com
```

```bash
# 申请证书（需要域名已解析到服务器）
acme.sh --issue -d img.hcbu.cn --webroot /var/www/img.hcbu.cn
```

```bash
# 安装证书到 Nginx 目录
acme.sh --install-cert -d img.hcbu.cn \
    --key-file /etc/nginx/ssl/img.hcbu.cn.key \
    --fullchain-file /etc/nginx/ssl/img.hcbu.cn.crt \
    --reloadcmd "systemctl reload nginx"
```

配置 HTTP 自动跳转 HTTPS：

```bash
sudo nano /etc/nginx/sites-available/img.hcbu.cn
```

```nginx
# HTTP 跳转到 HTTPS
server {
    listen 80;
    server_name img.hcbu.cn;
    return 301 https://$server_name$request_uri;
}

# HTTPS 服务
server {
    listen 443 ssl http2;
    server_name img.hcbu.cn;

    ssl_certificate /etc/nginx/ssl/img.hcbu.cn.crt;
    ssl_certificate_key /etc/nginx/ssl/img.hcbu.cn.key;

    root /var/www/img.hcbu.cn;
    index index.php;
    client_max_body_size 20M;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php7.4-fpm.sock;
    }

    # 跨域配置（给 Twikoo 调用 API 用）
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';
    add_header Access-Control-Allow-Headers 'Authorization, Content-Type';
}
```

## 安装向导

访问你的图床地址，首次访问会出现安装界面，需要填写：

- 网站域名
- 网站连接域名
- 管理员账号
- 管理员密码

网站域名、网站连接域名相同（如果你只要。管理员账号、管理员密码任意。

点击安装即可。

## 登录时会遇到的问题

如果提示“账号不存在”，说明用户名有误；如果提示“密码错误”，说明用户名正确、密码错误。

### 密码正确但显示密码错误

由于图床问题（前端用的是 `SHA256` 加密，后端用的是 `Bcrypt` 加密），即使密码正确也会显示“密码错误”。

将明文加密：

```bash
echo -n "yourpassward" | sha256sum | awk '{print $1}'
```

修改配置文件：

```bash
sudo nano /var/www/img.hcbu.cn/config/config.php
```

将 `passward` 的值改为密文（不要删去单引号）。重新登录即可。

### 页面加载混乱（CSS/JS 缺失）

看见白屏，同时 F12 查看浏览器控制台报错：“混合内容”。 [^c]

这是因为 EasyImage 生成的资源链接是 HTTP 而站点是 HTTPS ；

需要 nano 一下 /var/www/img.hcbu.cn/index.php，在 `<?php` 后面第一行写

```php
$_SERVER['HTTPS'] = 'on';
```

## 获取 Token

1. 登录 > 设置 > API 设置 > 创建一个有效期久一点的 Token;

2. 记下 Token 和上方的调用地址；

3. 转到“图床安全”，开启“API 上传”。

# Twikoo 配置

Twikoo 后台 > 配置管理 > 插件

- SHOW_IMAGE 不填或填 `true`;

- IMAGE_CDN 填 `EasyImage`;

- IMAGE_CDN_URL 填复制的调用地址；

- IMAGE_CDN_TOKEN 填复制的 Token.

保存即可。 

[^c]: [Astro搭建Twikoo评论系统+自建EasyImage图床](https://odonata.top/post/astro-setup-twikoo-comment-system-and-self-hosted-easyimage-image-hosting/#完成安装向导)
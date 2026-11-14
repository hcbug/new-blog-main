---
title: 获取 TrustedInstaller 权限
description: 删除文件需要XXX权限？支持删除 System32 文件夹，释放C盘空间（bushi）。
date: 2026-08-15 23:04:00
updated: 2026-11-14 09:13:13
image: https://gitee.com/hcbug/picture1/raw/master/20260815231020325.webp
categories: [技术]
tags: [Windows]
---

::alert{type="warning" card}
#title
免责声明
#default
由本教程引起的自身经济财产损失与本博主无关，全部由用户自行承担。用户实践本教程即认同放弃自身数据安全。
删除未知文件请三思并备份。删除系统文件易蓝屏甚至无法进入系统。
效果因系统版本而异，不一定有效。请结束进程后再删除文件。
::

## 获取 TrustedInstaller 权限

新建文本文档，并将内容替换为：

```reg
Windows Registry Editor Version 5.00

[-HKEY_CLASSES_ROOT\*\shell\runas]

[HKEY_CLASSES_ROOT\*\shell\runas]
@="获取超级管理员权限"
"Icon"="C:\\Windows\\System32\\imageres.dll,-78"
"NoWorkingDirectory"=""

[HKEY_CLASSES_ROOT\*\shell\runas\command]
@="cmd.exe /c takeown /f \"%1\" && icacls \"%1\" /grant administrators:F"
"IsolatedCommand"="cmd.exe /c takeown /f \"%1\" && icacls \"%1\" /grant administrators:F"

[-HKEY_CLASSES_ROOT\Directory\shell\runas]

[HKEY_CLASSES_ROOT\Directory\shell\runas]
@="获取超级管理员权限"
"Icon"="C:\\Windows\\System32\\imageres.dll,-78"
"NoWorkingDirectory"=""

[HKEY_CLASSES_ROOT\Directory\shell\runas\command]
@="cmd.exe /c takeown /f \"%1\" /r /d y && icacls \"%1\" /grant administrators:F /t"
"IsolatedCommand"="cmd.exe /c takeown /f \"%1\" /r /d y && icacls \"%1\" /grant administrators:F /t"

[-HKEY_CLASSES_ROOT\dllfile\shell]

[HKEY_CLASSES_ROOT\dllfile\shell\runas]
@="获取超级管理员权限"
"HasLUAShield"=""
"NoWorkingDirectory"=""

[HKEY_CLASSES_ROOT\dllfile\shell\runas\command]
@="cmd.exe /c takeown /f \"%1\" && icacls \"%1\" /grant administrators:F"
"IsolatedCommand"="cmd.exe /c takeown /f \"%1\" && icacls \"%1\" /grant administrators:F"

[-HKEY_CLASSES_ROOT\Drive\shell\runas]

[HKEY_CLASSES_ROOT\Drive\shell\runas]
@="获取超级管理员权限"
"Icon"="C:\\Windows\\System32\\imageres.dll,-78"
"NoWorkingDirectory"=""

[HKEY_CLASSES_ROOT\Drive\shell\runas\command]
@="cmd.exe /c takeown /f \"%1\" /r /d y && icacls \"%1\" /grant administrators:F /t"
"IsolatedCommand"="cmd.exe /c takeown /f \"%1\" /r /d y && icacls \"%1\" /grant administrators:F /t"
```

重命名文件名为 `Add.reg`.双击运行。右键点击“获取超级管理员权限即可”。

::pic
---
src: https://gitee.com/hcbug/picture1/raw/master/20260815224700604.webp
caption: 前后对比
---
::

## 删除 TrustedInstaller 权限

新建文本文档，并将内容替换为：

```reg
Windows Registry Editor Version 5.00

[-HKEY_CLASSES_ROOT\*\shell\runas]

[-HKEY_CLASSES_ROOT\Directory\shell\runas]

[-HKEY_CLASSES_ROOT\dllfile\shell]

[-HKEY_CLASSES_ROOT\Drive\shell\runas]

[-HKEY_CLASSES_ROOT\exefile\shell\runas]

[HKEY_CLASSES_ROOT\exefile\shell\runas]
"HasLUAShield"=""

[HKEY_CLASSES_ROOT\exefile\shell\runas\command]
@="\"%1\" %*"
"IsolatedCommand"="\"%1\" %*"
```

重命名文件名为 `Remove.reg`.双击运行即可。

建议将这两个文件保存，随用随取。不建议一直在 TrustedInstaller.



这两个代码块都在 `trustedinstaller.md` 里，是一个「安装 / 卸载」配对：**第一个添加右键菜单，第二个把菜单删掉**。

## DeepSeek 给的解析

### 1. 第一个：`Add.reg`（添加“获取超级管理员权限”右键菜单）

```reg
Windows Registry Editor Version 5.00
```
这是 regedit5 格式的头部，必须有，双击时才会被注册表编辑器接管。

#### 核心套路：两行命令

所有段落本质上都是同一件事：

```
takeown /f "%1" [.../r /d y]  &&  icacls "%1" /grant administrators:F [.../t]
```

- `%1` —— Explorer 传给命令的**被右键选中的对象路径**（带不带引号由作者手写的 `\"` 决定）。
- `takeown /f` —— 把文件/文件夹的**所有者**改成当前管理员（TrustedInstaller 是比 Administrator 更高的权限主体，所以要先“夺所有权”）。
- `/r` —— 递归；`/d y` —— 递归时对“是否继续”的提示自动回答 yes。
- `icacls ... /grant administrators:F` —— 给 `Administrators` 组授**完全控制（F = Full）**；`/t` 递归到子项。
- `&&` —— 前一步成功才执行授权，因为没拿到所有权时 icacls 会失败。

#### 为什么键名叫 `runas`

`...\shell\runas` 里的 `runas` 是 Windows 的**动词（verb）名**，它不是随便起的：Explorer 对 `runas` 这个动词会通过 `ShellExecute(..., "runas")` 发起调用，从而**触发 UAC 提权弹窗**。所以右键点下去会先弹 UAC，再以管理员身份执行 `takeown/icacls`。这也是为什么不用单独写提权脚本。

#### 四个注册位置

| 键路径 | 作用对象 |
|---|---|
| `HKEY_CLASSES_ROOT\*\shell\runas` | 所有**文件**（`*` 是通配类） |
| `HKEY_CLASSES_ROOT\Directory\shell\runas` | **文件夹** |
| `HKEY_CLASSES_ROOT\dllfile\shell\runas` | **.dll 文件**（单独一类，因为 dll 有自己的 ProgID） |
| `HKEY_CLASSES_ROOT\Drive\shell\runas` | **磁盘驱动器**（根目录右键） |

每个块的结构：

```reg
[-HKEY_CLASSES_ROOT\*\shell\runas]      ← 先“删除”该键，避免重复添加导致值叠加
[HKEY_CLASSES_ROOT\*\shell\runas]       ← 再“创建”
@="获取超级管理员权限"                    ← 默认值 = 右键菜单显示的文字
"Icon"="...\imageres.dll,-78"           ← 菜单图标（-78 是资源索引）
"NoWorkingDirectory"=""                 ← 不把工作目录设成被操作目录，防止 Explorer 占着文件夹导致删不掉
...\shell\runas\command
@="cmd.exe /c ..."                      ← 双击菜单实际执行的命令
"IsolatedCommand"="..."                  ← Explorer 在“独立进程”方式调用该动词时用的命令（内容相同，兼容用）
```

`[-HKEY_...]` 里的前导 `-` 是 reg 文件语法里的**删除键**，所以它既是“幂等保护”（重复导入不会出现两个菜单项），也是顺手清掉旧版本痕迹。

文件夹和驱动器那两块多带了 `/r /d y ... /t`（递归处理整个目录树），文件/dll 那块不带。

> 注意：这里授予的是 `Administrators` 组，不是 TrustedInstaller 本身——本质是“从 TrustedInstaller 手里抢回所有权，再交给管理员”，所以标题叫“获取 TrustedInstaller 权限”严格说是“绕过它”。


### 2. 第二个：`Remove.reg`（卸载）

```reg
[-HKEY_CLASSES_ROOT\*\shell\runas]
[-HKEY_CLASSES_ROOT\Directory\shell\runas]
[-HKEY_CLASSES_ROOT\dllfile\shell]
[-HKEY_CLASSES_ROOT\Drive\shell\runas]
```
四行删除，对应上面新增的四个入口。注意第三个写的是 `dllfile\shell`（整个 shell），比 Add 里删得更狠一点，会顺带清掉别的工具给 dll 加的菜单——这是个小瑕疵。

```reg
[-HKEY_CLASSES_ROOT\exefile\shell\runas]

[HKEY_CLASSES_ROOT\exefile\shell\runas]
"HasLUAShield"=""

[HKEY_CLASSES_ROOT\exefile\shell\runas\command]
@="\"%1\" %*"
"IsolatedCommand"="\"%1\" %*"
```
这一段**不是删除自己**，而是**恢复 exe 的默认行为**：

- `exefile\shell\runas` 是 Windows 自带的「以管理员身份运行」动词，默认命令就是 `"%1" %*`（运行该 exe，并把后续参数原样传过去）。
- 有些优化/美化工具会改掉它（比如加 `runas /user:Administrator` 之类），这里先删再按默认值重建，`"HasLUAShield"=""` 让菜单显示 UAC 盾牌图标。
- 之所以要管它：`runas` 被上面几处滥用后，有时会牵连到 exe 的提权行为，所以卸载脚本顺手“复位”。


### 3. 实际效果与风险（作者也写了免责声明）

- 双击 `.reg` → 合并进注册表（需要管理员确认一次）。
- 之后右键文件/文件夹/盘符 → “获取超级管理员权限” → 弹 UAC → 所有权归 Administrators、权限 `F`。
- 风险点：`takeown /r /t` 对 `C:\Windows` 这类目录执行后，**TrustedInstaller 的保护被整体削弱**，系统更新/组件服务可能失败；对 System32 里文件乱删确实会蓝屏。这也是为什么脚本另外给了 `Remove.reg` 并建议“随用随取、不要常驻”。
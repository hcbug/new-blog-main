---
title: 获取 TrustedInstaller 权限
description: 删除文件需要XXX权限？文件已在XXX中打开？支持删除 System32 文件夹，释放C盘空间（bushi）。
date: 2026-08-15 23:04:00
updated: 2026-08-15 23:04:00
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
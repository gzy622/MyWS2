# 开发与交付指南

## 1. Web 开发

### 环境

- Node.js 18+；
- 现代浏览器；
- 无需 `npm install`。

### 启动

```powershell
node lan-server.js
```

访问 <http://localhost:8080>。服务将 `src/` 作为站点根目录，监听 `src/` 与 `tests/` 的文件变化，并向已连接页面发送 Live Reload。

Windows 可双击 `start-lan-server.bat`。不要直接双击 `src/index.html`。

### 服务端点

| 地址 | 用途 |
| --- | --- |
| `/__health` | 服务、Live Reload 客户端数和内容指纹 |
| `/__build-id` | 当前源码指纹及生成时间 |
| `/__livereload` | 开发期 SSE 通道 |

关闭 Live Reload：

```powershell
$env:DISABLE_LIVE_RELOAD = '1'
node lan-server.js
```

## 2. 测试与静态检查

```powershell
# 所有单元测试
node --test tests/*.test.mjs

# 浏览器自动验收（PowerShell 7 + Microsoft Edge）
.\tools\verify-web.ps1

# 浏览器模块与服务器语法
Get-ChildItem src/scripts/*.js | ForEach-Object { node --check $_.FullName }
node --check lan-server.js
node --check tools/content-id.cjs

# Git 空白错误
git diff --check
```

完整验收清单见 [`../engineering.md`](../engineering.md)。

浏览器自动验收会自行选择空闲端口，启动隐藏的临时 LAN 服务与 Edge 实例，检查三档移动视口、DOM 契约、控制台错误、成绩表横拖优先级、课程成绩 Sheet 点击保护和 Sheet 合成层释放。Edge 使用系统临时目录中的专用隔离配置，不接触默认浏览器数据；成功后清理当次运行日志，失败时保留诊断目录并输出路径，可用 `-KeepArtifacts` 在成功时也保留。

## 3. 内容指纹

```powershell
npm run code:id
```

内容指纹只覆盖 `src/index.html`、`src/styles/` 和 `src/scripts/`，用于对比电脑源码、LAN 服务和 APK 内 Web 资源是否一致。

App 内长按左上菜单、连续点击菜单 3 次，或使用 `?sheetDebug=1` 可查看 build 信息。`origin` 为局域网地址时使用 Live Reload；原生 `https://localhost` 一类地址通常表示使用 APK 内资源。

## 4. 单文件导出

```powershell
.\tools\build-single-html.ps1
```

默认读取 `src/index.html`，递归内联本地 CSS、CSS 资源和 ES Module，生成：

```text
dist/teacher-workbench.single.html
```

可覆盖输入和输出：

```powershell
.\tools\build-single-html.ps1 -InputPath src/index.html -OutputPath dist/demo.html
```

`dist/` 是生成目录，不要手工维护。

## 5. Capacitor Android

### 环境

- JDK 21+；
- Android SDK 与 adb；
- 已授权的 Android 设备；
- 项目根目录执行过 `npm install`。

Android 是可选通道，不影响 Web Demo 启动。

### 同步 Web 资源

```powershell
npm run sync:www
```

该命令清空并重建 `www/`，只复制 `src/index.html`、`src/styles/`、`src/scripts/`，并写入 `www/build-id.json`。`www/` 不得手工编辑。

### 构建与部署

```powershell
npm run build:apk
npm run deploy:apk
```

部署参数：

- `-Serial <序列号>`：指定设备；
- `-Fresh`：安装前卸载；
- `-NoLaunch`：安装后不启动；
- `-SkipSync`：跳过 Web 资源与 Capacitor 同步。

示例：

```powershell
npm run deploy:apk -- -Serial <序列号> -Fresh
```

### 原生 Live Reload

```powershell
npm run preview:native
```

也可双击 `start-native-preview.bat`。常用参数：

- `-Serial <序列号>`；
- `-Lan`：强制使用局域网 IP；
- `-Usb`：使用 `localhost` 与 adb reverse；
- `-HostAddress <ip>`：多网卡或 VPN 环境指定地址；
- `-Port <端口>`：默认 `8080`；
- `-NoServer`：复用已启动的 LAN 服务。

无线调试默认优先常见局域网地址并跳过常见 VPN 网段。手机和电脑必须处于同一网络，且防火墙允许 Node.js。

## 6. 手机同步控制台

```powershell
npm run sync:phone
```

或双击 `sync-phone.bat`。默认流程：

1. 连接 adb 设备；
2. 启动或复用 LAN 服务；
3. 监视 `src/`；
4. 已安装且 LAN 可达时跳过首次 APK 构建；
5. 在控制台按数字选择热更新、安装、检测等操作。

主要操作：

- `1`：开启保存即更新；
- `2`：构建并安装 APK；
- `3`：刷新连接与版本；
- `0`：退出；
- `-Details`：显示诊断信息和高级操作。

按 `9` 只重建电脑上的 `www/`，不会直接改变手机画面。

## 7. 排查顺序

原生预览内容不一致时按顺序检查：

1. 电脑执行 `npm run code:id`；
2. 请求 `http://localhost:8080/__health`，确认 `id` 与电脑一致；
3. 检查 `clients > 0`，否则 Live Reload 尚未接通；
4. 在 App 调试条对比 `build` 与 `origin`；
5. 检查同一 Wi‑Fi、防火墙、`-HostAddress` 或 `-Usb`；
6. 仍不稳定时使用 `npm run deploy:apk` 将当前源码写入 APK。

触觉反馈在 Capacitor 内只通过原生 Haptics 发出；Web 路径只使用 `navigator.vibrate`，不能双发。

## 8. 脚本文件格式

- 根目录 `.bat`：纯 ASCII、CRLF；
- `tools/*.ps1`：UTF-8 BOM、CRLF；
- 不在 `.bat` 中加入中文提示，避免 Windows 代码页误读。

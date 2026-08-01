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
# 仅在用户于当前任务明确要求时执行。
.\tools\verify-web.ps1

# 浏览器模块与服务器语法
Get-ChildItem src/scripts/*.js | ForEach-Object { node --check $_.FullName }
node --check lan-server.js
node --check tools/content-id.cjs

# Git 空白错误
git diff --check
```

完整验收清单见 [`../engineering.md`](../engineering.md)。

浏览器自动验收仅在用户于当前任务明确要求时执行。它会自行选择空闲端口，启动隐藏的临时 LAN 服务与 Edge 实例，检查三档移动视口、DOM 契约、控制台错误、成绩表横拖优先级、课程成绩 Sheet 点击保护和 Sheet 合成层释放。Edge 使用系统临时目录中的专用隔离配置，不接触默认浏览器数据；成功后清理当次运行日志，失败时保留诊断目录并输出路径，可用 `-KeepArtifacts` 在成功时也保留。

## 3. 内容指纹

```powershell
npm run code:id
```

内容指纹只覆盖 `src/index.html`、`src/styles/` 和 `src/scripts/`，用于对比电脑源码、LAN 服务和 APK 内 Web 资源是否一致。

打开设置页即可在右下角看到当前内容指纹及生成时间（UTC+8，精确到秒）；「更多」底部 Sheet 底部同样显示当前内容指纹。长按左上角设置、连续点击设置 3 次，或使用 `?sheetDebug=1` 可开启按需诊断：调试条会保留最近 120 条手势边界、Sheet 落位与计算动效、登记业务结果，以及未捕获异常；手势边界日志含 `sessionId`、`owner`、`activationSource`、`clearReason`，不记录逐帧触摸、姓名、分数值或输入原文。调试开启时控制台只输出以 `[twb-debug]` 开头的单行 JSON，方便过滤；`?courseDebug=1` 保持兼容但启用同一套诊断。`origin` 为局域网地址时使用 Live Reload；原生 `https://localhost` 一类地址通常表示使用 APK 内资源。

手势阈值与点击保护的纯逻辑在 `src/scripts/gesture-policy.js`，对应 `tests/gesture-policy.test.mjs`；IME 立即操作与幽灵点击保护的 DOM 实现在 `src/scripts/pointer-guards.js`。

### 只读实时结构化日志快速入口

适用于已获当前任务授权的 Android 运行时排查：设备已通过 ADB 连接、Debug App 已打开，且顶栏下方右侧出现调试胶囊（左侧空心圆为标记复现、标记中变为蓝色方块，中间「详情」为展开按钮、右侧为日志条数）。先用 `adb devices -l` 确认设备；同一设备可能同时出现 IP 与 mDNS 两条记录，必须选定一个序列号并在后续命令中始终显式传给 `-s`。

```powershell
adb devices -l
$twbDeviceSerial = '<设备序列号>'
$twbAppPid = (adb -s $twbDeviceSerial shell pidof com.teacherworkbench.app).Trim()

# 持续读取当前 App 进程的新日志；按 Ctrl+C 停止。
adb -s $twbDeviceSerial logcat -v threadtime --pid $twbAppPid Capacitor/Console:I '*:S' |
  Select-String -SimpleMatch '[twb-debug]'

# 复现已经完成时，读取当前 App 进程缓冲区内的已有日志。
adb -s $twbDeviceSerial logcat -d -v threadtime --pid $twbAppPid |
  Select-String -SimpleMatch '[twb-debug]'
```

看到以 `[twb-debug]` 开头、且 JSON 中 `source` 为 `teacher-workbench` 的记录，即表示读取链路有效。该入口只读取本项目结构化日志，不代表已执行构建、部署或交互验收；App 未运行、诊断条未开启或任务未授权 Android 调试时不适用。不要执行 `adb logcat -c`，以免清空整台设备的日志缓冲区。完整真机排查步骤见本页「真机运行时调试（智能体执行清单）」。

### 录制复现日志（自动上报，无需手动转移）

发现 bug 想立刻复现并交给智能体修复时，在 App 调试面板点**左侧空心圆**（复现前点）标记复现；标记中会变为蓝色方块，复现后再次点按停止并上报；或直接点「上报最近日志」把当前缓冲一键上报。停止/上报后日志**自动送达电脑**，无需在手机上复制粘贴：

- **热更新 / LAN 模式**：自动 POST 到 LAN 服务，保存为项目根目录 `.debug-rec/` 下的文本文件（git 忽略），服务控制台打印 `[debug-rec] saved <文件名>`；
- **App 打包模式**：自动写入应用私有目录 `files/`，文件名为 `twb-rec-<recId>.log`；
- **剪贴板兜底**：同步复制到剪贴板，可手动粘贴。

智能体获取：

```powershell
# LAN / 热更新模式：取最新一条
Get-ChildItem .debug-rec\ | Sort-Object LastWriteTime -Descending | Select-Object -First 1

# App 模式：列出并读取私有文件（debug APK 可用 run-as）
adb -s <序列号> shell run-as com.teacherworkbench.app ls files
adb -s <序列号> exec-out run-as com.teacherworkbench.app cat files/twb-rec-<recId>.log
```

录制期间每条控制台日志带 `recId`，也可用 logcat 按 `recId` 抓取（见上「只读实时结构化日志快速入口」）。标记复现条数上限与总缓冲相同（120 条）；begin/end 标记不计入复现内容。面板状态行显示「已存电脑 / 已存 App / 已复制」等上报结果。

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

智能体仅在用户于当前任务明确要求时执行 Android 同步、构建、部署、真机检查或 adb 调试。

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

### 真机运行时调试（智能体执行清单）

以下流程适用于已通过无线调试连接、且已打开本项目 Debug App 的设备。所有命令均在项目根目录的 PowerShell 7 中执行。

1. 先确认 PowerShell 版本、依赖和设备状态。`adb devices -l` 可能同时显示 mDNS 与 IP 两条记录；必须选定其中一个可用序列号并在后续每条 adb 命令中传入 `-s $deviceSerial`，避免“more than one device/emulator”。

   ```powershell
   $PSVersionTable.PSVersion.ToString()
   'adb', 'node', 'npm', 'java' | ForEach-Object {
     Get-Command $_ -ErrorAction Stop | Select-Object -ExpandProperty Source
   }

   adb devices -l
   $deviceSerial = '<设备序列号>'
   adb -s $deviceSerial get-state
   adb -s $deviceSerial shell dumpsys activity activities | Select-String 'topResumedActivity'
   ```

2. 先运行与改动直接相关的快速检查。部署前检查 `git status --short`，不得覆盖用户已有的工作区改动。浏览器自动验收只在用户于当前任务明确要求时执行。

   ```powershell
   node --test tests/*.test.mjs
   git diff --check
   # 仅在用户明确要求时执行：
   # .\tools\verify-web.ps1
   ```

3. 构建并覆盖安装当前 Debug APK。默认**不要**传 `-Fresh`，以保留设备上的业务数据；只有已获明确授权时才使用它。

   ```powershell
   npm run deploy:apk -- -Serial $deviceSerial
   ```

4. 在 App 内长按左上角设置约 0.5 秒，或连续点击该按钮 3 次，开启会话级诊断。顶栏下方右侧出现调试胶囊（左空心圆 = 标记复现，标记中变蓝色方块；中「详情」= 展开/收起，右数字 = 日志条数）即表示已开启；胶囊整体可拖拽移动位置（会话内保留），详情面板会自动在胶囊上方或下方选择可见方向，并限制在视口内；展开面板内「关闭」或重复上述手势可关闭调试，点面板外空白可收起日志。优先通过该可见控件开启，不要依赖特定设备的 ADB 坐标。

5. 只读取项目的结构化日志。不要依据原始 Logcat 的 `E/W` 数量判断问题：Android 厂商、媒体和 WebView 会输出与项目无关的噪声。`[twb-debug]` 是本项目唯一的运行时诊断前缀。

   ```powershell
   # 持续观察：仅保留项目结构化诊断。
   adb -s $deviceSerial logcat -v threadtime Capacitor/Console:I '*:S' |
     Select-String -SimpleMatch '[twb-debug]'

   # 读取当前进程已有的诊断，适合复现完成后保存证据。
   $appPid = (adb -s $deviceSerial shell pidof com.teacherworkbench.app).Trim()
   adb -s $deviceSerial logcat -d -v threadtime --pid $appPid |
     Select-String -SimpleMatch '[twb-debug]'
   ```

6. 复现时记录触发路径和结构化事件。日志覆盖：

   - `gesture`：Sheet 归属、按下、轴锁定、释放、位移、速度与落点；不逐帧记录 `pointermove`。
   - `motion`：Sheet 进入落位时的实际 CSS `transition-property`、时长、缓动和 reduced-motion 状态。
   - `logic`：网格/座位登记、学生记录打开与保存的结果，只保留作业和学生 ID，不含姓名、分数值或输入原文。
   - `runtime`：未捕获异常与未处理的 Promise 拒绝。
   - `record`：录制会话的 begin/end 标记，携带 `recId` 与起止时间，配合上方「录制复现日志」按 `recId` 抓取。

7. 收尾时保留必要的截图、结构化日志片段和复现步骤；不执行 `adb logcat -c`（会清空整台设备的日志缓冲区）。若不需要继续观察，关闭 App 内诊断条，避免它遮挡顶栏。

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

独立运行 `npm run preview:native` 是前台诊断入口，日志直接输出到当前终端。由手机同步控制台选择「1」调用时，则以 `-Controlled` 参数后台托管：无窗口运行、标准输出与错误重定向到会话临时日志，所有状态在主控制台查看。

## 6. 手机同步控制台

### 前置条件

- PowerShell 7（`pwsh`）与 Windows Terminal（`wt.exe`）：
  - `winget install Microsoft.PowerShell`
  - `winget install Microsoft.WindowsTerminal`
- 其余依赖见「Capacitor Android」一节。

### 启动

```powershell
npm run sync:phone
```

或双击 `sync-phone.bat`：先检查 `pwsh`、`wt`、`node`、`adb` 与依赖，再在 Windows Terminal 中打开 PowerShell 7 控制台运行本脚本，临时批处理窗口立即退出；若当前已在 Windows Terminal 中运行，则直接复用当前窗口，不会递归打开新窗口。

稳定状态下只保留一个长期可见窗口（Windows Terminal 中的 `sync-phone` 控制台）。`node.exe` LAN 服务与原生 Live Reload（`tools/preview-native.ps1` 后台运行）均由主脚本无窗口托管，选择「1」不会出现新的 Windows Terminal、`conhost.exe` 或 `node.exe` 窗口；两者的标准输出与错误重定向到会话临时日志，不依赖任何服务器窗口。

默认流程：

1. 连接 adb 设备；
2. 启动或复用 LAN 服务（按端口、`/__health` 与 PID 判定就绪；已存在且健康的服务直接复用，退出时不会被误杀）；
3. 监视 `src/`；
4. 已安装且 LAN 可达时跳过首次 APK 构建；
5. 在控制台按数字选择热更新、安装、检测等操作。

主面板状态：

- LAN 服务：启动中 / 正常 / 失败；
- Live Reload：未启动 / 构建/推送中 / 已连接 / 异常退出；
- 按 `1` 后主控制台实时显示后台构建与推送安装日志末尾（每约 1.5 秒刷新）；日志长时间无进展且 WebView 仍未连上时才判定超时；
- `-Details` 时额外显示后台进程 PID 与日志位置；异常退出时主控制台显示日志末尾摘要与完整日志路径。

主要操作：

- `1`：后台开启保存即更新。后台进程先同步 Web 资源、构建并推送安装 APK，再等待 App 的 WebView 订阅；期间主控制台持续显示构建/推送进度与状态，完成前不会误报「等待连接」；
- `2`：构建并安装 APK；
- `3`：刷新连接与版本；
- `0`：退出（同时终止本次会话启动的 LAN 服务与 Live Reload 进程树；关闭主控制台或脚本异常退出时同样清理，不影响用户手动启动或占用端口的外部服务）。

按 `9` 只重建电脑上的 `www/`，不会直接改变手机画面。

后台临时日志位于系统临时目录（`$env:TEMP`），文件名形如 `sync-phone-lan-*.log`、`sync-phone-livereload-*.log`：正常退出时自动清理；启动失败或异常退出时保留用于排查。

## 7. 排查顺序

原生预览内容不一致时按顺序检查：

1. 电脑执行 `npm run code:id`；
2. 请求 `http://localhost:8080/__health`，确认 `id` 与电脑一致；
3. 检查 `clients > 0`，否则 Live Reload 尚未接通；
4. 在 App 调试条对比 `build` 与 `origin`；
5. 检查同一 Wi‑Fi、防火墙、`-HostAddress` 或 `-Usb`；
6. 仍不稳定时使用 `npm run deploy:apk` 将当前源码写入 APK。

触觉反馈在 Capacitor 内只通过原生 Haptics 发出；Web 路径只使用 `navigator.vibrate`，不能双发。

## 8. 文本文件格式

- 源码、文档与配置文本：UTF-8 无 BOM、LF；
- 根目录 `.bat`：纯 ASCII、CRLF；
- `tools/*.ps1`：UTF-8 BOM、CRLF；
- 不在 `.bat` 中加入中文提示，避免 Windows 代码页误读；
- 编辑器按根目录 `.editorconfig` 写入，Git 按 `.gitattributes` 规范化换行；新增文本类型时同步确认两处规则。

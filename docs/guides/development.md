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

### Pi 子智能体调用

#### Pi Subagent 扩展

Pi 会话中当前工具列表提供 `subagent` 时，优先使用安装在 `~/.pi/agent/extensions/subagent/` 的用户级扩展。扩展为每次委派启动独立 Pi 进程，支持单任务、并行任务和链式任务；本项目不安装示例 `/implement` 等模板，避免形成第二套固定实施流程。

| Agent | 模型 | 思考等级 | 选择条件 |
| --- | --- | --- | --- |
| 「虎鲸」 | DeepSeek V4 Flash | `High` | 用户指定 DeepSeek，或未指定模型的常规任务 |
| 「皓月」 | GPT-5.6 Luna | `Max` | 用户指定 Luna 子智能体，或复杂分析与关键复核 |
| 「远山」 | GPT-5.6 Terra | `High` | 用户指定 Terra 子智能体 |

Agent 定义位于 `~/.pi/agent/agents/`。默认只使用用户级 Agent；不要为本项目启用 `agentScope: "project"` 或 `"both"`，除非仓库后续明确新增并审核 `.pi/agents/`。扩展不可用或当前环境没有 `subagent` 工具时，直接使用下述 WebUI 回退，不为同一任务同时使用两种入口。

#### Pi 子智能体 WebUI 回退

双击根目录的 `start-pi-agent-webui.bat`，或运行：

```powershell
npm run pi:webui
```

访问 <http://127.0.0.1:4312>。页面只显示由 Codex 分派的 Pi 子智能体。每项任务使用一张状态卡片，左侧显示稳定生成的头像和按模型生成的名称：DeepSeek 系列使用鲸类名称，GPT-5.6 Luna 使用以「月」字结尾的词语，其他模型使用通用名称；右侧显示模型、思考等级、任务、状态、当前动作和最终结果，右上角显示已工作时间。关闭启动窗口会停止 WebUI 及由它启动的子智能体。

Codex 使用本机控制命令分派任务。任务正文优先从标准输入传入，避免长文本转义问题：

```powershell
@'
只读取 package.json，说明项目名称。
'@ | node tools/pi-agent-webui/control.mjs start --model luna --title "确认项目名称"

node tools/pi-agent-webui/control.mjs list
node tools/pi-agent-webui/control.mjs stop <任务ID>
```

`--model` 可选 `luna` 或 `flash`。状态服务尚未启动时，控制命令会说明启动方式。浏览器请求不能调用分派或停止接口。

该工具要求本机已安装并登录 Pi Coding Agent；默认允许子智能体在当前工作区内读写，并开放 Shell 运行任务所需的本地检查。路径检查扩展会阻止文件工具访问工作区外位置，以及对 `.git`、`node_modules`、`www` 和 `dist` 的直接写入。Shell 默认从仓库根目录启动；任意 Shell 命令具备访问工作区外位置的能力，任务说明要求子智能体只处理当前工作区，并禁止大量删除、升级依赖、提交或推送 Git。它不进入教师工作台的 `src/`、内容指纹、单文件导出或 Android 同步流程。

## 2. 测试与静态检查

```powershell
# 所有单元测试
node --test tests/*.test.mjs

# 表格 / JSON 备份相关
node --test tests/workbook-transfer.test.mjs tests/csv-transfer.test.mjs tests/backup.test.mjs tests/roster-store.test.mjs

# 浏览器自动验收（PowerShell 7 + Microsoft Edge）
# 仅在用户于当前任务明确要求时执行。
.\tools\verify-web.ps1

# 浏览器模块与服务器语法
Get-ChildItem src/scripts/*.js | ForEach-Object { node --check $_.FullName }
node --check lan-server.js
node --check tools/content-id.cjs
node --check tools/pi-agent-webui/server.mjs
node --check tools/pi-agent-webui/agent-manager.mjs
node --check tools/pi-agent-webui/control.mjs
node --check tools/pi-agent-webui/public/app.js
node --test tests/pi-agent-webui.test.mjs

# Git 空白错误
git diff --check
```

### RTK 可选试用

RTK 仅用于减少智能体读取的终端输出，不参与应用运行、构建、测试逻辑或 CI。未安装 RTK 时，全部原命令保持可用。试用固定使用 Windows x86_64 MSVC 版 `v0.44.2`；从 [官方 Release](https://github.com/rtk-ai/rtk/releases/tag/v0.44.2) 下载后由用户放入 `PATH`，不写入仓库、不加入 `package.json`。不要从 crates.io 安装同名包。

安装和隐私检查：

```powershell
Get-Command rtk -ErrorAction Stop
rtk --version
rtk telemetry disable
rtk telemetry status
rtk config --create
```

Windows 配置文件位于 `$env:APPDATA\rtk\config.toml`。试用期关闭失败原始输出保存，避免学生姓名、成绩、设备信息或其它诊断内容留在 RTK 日志中：

```toml
[tee]
enabled = false
mode = "never"
```

Codex 当前依靠说明文件主动调用 RTK。试用期不得运行 `rtk init -g --codex`，也不安装自动改写 Hook。建议只在输出预计较长时显式调用：

```powershell
# 概览 Git 状态、差异和提交
rtk git status
rtk git diff
rtk git log -n 10

# 折叠通过项，只突出测试失败
rtk test node --test tests/*.test.mjs

# 初步搜索；需要完整长行和精确上下文时改用原始 rg
rtk grep "pattern" src
```

以下操作继续使用原命令：精确源码读取、`git diff --check`、文件级完整差异、失败调查、安全检查、复杂 PowerShell 命令，以及 `git add`、`git commit`、`git push`。RTK 输出无法直接支持判断时，立即改用原命令，不重复调整压缩方式。

以 10 个真实开发任务作为一个试用周期，并使用 `rtk gain` 查看估算结果。满足以下条件后再考虑长期采用：

| 核对项 | 采用条件 |
| --- | --- |
| 终端输出减少量 | 平均至少 30% |
| 因信息不足重新执行原命令 | 每 10 个任务不超过 2 次 |
| 命令退出码 | 与原命令一致 |
| 测试失败信息 | 可直接定位失败测试 |
| Windows 兼容性 | 中文、空格路径和 PowerShell 参数正常 |

停止试用时，从 `PATH` 移除 `rtk.exe`，并按需删除 `$env:APPDATA\rtk` 下的配置与本地统计数据。仓库无需执行恢复操作。

XLSX 导入导出由 `src/scripts/workbook-transfer.js` 实现，底层 Office Open XML/ZIP 处理位于 `src/scripts/xlsx-workbook.js`，文件读写与 JSON 备份共用 `src/scripts/text-file-transfer.js`。新导出格式为版本 3，固定按顺序生成「座位表」「作业登记」「班干安排」「值日安排」「课程表」「考试成绩」六个工作表；版本 2 的「学生名单」「作业登记」「人员安排」「课程表」「考试成绩」五表、版本 1 的十二工作表 XLSX 和旧 CSV 仍从「导入表格」读取。人工编辑时保留固定工作表、标题行、隐藏编号、数量信息和完整矩阵数据；座位表 A2:M9 是 8×13 行优先矩阵，A10:M10 是下方合并「讲台」，A12:D 起名单区可修改姓名、首字母和座位行/列，隐藏学生编号用于关联。作业 C 列起所有作业项列居中；班干和值日的成员序列使用带编号的 `姓名（编号 n）`，以「；」分隔并支持反斜杠转义；检查失败会拒绝整份文件并提示 `工作表!单元格：说明`。

表格快速检查应覆盖：v3 六个固定工作表及顺序、隐藏行列、8×13 每格和空位、讲台合并、稳定 ID 改名/移动、作业 C+ 标题/当前标记/`✓`/数字分数的居中、班干和值日拆表与单格多成员、空成员、重名、重复/缺失学生、成员编号错误、课程表十个节次、考试/科目两层表头、缺少行列、重复座位、多个当前作业、无效成绩，以及版本 2 五表、版本 1 十二表、旧 CSV 和 JSON 备份互不影响。可以使用常用表格库打开生成文件并重新保存，再将保存后的文件交回 `parseRosterWorkbook` 检查隐藏编号、空白矩阵和列级默认样式仍可读取。

完整验收清单见 [`../engineering.md`](../engineering.md)。

浏览器自动验收仅在用户于当前任务明确要求时执行。它会自行选择空闲端口，启动隐藏的临时 LAN 服务与 Edge 实例，检查三档移动视口、DOM 契约、控制台错误、成绩表横拖优先级、课程成绩 Sheet 点击保护和 Sheet 合成层释放。Edge 使用系统临时目录中的专用隔离配置，不接触默认浏览器数据；成功后清理当次运行日志，失败时保留诊断目录并输出路径，可用 `-KeepArtifacts` 在成功时也保留。

## 3. 内容指纹

```powershell
npm run code:id
```

内容指纹只覆盖 `src/index.html`、`src/styles/` 和 `src/scripts/`，用于对比电脑源码、LAN 服务和 APK 内 Web 资源是否一致。指纹采用 `XXXX-XXXX-XX` 格式的 Crockford Base32，例如 `3W4P-JE5E-Z0`；底层取 SHA-256 开头 50 位，字符排除易混淆的 `I`、`L`、`O`、`U`。已有 APK 中的旧十六进制指纹不会自动变化，重新安装当前版本后会写入新格式。

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

1. 检查 adb 设备；没有可用设备时显示连接中心，可重新检查或进入无线调试；
2. 启动或复用 LAN 服务（按端口、`/__health` 与 PID 判定就绪；已存在且健康的服务直接复用，退出时不会被误杀）；
3. 检查 App、网络和当前版本；
4. 监视 `src/`；
5. 显示首页，等待用户选择实时预览或安装当前版本。

启动检查不会自动构建或安装。`-ForceInitialDeploy` 仍会在检查后立即安装，适合明确需要自动部署的场景；`-SkipInitialDeploy` 继续保留。

控制台使用固定的工作台式 TUI：顶部显示当前设备、页面名称和本地内容指纹，方便与手机上显示的内容指纹对照；中间显示当前情况、手机内容和一个下一步，底部集中放置按键。总体状态包括「尚未安装」「可以开始预览」「正在开启实时预览」「实时预览已开启」「当前只能使用安装版」「实时预览启动失败」。技术信息、手机运行指纹和日志位于 `D` 技术详情。

开启实时预览时会显示固定的四步进度：准备网页资源、构建 Android 应用、安装到手机、等待手机页面连接；安装当前版本时显示前三步。两种任务都会持续读取后台输出，依次更新准备、打包、安装和等待连接等阶段。实时预览在 Gradle 打包完成时进入安装阶段，以覆盖 Capacitor 实际推送 APK 的等待时间。进度界面只在阶段或页面发生变化时重绘，等待期间不会周期性清屏；构建日志默认隐藏，可按 `D` 查看，失败时首页显示原因、影响和建议。

主要操作：

- `1`：开启或重新连接实时预览。首次开启会构建并安装预览版本；之后保存 `src/` 中的文件，手机会自动刷新，控制台需要保持运行；
- `2`：安装当前版本到手机。此操作会停止实时预览，安装完成后手机使用安装包内的内容；完成后可按 `1` 恢复实时预览；
- `3`：重新检测手机连接，并同时刷新电脑与手机版本信息；
- `W`：打开无线调试，可选择配对并连接新手机、连接已配对手机，或重新检查当前设备；
- `M`：打开更多操作，包含重启 App、保存后自动安装 APK、清理缓存、清除全部数据和仅生成电脑上的 `www/`；
- `D`：显示或隐藏技术详情；启动参数 `-Details` 会直接打开技术详情；
- `0`：退出（同时终止本次会话启动的 LAN 服务与 Live Reload 进程树；关闭主控制台或脚本异常退出时同样清理，不影响用户手动启动或占用端口的外部服务）。

更多操作中的 `8` 会要求输入完整的 `CLEAR`。它会清除 App 全部数据，包括本地名单等内容。`9` 仅生成电脑上的 `www/`，不会改变手机画面。

### 手动无线调试

Android 11 及以上可直接使用配对码建立无线调试，手机与电脑需要连接同一个无线网络：

1. 在手机打开「开发者选项 → 无线调试」；
2. 控制台按 `W`，选择「配对并连接新手机」；
3. 手机选择「使用配对码配对设备」，把该页面的 IP、配对端口和六位配对码输入控制台；
4. 配对成功后返回「无线调试」主页面，把主页面显示的 IP 和连接端口输入控制台；
5. 后续通常只需按 `W` 并选择「连接已配对的手机」。

配对端口与连接端口由 Android 分别生成，通常不相同。脚本依次调用 `adb pair IP:配对端口 配对码` 和 `adb connect IP:连接端口`；不依赖 mDNS 自动发现。更换无线网络、手机关闭无线调试或连接端口变化后，需要重新输入主页面的连接地址。手机在「已配对的设备」中忘记本电脑，或撤销 adb 调试授权后，需要重新配对。

后台临时日志位于系统临时目录（`$env:TEMP`），文件名形如 `sync-phone-lan-*.log`、`sync-phone-livereload-*.log`：正常退出时自动清理；启动失败或异常退出时保留用于排查。

## 7. 排查顺序

原生预览内容不一致时按顺序检查：

1. 电脑执行 `npm run code:id`；
2. 请求 `http://localhost:8080/__health`，确认 `id` 与电脑一致；
3. 检查 `clients > 0`；`connectionSeq` 是该 LAN 服务进程累计接受的 Live Reload 连接序号，可用于区分启动前已有连接与本次新连接；
4. 在 App 调试条对比 `build` 与 `origin`；
5. 检查同一 Wi‑Fi、防火墙、`-HostAddress` 或 `-Usb`；
6. 仍不稳定时使用 `npm run deploy:apk` 将当前源码写入 APK。

触觉反馈在 Capacitor 内只通过原生 Haptics 发出；Web 路径只使用 `navigator.vibrate`，不能双发。

## 8. 文本文件格式

- 源码、文档与配置文本：UTF-8 无 BOM、LF；
- 根目录 `.bat`：纯 ASCII、CRLF；
- `tools/*.ps1`：UTF-8 BOM、CRLF；
- 不在 `.bat` 中加入中文提示，避免 Windows 代码页误读；
- 编辑器按根目录 `.editorconfig` 写入，Git 按 `.gitattributes` 规范化换行；新增文本类型时同步确认两处规则；
- 本页约定可用 `python tools/py/repo-format-check.py` 自动核对（见 §9）。

## 9. Python 辅助脚本（可选）

以下工具位于 `tools/py/`，需本机 `python` 可用；它们不参与 `npm` 与构建流程，按需手动运行：

| 脚本 | 用途 | 常用参数 |
| --- | --- | --- |
| `env-check.py` | 验证 Python 解释器与已装第三方包均可导入 | `--check-lan`：额外探测本地 LAN 服务健康端点 |
| `repo-format-check.py` | 按 §8 与根目录 `.gitattributes` 核对文本格式。默认检查仓库 blob（git 规范化后的入库形式：一律 LF，ps1 保留 BOM，bat 纯 ASCII）；`--working-tree` 改按磁盘内容检查，并把 `core.autocrlf` 检出转换与真实违规分开报告 | `--working-tree` |
| `debug-rec-summary.py` | 汇总 `.debug-rec/` 录制日志：头部信息、事件类型统计与末尾事件 | 默认最新一份；`--all` 全部；`-n <条数>` 控制末尾条数 |

示例：

```powershell
python tools\py\env-check.py
python tools\py\repo-format-check.py
python tools\py\debug-rec-summary.py --all
```

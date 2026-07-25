# 架构说明

本项目是零依赖的原生 HTML、CSS 与 ES Modules Demo，不需要构建步骤。

## 启动

```powershell
node lan-server.js
```

请通过 `http://localhost:8080` 访问；不要直接双击 `index.html`，因为浏览器会限制 ES Modules 的加载。

## 可选单文件导出

需要离线分发或直接双击运行时，可使用 PowerShell 7 执行：

```powershell
.\build-single-html.ps1
```

脚本以 UTF-8 读取源码并生成不带 BOM 的 `dist/teacher-workbench.single.html`。CSS `@import`、CSS 本地资源与 ES Module 依赖会被内联；该导出流程是可选项，不改变开发入口和零构建启动方式。可通过 `-InputPath` 与 `-OutputPath` 覆盖默认输入、输出位置。

## 文件职责

| 位置 | 职责 |
| --- | --- |
| `index.html` | 静态语义结构、三页内容、人员列表容器、登记网格与座位画布容器、业务浮层、导航、通用菜单与 Toast 文案。修改页面文案请编辑此文件；学生、座位、班干与值日默认数据由领域模型维护。 |
| `styles/tokens.css` | 颜色、尺寸与动画变量（含 Sheet / Popover / 遮罩语义 token）。 |
| `styles/base.css` | Reset、基础元素、通用动画和减弱动效设置。 |
| `styles/shell.css` | 应用外壳、顶栏、页面视口及桌面容器。 |
| `styles/content.css` | 页面内容组件、卡片、进度与趋势图。 |
| `styles/sheets.css` | 共享 Sheet 遮罩与面板基础类。 |
| `styles/controls.css` | 底部导航、姓名字号、通用菜单、更多菜单、确认面板、遮罩和 Toast。 |
| `styles/assignments.css` | 作业列表与作业名称样式。 |
| `styles/main.css` | 按顺序聚合所有样式模块。 |
| `build-single-html.ps1` | 将当前源码以 UTF-8 打包为可直接打开的独立 HTML。 |
| `scripts/dom.js` | 固定 DOM 引用与缺失元素检查。 |
| `scripts/state.js` | UI 瞬时状态来源与状态边界。 |
| `scripts/navigation.js` | 主页面、子视图和导航渲染及点击。 |
| `scripts/gestures.js` | 横向切页与纵向 Sheet 手势路由（打开/全屏跟手）。 |
| `scripts/sheet-drag.js` | 纵向 Sheet 的 progress 控制器与最上层栈。 |
| `scripts/sheet-gestures.js` | Sheet 纵向跟手与自滚动优先桥接。 |
| `scripts/focus.js` | 静默焦点与手势后清除顶栏焦点环。 |
| `scripts/drawer.js` | 通用菜单开关与 Sheet 注册。 |
| `scripts/toast.js` | 菜单反馈与 Toast 生命周期。 |
| `scripts/haptics.js` | 统一触觉反馈入口；全部为 `10ms`。Web 使用 `navigator.vibrate`；Capacitor 原生壳使用 `@capacitor/haptics` 的 `vibrate({ duration })`，二者互斥，不双发。 |
| `scripts/student-font-size.js` | 网格姓名字号控制及字号持久化。 |
| `scripts/seat-geometry.js` | 13×8 座位逻辑几何的唯一常量来源。 |
| `scripts/seat-canvas.js` | 座位画布的自适应定位、平移、缩放、惯性与编辑拖放手势。 |
| `scripts/roster-model.js` | 默认学生、座位、作业、班干、值日、课表节次、科目及领域纯校验函数。 |
| `scripts/roster-store.js` | 唯一业务状态、领域查询、变更与订阅通知。 |
| `scripts/roster-storage.js` | 业务 Schema 的严格读取、迁移（含 1→2→3）、回退与写入。 |
| `scripts/theme.js` | 浅色/深色主题状态、根主题属性、`theme-color` meta 与 Capacitor StatusBar 外观同步，以及受控主题持久化。 |
| `scripts/roster-renderer.js` | 基于 Store 同步渲染网格和座位卡。 |
| `scripts/people-renderer.js` | 基于 Store 同步渲染班干与值日列表。 |
| `scripts/people-interactions.js` | 人员页轻点指派、长按编辑、选人与编辑 Sheet。 |
| `scripts/courses-renderer.js` | 基于 Store 同步渲染周课表与成绩表。 |
| `scripts/courses-interactions.js` | 课程页课表格、节次改名、科目编辑与成绩录入 Sheet。 |
| `scripts/highlight-subjects.js` | 课表高亮科目关键词的设置 Sheet、匹配与受控持久化。 |
| `scripts/student-interactions.js` | 学生轻点、长按、右键和点击抑制。 |
| `scripts/student-record.js` | 学生记录、分数草稿、校验和焦点管理。 |
| `scripts/assignments.js` | 作业列表及新增、改名、删除流程。 |
| `scripts/more-sheet.js` | 更多菜单、确认面板与批量操作入口。 |
| `scripts/viewport.js` | Visual Viewport / 输入法：壳层锁定布局高度，仅当前输入浮层消化键盘 inset。 |
| `scripts/system-back.js` | 统一处理 Escape 与 Android 系统返回键，按优先级关闭最上层浮层。 |
| `package.json` / `capacitor.config.json` / `android/` | **可选** Android 打包通道（应用名「教师工作台」、包名 `com.teacherworkbench.app`）。不改变零依赖 LAN Demo 启动方式。 |
| `scripts/sync-capacitor-www.ps1` | 将 `index.html` / `styles` / `scripts` 同步到 Capacitor `www/`。 |
| `scripts/deploy-apk.ps1` | 一键同步、打 debug APK，并用 adb 安装到已连接设备。 |
| `scripts/preview-native.ps1` | 原生壳 Live Reload：启动 LAN 服务并 `cap run android --live-reload`。 |
| `scripts/main.js` | 初始化编排。 |

## 可选 Capacitor 打包

日常开发与验收仍以 `node lan-server.js` 为准，无需 npm/Android SDK。优先用原生壳预览时：

1. 安装 JDK 21+、Android SDK，并连接已开启调试的设备；项目根目录执行过 `npm install`。
2. 双击 `start-native-preview.bat`，或运行 `npm run preview:native`。
3. 脚本会：同步 `www` → 启动带文件监听的 `lan-server.js` → 用 Live Reload 安装/打开 App；保存 `index.html` / `styles` / `scripts` 后 WebView 应自动刷新。
4. **无线调试**默认走电脑局域网 IP（跳过常见 VPN 网段，并优先 `192.168.*`）；仅 USB 且要用 `localhost` 时加 `-Usb`。手机与电脑须同一 Wi‑Fi；AndroidManifest 须保留 `android:usesCleartextTraffic="true"`。
5. 启动时会用 `adb shell curl` 探测 `__health`；失败会黄字警告。完整安装包验收：`npm run deploy:apk`；仅打包：`npm run build:apk`。

### Live Reload 自检

| 检查 | 期望 |
| --- | --- |
| 终端打印的地址 | `http://192.168.x.x:8080`（无线）或 `http://localhost:8080`（`-Usb`） |
| `…/__health` 探测 | `OK: device reached …`；若 WARN 则手机仍可能吃 APK 旧资源 |
| App 内调试条（长按菜单 / 连点菜单 3 次 / `?sheetDebug=1`；默认右上角紧凑 `build` 条，点开才看日志） | `origin` 与终端 LAN 一致；`build` 与 `npm run code:id` 一致 |
| 按 `L` 后 | 控制台应出现「热更新已接通 · clients≥1」；若一直 `clients=0`，看弹出的热更新窗口报错 |
| 按 `D` 后 | 会断开热更新会话（包内 APK 无 `server.url`）；要继续热更新须再按 `L` |
| 无线调试 | mDNS 序列号常含空格，`native-run`/`cap run` 看不见；脚本会经 `adb mdns services` 映射为 `IP:端口` 再 `adb connect` |
| 改 `scripts/*.js` 后 | 仅在「已接通」时手机自动刷新；不刷新先看 `__health` / 防火墙 / `-HostAddress` |

无线调试序列号示例：`adb-XXXX (2)._adb-tls-connect._tcp` → 热更新实际使用 `192.168.x.x:port`。

### 如何确认手机与电脑代码一致

1. 电脑执行：`npm run code:id`，得到 12 位内容指纹（对 `index.html` + `styles` + `scripts` 哈希）。
2. 手机打开调试条（长按左上角菜单，或连点 3 次，或 `?sheetDebug=1`），看右上角 `build`；需要日志时再点该条展开。
3. **两者相同**即当前 Web 资源与电脑源码一致。
4. 同时看 `origin=`：局域网地址表示吃 Live Reload；`https://localhost` 一类表示吃 APK 内打包资源（指纹来自上次 `sync:www` / `deploy:apk`）。

LAN 服务也会在启动日志和 `/__health`、`/__build-id` 中返回同一指纹。

仍不稳定时用 `npm run deploy:apk`（把当前源码打进 APK，不依赖局域网加载）。

### 手机同步控制台（推荐日常）

双击根目录 `sync-phone.bat`（或 `npm run sync:phone`）：

1. 启动/复用 LAN 服务；**已安装且手机可达 LAN 时跳过首次打包**（需强制安装用 `-ForceInitialDeploy`）。
2. 界面顶部显示「下一步」与模式：`LAN 已通` → 按 **`L` 开启热更新**；仅当 `__health` 的 `clients>0` 才算真正接通（保存即刷新）。**按 `S` 只同步电脑 `www`，不会改手机画面。**
3. 监视 `index.html` / `styles` / `scripts`；日志会按模式提示（热更新 / 需 L / 需 D），不再把「指纹变化」一律说成必须推送。
4. 快捷键分层：日常 `L` / `H` / `R` / `I` / `Q`；完整安装（较慢）`D` / `A` / `C` / `X`；`S` 仅同步 www（不到手机）。

`preview:native` 常用参数（经 npm 传递时写在 `--` 之后）：

- `-Serial <序列号>`：多设备时指定目标
- `-Lan`：强制用电脑局域网 IP
- `-Usb`：强制 `localhost` + `adb reverse`
- `-HostAddress <ip>`：指定 Live Reload 主机地址（多网卡/VPN 时最稳）
- `-Port <端口>`：默认 `8080`
- `-NoServer`：假定 LAN 服务已在跑

`deploy:apk` 常用参数（经 npm 传递时写在 `--` 之后）：

- `-Serial <序列号>`：多设备时指定目标
- `-Fresh`：先卸载再安装
- `-NoLaunch`：安装后不自动打开
- `-SkipSync`：跳过 www / cap sync，仅重编并安装

原生层关闭 WebView overscroll 与系统默认 haptic，手势仍只在 Web 层处理，避免与 JS 触觉双层冲突。

## 状态与 DOM 契约

状态分为两个边界：`scripts/state.js` 是 UI 瞬时状态来源，`scripts/roster-store.js` 是学生、座位、作业、提交、分数、班干与值日的唯一业务状态来源。刷新后仍从中间的“登记”页和各页第一子视图开始；导航、子视图、通用菜单、浮层、座位编辑模式和画布 transform 均不持久化。持久化仅限学生姓名字号键 `teacher-workbench.student-name-font-size`、业务数据键 `teacher-workbench.roster.v1`、主题键 `teacher-workbench.theme` 与课表高亮关键词键 `teacher-workbench.highlight-subjects`，其读取和失败回退必须遵守工程 Spec。

`scripts/viewport.js` 将 Visual Viewport 的可见高度和顶部偏移同步到应用外壳；不支持时回退到 `window.innerHeight`。学生记录或作业输入期间只锁定背景网格的实际高度，不改变业务状态；短横屏仅在视口宽至少 500px 且高不超过 500px 时使用 10×5 网格，其他场景保持 5×10。

实现或评审改动前，还应阅读 `specs/` 下的产品、视觉、交互与工程约束；根目录 `AGENTS.md` 定义了强制执行顺序。

导航和内容依赖以下属性，修改结构时必须保留其含义：`data-page`、`data-index`、`data-sub`、`data-view`、`data-action`。

## 模块依赖

`dom.js`、`state.js` 和 `roster-model.js` 是基础模块。`roster-store.js` 只依赖模型并通过注入的 `roster-storage.js` 保存器持久化；渲染器和交互模块只通过 Store 读写业务数据，不直接修改业务数组。`navigation.js`、`gestures.js`、`drawer.js` 与 `toast.js` 只依赖 UI 基础模块（`gestures.js` 还使用导航的渲染接口）。`student-font-size.js`、`theme.js` 和 `highlight-subjects.js` 分别管理各自受控键；`seat-canvas.js` 依赖固定 DOM、`seat-geometry.js` 与 Store 操作接口，并独立保存非持久化的画布 transform。`main.js` 只负责创建 Store、初始化模块和注入接口，避免循环依赖。

修改导航请编辑 `scripts/navigation.js`，修改页面手势请编辑 `scripts/gestures.js`，修改通用菜单请编辑 `scripts/drawer.js`，修改网格姓名字号行为请编辑 `scripts/student-font-size.js`，修改领域数据请编辑 `scripts/roster-store.js`。视觉修改应按对应样式模块定位。

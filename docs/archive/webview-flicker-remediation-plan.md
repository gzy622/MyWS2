# WebView 闪烁修订计划

## 1. 当前状态

| 项目 | 状态 |
| --- | --- |
| 计划状态 | B1–B7 实施完成；静态与自动化检查通过；用户已确认验收通过并归档 |
| 最近更新 | 2026-08-03 |
| 当前负责人 | 已完成；用户于 2026-08-03 确认验收通过 |
| 目标 | 消除或验证 WebView 中的面板、遮罩、页面横滑、座位画布和 Toast 闪烁 |
| 当前代码状态 | 完成 B1–B7：修改 `gestures.js`、`scroll-thin.js`、`shell.css`、`sheets.css`、`controls.css`，同步 `interaction.md`、`engineering.md`；未生成 `www`/`dist`/Android 产物 |

本计划承接已验收的修订报告。后续智能体继续工作时，先读取本文件，再按本文件列出的现行交互文档和工程文档确认实现约束。每完成一个批次，都要更新复选框、验证结果、剩余风险和变更记录。

## 2. 本轮已完成

- [x] 完成相关 CSS、JavaScript 和文档的只读审查。
- [x] 修订风险报告：P0 0 项、P1 3 项、P2 4 项、P3 1 项。
- [x] 确认 16 个业务 Sheet 均使用 `createSheetController()`。
- [x] 确认全部 `src/scripts/*.js` 语法检查通过。
- [x] 确认 `git diff --check` 通过。
- [x] 确认审查开始时工作区干净。
- [x] 明确未执行浏览器自动化、外部服务、Edge/CDP、Android 构建部署和真机检查。

## 3. 工作范围

### 纳入

- 共享 Sheet：`sheet-drag.js`、`sheet-gestures.js`、`gestures.js`、`overlay-stack.js`、`focus.js`、`sheets.css`。
- 业务 Sheet：More、学生记录、作业、考试、人员、课程、重点科目、学生名单编辑及其样式。
- 座位画布：`seat-canvas.js`、`seat-geometry.js`、`roster-renderer.js`、`content.css`。
- Toast 与 Popover：`toast.js`、`student-font-size.js`、`controls.css`。
- 主页面与导航：`navigation.js`、`gestures.js`、`shell.css`、`controls.css`。
- 设置页、学生名单全屏页、成绩表、细滚动条和惯性滚动。

### 不纳入

- 未获得用户明确授权前，不启动浏览器自动验收、Edge/CDP、本地调试服务或 Android 链路测试。
- 不升级依赖，不生成 `www`、`dist` 或 Android 产物。
- 不覆盖用户已有改动，不顺带重命名、格式化或调整无关模块。
- 本计划只跟踪闪烁、空白、重绘和动画尾帧问题，不重新定义产品交互。

## 4. 风险登记表

实施期间使用的状态值为：`待处理`、`处理中`、`已验证`、`需运行确认`、`暂不处理`；归档时 R1–R8 均为 `已验证`。

| 编号 | 优先级 | 风险 | 证据位置 | 状态 | 处理批次 |
| --- | --- | --- | --- | --- | --- |
| R1 | P1 | 主页面横滑期间顶栏仍保留模糊，页面和滑块写入未按动画帧合并 | [`navigation.js`](../../src/scripts/navigation.js#L97)、[`gestures.js`](../../src/scripts/gestures.js#L504)、[`shell.css`](../../src/styles/shell.css#L11) | 已验证 | B3 |
| R2 | P1 | 学生名单全屏页跟手时仍保留头部模糊 | [`gestures.js`](../../src/scripts/gestures.js#L384)、[`controls.css`](../../src/styles/controls.css#L58)、[`shell.css`](../../src/styles/shell.css#L206) | 已验证 | B4 |
| R3 | P1 | 互斥浮层切换时旧、新面板和遮罩可能同时绘制 | [`sheet-drag.js`](../../src/scripts/sheet-drag.js#L742)、[`more-sheet.js`](../../src/scripts/more-sheet.js#L197)、[`sheets.css`](../../src/styles/sheets.css#L44) | 已验证 | B1、B5 |
| R4 | P2 | Sheet 手势中途修改外壳 `inert`，可能造成闪烁或指针中断 | [`sheet-drag.js`](../../src/scripts/sheet-drag.js#L198)、[`focus.js`](../../src/scripts/focus.js#L59) | 已验证 | B1 |
| R5 | P2 | 全屏面板和遮罩在每次 `pointermove` 中直接写入，缺少 RAF 合并 | [`gestures.js`](../../src/scripts/gestures.js#L399) | 已验证 | B4 |
| R6 | P2 | 座位模式栏和右下角操作区使用背景模糊，画布手势中的影响需分别确认 | [`content.css`](../../src/styles/content.css#L681)、[`seat-canvas.js`](../../src/scripts/seat-canvas.js#L83) | 已验证 | B2 |
| R7 | P2 | 隐藏细滚动条长期保留 `will-change: opacity` | [`scroll-thin.js`](../../src/scripts/scroll-thin.js#L208) | 已验证 | B6 |
| R8 | P3 | 分段指示点使用未指定属性的过渡，部分业务模块保留手写关闭路径 | [`controls.css`](../../src/styles/controls.css#L25)、业务 Sheet 控制器 | 已验证 | B5、B7 |

### R1：主页面横滑与顶栏模糊

- [x] 增加页面手势状态（`is-page-gesturing`），并在手势期间关闭顶栏背景模糊。
- [x] 使用 RAF 合并页面、导航滑块和分段滑块写入（`schedulePageDrag`）。
- [x] 验证普通页面、导航栏和分段切换三条路径。（用户于 2026-08-03 确认验收通过）

### R2：学生名单头部模糊

- [x] 为 `.roster-editor-head` 增加全屏手势期间的无模糊样式。
- [x] 确认设置页和学生名单页的头部状态规则一致（`is-drawer-gesturing` 同时作用于两页头部）。
- [x] 验证学生名单页滑入、滑出和取消手势。（用户于 2026-08-03 确认验收通过）

### R3：互斥浮层切换

- [x] 评估旧层立即隐藏、不播放退场动画的方案：`closeInstant()` 已实现立即隐藏；互斥切换（`closeOverlays` → 各模块 `close()` → `closeInstant()`）全部走该路径，旧层不会与新层同帧绘制。
- [x] 评估复用同一遮罩连续切换的方案：不采纳。每层独立遮罩 + 旧层立即隐藏已避免双遮罩同帧绘制；共享遮罩会破坏「每层自管遮罩」的层级架构。
- [x] 选择方案后验证 More、设置、学生记录、作业、考试、人员和课程浮层：`main.js#closeOverlays` 全覆盖，`sheet-contract.test.mjs` 契约测试通过。
- [x] 不把等待旧层完整退场后再打开新层作为首选方案：已遵循，互斥切换不等待退场动画。

### R4：`inert` 时机

- [x] 用户确认相关手势运行表现验收通过；未单独记录 `pointerdown`、`pointermove`、`pointerup` 和 `pointercancel` 事件日志。
- [x] 验证关闭后的首次点击、键盘焦点和新触点接管。（静态路径已确认；用户于 2026-08-03 确认验收通过）
- [x] 未取得运行证据前，不直接延后 `inert` 设置：已遵守，`inert` 时机未改动。
- [x] 验收未发现需要继续调整的问题。

### R5：全屏面板与遮罩写入

- [x] 将面板位移和遮罩透明度写入合并到 RAF（`scheduleFullscreenPaint`/`flushFullscreenPaint`）。
- [x] 检查设置页和学生名单页的取消、回弹、关闭三条路径：settle 前 flush 最后一帧，三条路径共用 `settleFullscreenDrag`；未绘制时不会误写面板 transform（dirty 标志）。
- [x] `will-change` 只在运行结果支持时增加：未新增常驻 `will-change`，保持 `is-dragging` 期间的临时绘制层并在 settle 时释放。

### R6：座位画布模糊控件

- [x] 单独检查座位模式栏的画面表现。（用户于 2026-08-03 确认验收通过）
- [x] 单独检查右下角操作区的画面表现。（用户于 2026-08-03 确认验收通过）
- [x] 检查平移、缩放和座位卡拖动表现。（用户于 2026-08-03 确认验收通过；未执行自动化浏览器检查）
- [x] 与 Sheet 闪烁现象分开判断，不将两处控件视为同一个原因：已按独立控件记录，未与 Sheet 问题合并处理。

### R7：细滚动条绘制层

- [x] 仅在滚动开始和淡出期间增加 `will-change`（`.scroll-thin-thumb.is-compositing`，由 `scroll-thin.js` 在 `show()` 时添加）。
- [x] 完全隐藏后移除绘制层提示：淡出结束（`--scrollbar-fade`）后释放，snap-hide 立即释放。
- [x] 验证多个列表同时存在时的静止状态和滚动状态。（用户于 2026-08-03 确认验收通过）

### R8：低风险维护一致性

- [x] 将 `.subdots i` 的过渡属性写完整（`transition: width .25s var(--ease), opacity .25s var(--ease)`）。
- [x] 清点业务模块手写关闭分支：业务 Sheet 关闭统一走 `closeInstant()`（控制器未注册时的 `classList.remove('show')` 为防御兜底）；`sheet-contract.test.mjs`「所有业务 Sheet 注册都声明统一遮罩关闭入口」通过。
- [x] 统一清理类名、遮罩、焦点和滚动状态：`leavePresented`/`finishClosingSheets` 统一收尾，无绕过控制器的手写分支。

## 5. 分批实施计划

所有批次已获用户授权一次性实施（2026-08-03）。实施按职责批次完成，每批运行直接相关的快速检查（见 §7 验证记录）。

### B1：共享 Sheet、控制器和遮罩

- [x] 处理 R3 的互斥切换方案：确认 `closeInstant()` 立即隐藏 + `closeOverlays` 全覆盖，方案 A 已就位，无需代码改动。
- [x] 完成 R4 静态路径确认（`finishClosingSheets` 于新 `pointerdown` 完成残余关闭、`postSheetCloseTapPending`、`syncChromeInert` 排除 `is-closing`）；焦点管理、关闭后的首次点击和新触点接管均保留，随后通过用户验收。
- [x] 检查真实遮罩、`is-closing`、`inert`、关闭定时器和层级清理：`ensureManagedScrim`/`setClosingInteraction`/`settleTimer` 代数保护/`leavePresented` 均完整。
- [x] 运行相关 JavaScript 语法检查和 `git diff --check`：通过。

### B2：座位画布与 Toast

- [x] 处理 R6 的两个模糊控件：分别静态确认（`.seat-mode-bar` 交互层、`.seat-view-actions` 纯视觉层），画面表现按独立控件记录，随后通过用户验收。
- [x] 保持座位舞台单一变换和座位卡拖动期间的临时绘制层：未改动 `seat-canvas.js` 与座位样式。
- [x] 保持 Toast 的显示、淡出和绘制层释放顺序：`is-compositing` 在淡出完成后释放，未改动。
- [x] 运行座位与 Toast 相关 JavaScript 语法检查和 `git diff --check`：通过。

### B3：主页面、导航和顶栏

- [x] 处理 R1：`gestures.js` 增加 `is-page-gesturing`（axis 锁定 x 且为页面/导航横滑时添加，落位动画后释放）与 `schedulePageDrag` RAF 合并；`shell.css` 顶栏无模糊规则覆盖 `is-page-gesturing`。
- [x] 保持页面切换、导航滑块、分段滑块和点击保护的现有行为：haptic 分段判断、`renderNavigation` 落位、点击抑制逻辑未改动。
- [x] 运行导航与手势相关 JavaScript 语法检查和 `git diff --check`：通过。

### B4：设置页与学生名单全屏页

- [x] 处理 R2：`shell.css` 增加 `.app.is-drawer-gesturing .roster-editor-head` 无模糊规则，与设置页头部规则一致。
- [x] 处理 R5 的 RAF 合并：`scheduleFullscreenPaint`/`flushFullscreenPaint` 将面板 transform 与遮罩 opacity 合并到动画帧；settle 前 flush 末帧；dirty 标志避免误写关闭态面板。
- [x] 依据运行结果决定是否增加临时 `will-change`：未新增常驻 `will-change`，沿用 `is-dragging` 期间的临时绘制层并在 settle 时释放。
- [x] 运行全屏手势相关 JavaScript 语法检查和 `git diff --check`：通过。

### B5：业务 Sheet

- [x] 按 B1 选定的切换方案检查业务 Sheet：More、设置、学生记录、作业、考试、人员、课程、重点科目、学生名单编辑均通过 `closeOverlays` 走 `closeInstant()` 立即隐藏。
- [x] 处理 R8 的手写关闭分支：清点完成，无绕过控制器的手写分支；`.subdots i` 过渡属性写完整。
- [x] 验证 More、设置、学生记录、作业、考试、人员、课程和重点科目等路径：静态验证与 `sheet-contract.test.mjs` 契约测试通过，随后通过用户验收。

### B6：成绩表、滚动和惯性

- [x] 处理 R7：`sheets.css` 移除 `.scroll-thin-thumb` 常驻 `will-change`，新增 `.is-compositing` 临时绘制层；`scroll-thin.js` 在显示与淡出期间管理该状态，完全隐藏或 snap-hide 后释放。
- [x] 保持成绩表 `touch-action`、滚动接管和惯性停止行为：未改动 `grade-scroll` 相关代码。
- [x] 运行滚动相关 JavaScript 语法检查和 `git diff --check`：通过。

### B7：文档与自动检查

- [x] 将已确认的状态生命周期同步到对应交互、视觉或工程文档：`interaction.md`（名单头部同一规则）、`engineering.md`（`is-drawer-gesturing` 覆盖两页头部）。
- [x] 增加与项目现有结构匹配的静态检查：新增 `tests/static-checks.test.mjs`，用 `node:test` 对全部 `src/scripts/*.js` 执行语法检查。
- [x] 汇总代码检查、用户验收和未执行的自动化检查：见 §7 验证记录与 §4 风险登记表。
- [x] 用户确认验收通过后，将本计划移入 `docs/archive/`，并更新 `docs/README.md`。

## 6. 现有保护措施

- 16 个业务 Sheet 均使用 `createSheetController()` 并提供 `onRequestClose`。
- 共享控制器统一管理真实遮罩、顶层 Sheet、拖动进度和关闭状态。
- `transitionend`、定时器完成标记和代数保护共同防止重复收尾。
- 已处理 `pointercancel`、`lostpointercapture`、拖动取消和惯性停止。
- 座位画布使用单一舞台变换，座位卡只在拖动期间增加临时绘制层提示。
- Toast 在显示、淡出和完全隐藏后分别管理 `is-compositing`。
- 已处理减少动画偏好、焦点管理、关闭后的首次点击及滚动区域触摸行为。

## 7. 验证记录

| 日期 | 批次 | 检查 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 2026-08-03 | 审查 | `src/scripts/*.js` 语法检查 | 通过 | 修订报告前已完成 |
| 2026-08-03 | 审查 | `git diff --check` | 通过 | 工作区无差异 |
| 2026-08-03 | 审查 | 工作区状态 | 审查开始时干净 | 当时无新增或修改文件 |
| 2026-08-03 | 审查 | 浏览器、Android、真机链路 | 未执行 | 未获本任务授权 |
| 2026-08-03 | B1-B7 | `src/scripts/*.js`（48 个）语法检查 | 通过 | 每批实施后执行，最终全量复查 |
| 2026-08-03 | B1-B7 | `git diff --check` | 通过 | 无空白错误 |
| 2026-08-03 | B1-B7 | `node --test tests/*.test.mjs` | 103/103 通过 | 含 Sheet 遮罩关闭契约测试及全部脚本语法检查 |
| 2026-08-03 | B1-B7 | 浏览器自动验收、Edge/CDP、本地调试服务、Android 链路 | 未执行 | 未获授权；R4、R6 与各「运行验证」项保持需运行确认 |
| 2026-08-03 | 用户验收 | 修订计划及运行表现 | 通过 | 用户明确确认修订计划正确完成、验收通过；未追加浏览器自动化或 Android 检查 |

## 8. 实施期间的继续工作规则

1. 后续智能体先读取本计划和与当前批次对应的 `docs/interaction.md`、`docs/visual-design.md`、`docs/engineering.md` 或 `docs/architecture.md` 章节。
2. 开始代码改动前，记录当前批次、目标风险、受影响页面和文件。
3. 发现用户已有未提交改动时，保留原内容并说明重叠文件。
4. 每次改动后只运行直接相关的快速检查，明确记录已执行、未执行和失败项目。
5. 运行环境确认项在取得证据前保持“需运行确认”，不将静态推测写成已验证事实。
6. 用户已于 2026-08-03 复核并确认验收通过，本计划随后归档。

## 9. 变更记录

| 日期 | 变更 | 结果 |
| --- | --- | --- |
| 2026-08-03 | 根据验收意见建立执行计划 | 纳入 8 项风险、7 个实施批次和验证记录 |
| 2026-08-03 | 用户授权一次性实施 B1–B7 | 按批次完成全部代码与文档改动 |
| 2026-08-03 | B3（R1）：`gestures.js` 增加 `is-page-gesturing` 与页面/导航/分段横滑 RAF 合并（`schedulePageDrag`）；`shell.css` 顶栏无模糊规则覆盖 `is-page-gesturing` | 语法、diff、测试通过 |
| 2026-08-03 | B4（R2/R5）：`shell.css` 名单头部跟手无模糊规则；`gestures.js` 全屏左滑面板/遮罩写入合并到 RAF（`scheduleFullscreenPaint`/`flushFullscreenPaint`，含 dirty 防误写） | 语法、diff、测试通过 |
| 2026-08-03 | B5（R8）：`controls.css` `.subdots i` 过渡属性写完整；确认业务 Sheet 关闭统一走 `closeInstant()`，无手写分支 | 契约测试通过 |
| 2026-08-03 | B6（R7）：`sheets.css` 细滚动条 `will-change` 改为 `is-compositing` 临时绘制层；`scroll-thin.js` 显示/淡出期间管理并在隐藏后释放 | 语法、diff、测试通过 |
| 2026-08-03 | B1（R3/R4）、B2（R6）静态确认完成；R4、R6 保持「需运行确认」 | 无代码改动，记录验证范围 |
| 2026-08-03 | B7：同步 `interaction.md`、`engineering.md`；新增 `tests/static-checks.test.mjs` 静态检查 | 全量检查通过；归档待用户复核 |
| 2026-08-03 | 用户确认修订计划正确完成、验收通过 | R1–R8 均完成，计划移入 `docs/archive/` |

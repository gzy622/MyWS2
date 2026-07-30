# 里程碑一统一收口执行计划

> 状态：进行中（批次 A–E 已完成；下一批次 F）
> 用途：供编程智能体在每次实施前查看、实施中更新、完成后记录结果。
> 完成后：将最终结论同步到现行文档，并把本计划移入 `docs/archive/`。

## 1. 目标与边界

在不新增业务功能、不改变信息架构、业务数据 Schema 和返回栈的前提下完成：

1. **触摸可靠性**：系统处理滑动被打断、幽灵点击、点击穿透和过度点击抑制；
2. **滚动统一**：统一滚动容器、滚动条、惯性与边缘交接；
3. **UI 统一**：统一 Sheet、按钮、表单、列表及视觉状态；
4. **验收收口**：建立可重复的 Web 与 Capacitor APK 回归路径。

触摸可靠性优先于滚动和视觉调整。不得用视觉改动掩盖交互问题。

## 2. 智能体工作规则

每次继续本计划时，智能体必须：

1. 阅读本文件以及当前批次对应的现行文档；
2. 先检查 `git status --short`，保护用户已有改动；
3. 在下方任务表中确认当前批次，只处理该批次职责；
4. 实施前记录影响页面、状态和文件；
5. 实施后执行允许的快速检查，记录结果和未执行项；
6. 更新任务状态、结果摘要、遗留风险和下一步；
7. 按职责分批提交，不把无关重构混入当前批次。

除非用户在当前实施任务明确授权，不执行浏览器自动验收、浏览器调试或 Android 同步、构建、部署和 adb 调试。

## 3. 核心质量不变量

所有触摸改动必须同时满足：

- 一次物理指针序列最多产生一次业务激活；
- 指针归属确定后，本次序列内不转交其他组件；
- 轻点恰好执行一次，拖动和长按不补发轻点；
- `pointercancel`、`lostpointercapture`、失焦、切后台和方向变化后无残留状态；
- Sheet 关闭动画不接受新点击，当前序列不穿透到底层；
- 下一次真实 `pointerdown` 立即解除旧保护，不要求用户点击第二次；
- `touch-action: none` 或 Pointer Capture 区域不依赖 WebView 合成 `click`；
- Web 层与 Capacitor 原生壳不重复处理触摸或触觉。

## 4. 执行批次

状态使用：`未开始`、`进行中`、`受阻`、`已完成`。

| 批次 | 状态 | 智能体执行内容 | 主要交付 |
| --- | --- | --- | --- |
| A. 盘点与基线 | 已完成 | 检查全部触摸监听、滚动容器、浮层、Pointer Capture 和 `touch-action` | 手势归属表、风险清单、修改范围（见 §9） |
| B. 测试与诊断 | 已完成 | 先覆盖历史故障，补充指针序列和点击保护诊断 | `gesture-policy.js` + 测试；会话诊断字段 |
| C. 手势可靠性 | 已完成 | 统一指针生命周期、阈值、直接激活、尾随点击保护和取消清理 | `pointer-guards.js`；五模块收敛；返回/生命周期清理 |
| D. 滚动统一 | 已完成 | 区分原生滚动与 JS 滚动，统一滚动条、惯性和边缘交接 | `.scroll-thin`；边缘交接；课表格 `touch-action` |
| E. UI 统一 | 已完成 | 收敛 token 和共享组件，统一 Sheet、表单、按钮、列表及状态 | `sheets.css` 共享字段/按钮/列表；触控 44px |
| F. 验收与文档 | 未开始 | 执行检查、记录结果、同步现行规范和遗留风险 | 验收报告与文档收口 |

## 5. 各批次检查清单

### A. 盘点与基线

- [x] 列出页面、底栏、分段、字母索引、座位和成绩表的手势 owner；
- [x] 列出全部顶部/底部 Sheet、菜单、Popover、遮罩和输入控件；
- [x] 记录每个表面的滚动方向、`touch-action`、捕获时机和激活方式；
- [x] 搜索全部 `pointer*`、`touch*`、`click`、`preventDefault` 和 Pointer Capture；
- [x] 标出重复的立即操作、幽灵点击保护和点击抑制实现；
- [x] 核对 WebView 壳层 overscroll、nested scroll、长按和触觉设置。

### B. 测试与诊断

- [x] 为指针归属、轴锁定、激活和取消判定补充纯逻辑测试；
- [x] 覆盖拖动后的尾随点击；
- [x] 覆盖 Sheet 关闭后的底层穿透；
- [x] 覆盖下一次真实触摸被旧保护吞掉；
- [x] 覆盖 IME 保存、取消、删除的单次执行；
- [x] 覆盖 `pointercancel` 和 `lostpointercapture` 清理；
- [x] 为诊断日志增加会话 ID、owner、激活来源和清理原因；
- [x] 不记录逐帧移动、姓名、成绩或输入内容。

### C. 手势可靠性

- [x] 建立统一手势阈值和纯判定策略；
- [x] 收敛作业、考试、人员、课程和高亮科目的重复点击保护；
- [x] 被手势认领的控件不依赖浏览器合成 `click`；
- [x] IME 操作继续在 `pointerdown` 生效，但只执行一次；
- [x] 当前指针序列结束前阻止关闭浮层穿透；
- [x] 下一次真实 `pointerdown` 清除残余关闭和旧保护；
- [x] 补齐取消、失焦、切后台、方向变化和销毁清理；
- [x] 返回键触发前先安全结束当前手势。

### D. 滚动统一

- [x] JS 接管且参与切页/Sheet 的表面统一使用 `touch-action: none`；
- [x] 只有明确独立的原生滚动区使用 `pan-y`；
- [x] 成绩表双轴滚动不与页面切换、考试列表和菜单互抢；
- [x] 列表或成绩表同一手势滚到边缘后不立即转交；
- [x] 页面和普通 Sheet 隐藏系统滚动条；
- [x] 仅作业和考试列表溢出时显示统一的 4px 细滚动条；
- [x] 深浅色、惯性和 `overscroll-behavior` 一致。

### E. UI 统一

- [x] 颜色、圆角、阴影、间距和动效优先使用 token；
- [x] 统一顶部 Sheet、底部 Sheet、更多菜单和 Popover；
- [x] 统一输入框、主按钮、次按钮、危险按钮和禁用态；
- [x] 统一列表行高、分隔线、标题、辅助文字和按下反馈；
- [x] 触控目标不小于 44px；
- [x] 检查浅色、深色、IME、短横屏和 reduced motion；
- [x] 不改变固定文案、页面数量、业务状态和数据 Schema。

### F. 验收与文档

默认可执行：

- [ ] `node --check` 检查受影响 JavaScript；
- [ ] `node --test tests/*.test.mjs`；
- [ ] `git diff --check`；
- [ ] 检查任务外改动、调试代码和生成目录。

获得明确授权后执行：

- [ ] 浏览器自动验收：320px、390px、430px；
- [ ] APK 同步、构建和部署；
- [ ] 真机慢拖、快甩、斜拖、长按、取消和连续快速点击；
- [ ] 真机 IME、返回、旋转、切后台和恢复；
- [ ] Sheet 关闭后立即点击底栏、列表项和成绩格；
- [ ] 诊断开启与关闭各回归一次；
- [ ] 核对 APK 内容指纹及触觉只执行一次。

## 6. 重点涉及文件

- 手势基础：`src/scripts/gestures.js`、`sheet-gestures.js`、`sheet-drag.js`；
- 局部手势：`seat-canvas.js`、`letter-index.js`、`student-interactions.js`、`people-interactions.js`、`courses-interactions.js`；
- 浮层与 IME：`assignments.js`、`exams.js`、`highlight-subjects.js`、`drawer.js`、`more-sheet.js`；
- 原生协同：`src/scripts/haptics.js`、`system-back.js`、`android/app/src/main/java/com/teacherworkbench/app/MainActivity.java`；
- 样式：`src/styles/tokens.css`、`base.css`、`shell.css`、`content.css`、`sheets.css`、`controls.css`、`assignments.css`；
- 验收：`tests/`、`tools/verify-web.ps1`；
- 规范：`docs/interaction.md`、`visual-design.md`、`engineering.md`、`guides/development.md`。

仅在职责确实独立且可测试时新建共享手势模块，禁止为减少文件长度而拆分。

## 7. 进度记录

每完成一个批次追加一行；不记录逐文件流水账。

| 日期 | 批次 | 状态 | 结果摘要 | 验证 | 遗留风险/下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-07-30 | — | 待执行 | 计划已建立 | 未执行代码检查 | 从批次 A 开始 |
| 2026-07-30 | A | 已完成 | 完成手势/Sheet/`touch-action`/幽灵点击/壳层盘点；交付见 §9 | `git status`；源码与 CSS 检索；未改业务代码 | 进入批次 B：补纯逻辑测试与诊断会话字段 |
| 2026-07-30 | B | 已完成 | 新增 `gesture-policy.js` 与 11 项纯逻辑测试；诊断补 sessionId/owner/activationSource/clearReason；`gestures.js` 接入判定 | `node --check`；`node --test` 66 通过；`git diff --check` | 进入批次 C：收敛五套 ghost/IME 保护并统一取消清理 |
| 2026-07-30 | C | 已完成 | 新增 `pointer-guards.js`；作业/考试/人员/课程/高亮改用共享 IME+ghost；`cancelActivePointerGesture` + 后台/旋转清理；返回前先结束手势 | `node --check`；`node --test` 66 通过；`git diff --check` | 进入批次 D：滚动统一 |
| 2026-07-30 | D | 已完成 | 统一 `.scroll-thin`/隐藏滚动条；课表格等改回 `touch-action:none`；Sheet 列表边缘交接接入 `canHandOffAtScrollEdge` | `node --check`；`node --test`；`git diff --check` | 进入批次 E：UI 统一 |
| 2026-07-30 | E | 已完成 | Sheet 字段/按钮/提示/列表共享样式；作业考试目录去重；新增钮 44px；圆角/阴影走 token；按下反馈统一 | `git diff --check`；未改 Schema/文案 | 进入批次 F：验收与文档收口 |

## 8. 完成条件

以下条件全部满足后，本计划才可关闭：

1. 六个批次均为“已完成”；
2. 核心质量不变量均有实现和验证依据；
3. 快速检查全部通过；
4. 未执行的浏览器或 Android 项目有明确原因和风险说明；
5. 现行文档已同步；
6. 本文件的最终结论已整理并移入 `docs/archive/`。

## 9. 批次 A 交付：盘点基线

盘点日期：2026-07-30。未改业务代码。用户工作区已有 `docs/README.md` 修改与本计划未跟踪文件，已保留。

### 9.1 手势归属表

| 表面 | Owner 模块 | 滚动 | `touch-action` | Capture 时机 | 激活方式 |
| --- | --- | --- | --- | --- | --- |
| 主页面横滑 / 底栏 glider / 顶栏切页 | `gestures.js` | JS 跟手 | `none`（`#app`/视口/顶栏/底栏） | 轴锁定后；成绩表更早 | 松手切页；控件多为 `click` |
| 分段子视图横滑 | `gestures.js` | JS 跟手 | `none` | 轴锁定后 | 松手切换子视图 |
| 登记网格下滑开作业 / 上滑开菜单 | `gestures.js` + `sheet-gestures.js` | — | `none` | Sheet 跟手开始后 | progress 落位 |
| 成绩子视图边缘开考试/菜单/切页 | 同上 + `.grade-scroll` | JS 双轴 | `none`（禁止 `pan-*`） | 横轴或成绩滚动开始时 | 边缘须松手后再交接下一手势 |
| 字母索引 | `letter-index.js` | 自管 | `none`（content） | `pointerdown` 即 capture | 同回合展开；不切页/开 Sheet |
| 座位画布 | `seat-canvas.js` | 自管平移缩放 | `none` | `pointerdown` | 轻点选座；长按/拖编排 |
| 学生网格轻点/长按 | `student-interactions.js` | — | 随页面 `none` | 无 capture | 轻点提交；~480ms 长按开记录；拖动取消 |
| 人员列表长按 | `people-interactions.js` | — | 随内容 | 无 | 长按开编辑 |
| 课表格/节次长按与点击抑制 | `courses-interactions.js` | — | 随内容 | 无 | 轻点开 Sheet；拖动后抑制 click |
| Sheet 纵向跟手 / 列表 JS 滚动 | `sheet-gestures.js` + `sheet-drag.js` | JS（除人员选择名单） | 多为 `none` | 列表滚/面板跟手开始后 | 短触由路由在 `pointerup` 直接激活 |
| 人员选择名单 | native + claim `null` | 原生纵滚 | `pan-y` | 不 claim | 原生惯性；关闭仅非列表区 |
| 高亮科目面板 | native 倾向 | 原生纵滚 | 层 `manipulation`；面板 `pan-y`；把手 `none` | 不 claim 输入区 | IME 友好例外 |
| 更多菜单 / 姓名字号 Popover | `more-sheet.js` / `student-font-size.js` | 更多可纵滚 `none` | 滑杆 `none` | 无全局 capture | `click` / 外点关闭；**不在** Sheet 跟手栈 |
| 确认面板 | `more-sheet.js` + sheet 栈 | — | `none` | 随 Sheet 路由 | `click` + 跟手关闭 |
| IME 取消/保存/删除 | 各业务模块 `bindImmediateAction` | — | 输入常 `manipulation` | assignments/exams 在 down 时 capture | `pointerdown` 立即执行一次 |

轴锁定基线：`gestures.js` 中 `AXIS_LOCK_DISTANCE = 6`；拖动后 click 抑制 `CLICK_SUPPRESS_MS = 450`；新 `pointerdown`/`touchstart`（capture）清除抑制。

### 9.2 浮层与控件清单

`SHEET_STACK_ORDER`（`sheet-drag.js`，仅最上层可跟手）：

`confirm` → `course-highlight` → `course-stats` → `exam-name` → `exams` → `course-subject` → `course-period` → `course-slot` → `course-grade` → `people-edit` → `people-pick` → `assignment-name` → `assignments` → `student-record` → `drawer`

非栈浮层：更多菜单（`activeOverlay === 'more'`，claim 为 `blocked`）、姓名字号 Popover（`fontSizePopoverOpen` → `blocked`）。

遮罩：各 Sheet `sheet-scrim` / 业务层 click-to-dismiss；通用菜单 `scrim`（`drawer.js`）。

主要输入：作业/考试名称、人员编辑、课表格/节次/科目、高亮科目 textarea、成绩与学生记录数字键盘（非系统 IME）。

### 9.3 指针与保护实现检索摘要

| 区域 | 命中 |
| --- | --- |
| 指针事件集中度 | `courses-interactions`、`gestures`、`people-interactions`、`assignments`、`seat-canvas`、`exams`、`student-interactions`、`letter-index`、`highlight-subjects` 等 |
| Pointer Capture | `gestures.js`（轴锁/成绩/Sheet 跟手后）、`seat-canvas.js`、`letter-index.js`、`assignments.js`/`exams.js` 的 IME 按钮 |
| `touch*` | 主要用于 `gestures.js` 清除 click 抑制（`touchstart` capture）；业务以 Pointer Events 为主 |
| 重复 `bindImmediateAction` + ghost guard | **五套近副本**：`assignments.js`、`exams.js`、`people-interactions.js`、`courses-interactions.js`、`highlight-subjects.js`（课程另含 `suppressClickUntil`） |
| 局部 click 抑制 | `gestures.js` 全局 450ms；`student-interactions` 长按后；`courses-interactions` 拖动后 |
| 诊断 | `sheet-debug.js` 已有 gesture/sheet claim 日志；**尚无**统一会话 ID / owner / 激活来源 / 清理原因契约；`tests/` **无**指针序列纯逻辑测试 |

### 9.4 WebView 壳层

`MainActivity.configureWebViewTouchAndHaptics()`：`OVER_SCROLL_NEVER`、`setNestedScrollingEnabled(false)`、`setHapticFeedbackEnabled(false)`、`setLongClickable(false)` + 吞长按、递归关闭框架触觉。业务触觉仅走 `haptics.js` → Capacitor Haptics / `navigator.vibrate`。

### 9.5 风险清单（按优先级）

1. **幽灵点击保护五套重复**：超时、是否加 `#app` ghost class、是否 `setPointerCapture`、是否叠加 `suppressClickUntil` 不一致 → 易回归「第二次点击才生效」或漏吞穿透。
2. **`touch-action` 例外面**：人员选择 `pan-y`、高亮 `manipulation`/`pan-y` 合理但边界脆；成绩表曾因动态 `pan-*` 复发 `pointercancel`。
3. **激活双路径**：Sheet 认领短触靠路由 `pointerup` 直接激活；大量控件仍靠合成 `click` → WebView 行为差异风险。
4. **Capture 时机分裂**：座位/字母 down 即 capture；Sheet 延迟到滚动/跟手；IME 按钮 down capture — 与「归属确定后不转交」需在 C 批对齐。
5. **取消清理覆盖不均**：座位与手势路由较完整；业务 ghost timer、长按 Map、Sheet session 在 blur/后台/旋转上的统一清理未证明。
6. **测试缺口（部分关闭）**：批次 B 已补指针策略纯逻辑测试；DOM/真机验收仍依赖授权后的 `verify-web` / APK。
7. **滚动条策略未统一**：页面/多数 Sheet 隐藏滚动条；作业/考试列表与人员选择名单显示 4px 细条 — 属 D 批范围。

### 9.6 后续批次修改范围（建议）

| 批次 | 首选触达 |
| --- | --- |
| B | ~~完成~~：`gesture-policy.js`、`tests/gesture-policy.test.mjs`、`sheet-debug` 会话字段 |
| C | ~~完成~~：`pointer-guards.js`；五业务模块共享 IME/ghost；`cancelActivePointerGesture` + 生命周期/返回 |
| D | ~~完成~~：滚动条 token/`.scroll-thin`；边缘交接；课表格 `touch-action:none` |
| E | ~~完成~~：`sheets.css` 共享 `.sheet-field`/按钮/提示/列表；作业考试目录样式合并 |
| F | 现行 `interaction.md` / `visual-design.md` / `engineering.md` / `guides/development.md`；授权后的 Web/APK 验收 |

下一批次：**F. 验收与文档**。

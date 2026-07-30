# 里程碑一统一收口执行计划

> 状态：已完成（2026-07-30）  
> 用途：历史执行记录；现行规则以 `docs/` 下产品/交互/视觉/工程文档为准。  
> 归档位置：`docs/archive/milestone-one-unification-plan.md`

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

### 不变量实现依据（收口）

| 不变量 | 实现与验证 |
| --- | --- |
| 单次激活 / 不补发轻点 | `gesture-policy.resolvePointerRelease` + `gestures.js`；`tests/gesture-policy.test.mjs` |
| 归属不转交 | `sheet-gestures` claim + capture 延迟；座位/字母独立 owner |
| 取消无残留 | `pointercancel`/`lostpointercapture` → `endGesture(cancelled)`；`cancelActivePointerGesture`；`clearAllGhostClickGuards` |
| Sheet 关闭不穿透 | 关闭态 `pointer-events` + click suppress + post-close tap 直接激活 |
| 新 `pointerdown` 解保护 | document capture 清除 click suppress；ghost guard `new-pointerdown` |
| 不依赖合成 click | Sheet 短触 `pointerup` 直接 `click()`；IME `pointerdown` 立即执行 |
| 壳层不重复触觉 | `MainActivity` 关框架 haptic；业务仅 `haptics.js` |

## 4. 执行批次

| 批次 | 状态 | 智能体执行内容 | 主要交付 |
| --- | --- | --- | --- |
| A. 盘点与基线 | 已完成 | 检查全部触摸监听、滚动容器、浮层、Pointer Capture 和 `touch-action` | 手势归属表、风险清单（§9） |
| B. 测试与诊断 | 已完成 | 先覆盖历史故障，补充指针序列和点击保护诊断 | `gesture-policy.js` + 测试；会话诊断字段 |
| C. 手势可靠性 | 已完成 | 统一指针生命周期、阈值、直接激活、尾随点击保护和取消清理 | `pointer-guards.js`；五模块收敛；返回/生命周期清理 |
| D. 滚动统一 | 已完成 | 区分原生滚动与 JS 滚动，统一滚动条、惯性和边缘交接 | `.scroll-thin`；边缘交接；课表格 `touch-action` |
| E. UI 统一 | 已完成 | 收敛 token 和共享组件，统一 Sheet、表单、按钮、列表及状态 | `sheets.css` 共享字段/按钮/列表；触控 44px |
| F. 验收与文档 | 已完成 | 执行检查、记录结果、同步现行规范和遗留风险 | 本验收报告；计划归档 |

## 5. 各批次检查清单

### A–E

（实施期清单均已勾选，细节见各批次进度行与现行文档。）

### F. 验收与文档

默认可执行：

- [x] `node --check` 检查受影响 JavaScript（全部 `src/scripts/*.js`、`lan-server.js`、`tools/content-id.cjs`）；
- [x] `node --test tests/*.test.mjs`（66 通过）；
- [x] `git diff --check`；
- [x] 检查任务外改动、调试代码和生成目录（工作区干净；无 `console.log`/`debugger`；无强制改动 `www/`/`dist/`）。

获得明确授权后执行（**2026-07-30 已授权并执行**）：

- [x] 浏览器自动验收：320px、390px、430px（`verify-web.ps1`，37 项通过；脚本已对齐现行 `touch-action:none`/顶栏切页）；
- [x] APK 同步、构建和部署（`deploy:apk` → `10AD133K3D0011C`，BUILD SUCCESSFUL）；
- [ ] 真机慢拖、快甩、斜拖、长按、取消和连续快速点击（需人手触控，未代测）；
- [x] 真机返回路径：WebView CDP 下打开通用菜单后 Escape 关闭（与 `system-back` 同路径）；旋转/切后台/IME 折叠未代测；
- [x] Sheet 关闭后幽灵点击：真机 CDP 复现「同序列穿透阻断 + 新 pointerdown 立即解除」；
- [x] 诊断开启与关闭：`__sheetDebug.enable/disable`，chip 显示 `build 5938699f3474`；
- [x] APK 内容指纹与源码一致（`5938699f3474`）；触觉互斥由 `MainActivity` 关框架 haptic + `haptics.js` 原生优先早退保证（体感震感未代测）。

## 6. 重点涉及文件（收口后事实）

- 手势策略：`gesture-policy.js`、`pointer-guards.js`、`gestures.js`、`sheet-gestures.js`、`sheet-drag.js`
- 业务接入：`assignments.js`、`exams.js`、`people-interactions.js`、`courses-interactions.js`、`highlight-subjects.js`
- 诊断：`sheet-debug.js`；测试：`tests/gesture-policy.test.mjs`
- 样式：`tokens.css`、`sheets.css`（含 `.scroll-thin` / Sheet 控件基线）、`controls.css`、`assignments.css`、`content.css`、`shell.css`
- 规范：`interaction.md`、`visual-design.md`、`engineering.md`、`guides/development.md`

## 7. 进度记录

| 日期 | 批次 | 状态 | 结果摘要 | 验证 | 遗留风险/下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-07-30 | — | 待执行 | 计划已建立 | 未执行代码检查 | 从批次 A 开始 |
| 2026-07-30 | A | 已完成 | 手势/Sheet/`touch-action`/幽灵点击/壳层盘点 | 源码检索 | → B |
| 2026-07-30 | B | 已完成 | `gesture-policy` + 11 项测试；诊断会话字段 | `node --test` 66 | → C |
| 2026-07-30 | C | 已完成 | `pointer-guards`；五模块收敛；返回/生命周期清理 | `node --test` 66 | → D |
| 2026-07-30 | D | 已完成 | 滚动条统一；边缘交接；课表格 `touch-action:none` | 快速检查 | → E |
| 2026-07-30 | E | 已完成 | Sheet 字段/按钮/列表共享；44px；token 圆角 | 快速检查 | → F |
| 2026-07-30 | F | 已完成 | 快速检查全过；现行文档同步；计划归档 | 见 §10 | 授权后补 Web/APK |
| 2026-07-30 | F+ | 已完成 | 授权 Web/Android 验收：`verify-web` 37 通过；APK 部署；指纹一致；CDP 幽灵点击/诊断/返回 | 见 §10.5 | 人手触控手势与 IME/旋转/后台仍建议抽测 |

## 8. 完成条件

1. [x] 六个批次均为“已完成”；
2. [x] 核心质量不变量均有实现和验证依据（§3）；
3. [x] 快速检查全部通过（§5 F / §10）；
4. [x] 未执行的浏览器或 Android 项目有明确原因和风险说明（§10）；
5. [x] 现行文档已同步；
6. [x] 本文件移入 `docs/archive/`。

## 9. 批次 A 交付：盘点基线（历史快照）

盘点日期：2026-07-30。下文保留实施初盘点；部分风险已在后续批次关闭，以 §10 为准。

### 9.1 手势归属表

| 表面 | Owner 模块 | 滚动 | `touch-action` | Capture 时机 | 激活方式 |
| --- | --- | --- | --- | --- | --- |
| 主页面横滑 / 底栏 / 顶栏 | `gestures.js` | JS | `none` | 轴锁定后；成绩表更早 | 松手切页 |
| 分段子视图 | `gestures.js` | JS | `none` | 轴锁定后 | 松手切子视图 |
| 登记/成绩边缘开 Sheet | `gestures` + `sheet-gestures` | — / 成绩双轴 | `none` | Sheet 跟手或成绩滚动后 | progress 落位；边缘不即交 |
| 字母索引 | `letter-index.js` | 自管 | `none` | down | 同回合展开 |
| 座位画布 | `seat-canvas.js` | 自管 | `none` | down | 轻点/长按/拖 |
| Sheet 跟手 / JS 列表 | `sheet-gestures` + `sheet-drag` | JS | `none` | 滚/跟手后 | `pointerup` 直接激活 |
| 人员选择名单 | native | 纵滚 | `pan-y` | 不 claim | 原生惯性 |
| 高亮科目面板 | native 倾向 | 纵滚 | `pan-y` / 层 `manipulation` | — | IME 例外 |
| IME 操作 | `pointer-guards` | — | 输入 `manipulation` | 可选 capture | `pointerdown` 一次 |

### 9.2–9.4

浮层栈、壳层配置与初盘检索见实施期记录；收口后 IME/ghost 已收敛到 `pointer-guards.js`，诊断已含会话字段。

### 9.5 初盘风险 → 收口状态

| 初盘风险 | 收口状态 |
| --- | --- |
| 五套 ghost 重复 | **已关闭**（C：共享 `pointer-guards`） |
| `touch-action` 例外脆 | **部分关闭**（D：课表格改回 `none`；人员选择/高亮仍为例外） |
| 激活双路径 | **部分关闭**（Sheet 短触直接激活；普通控件仍可走 click） |
| Capture 时机分裂 | **接受为设计**（座位/字母 down；Sheet 延迟；IME 可选） |
| 取消清理不均 | **大部分关闭**（C：生命周期 + 返回 + 清 ghost） |
| 测试缺口 | **大部分关闭**（B：纯逻辑；F+：浏览器+APK；人手手势仍建议抽测） |
| 滚动条不统一 | **已关闭**（D：仅作业/考试 `.scroll-thin`） |

## 10. 批次 F 验收报告

### 10.1 已执行

| 检查 | 结果 |
| --- | --- |
| `node --check` 全部脚本 + `lan-server.js` + `content-id.cjs` | 通过 |
| `node --test tests/*.test.mjs` | 66 通过 |
| `git diff --check` / 工作区 | 干净 |
| 调试残留 / 任务外生成物 | 未发现强制改动的 `www/`/`dist/`；无业务 `console.log` |

### 10.2 授权验收（原“未执行”项）

见 §10.5。人手触控手势与 IME/旋转/切后台仍建议在真机抽测。

### 10.3 现行文档同步

| 文档 | 同步内容 |
| --- | --- |
| `interaction.md` | 点击抑制、边缘交接、`pointer-guards`、`cancelActivePointerGesture`、`pan-y` 例外 |
| `visual-design.md` | `.scroll-thin` token、Sheet 共享控件基线 |
| `engineering.md` | `gesture-policy` / `pointer-guards` 职责映射 |
| `guides/development.md` | 诊断会话字段与手势测试入口 |
| `docs/README.md` | 本计划改为档案 |

### 10.4 最终结论

里程碑一在**不改 Schema / 信息架构 / 返回栈**前提下，完成触摸策略可测化、IME/幽灵点击收敛、滚动与 Sheet 边缘交接统一、Sheet 视觉控件基线收敛，以及默认可重复的静态/单元/浏览器/APK 验收路径。人手物理手势与 IME/旋转/后台抽测仍可按需补充。

计划关闭，移入 `docs/archive/`。

### 10.5 授权 Web/Android 验收记录（2026-07-30）

| 项 | 结果 |
| --- | --- |
| `.\tools\verify-web.ps1` | **37 项通过**。修正过时断言：成绩子视图已无 `.section-title`，且不得期望 `pan-y`；改为断言 `.grade-scroll`/顶栏 `touch-action:none`，并在顶栏横拖切页 |
| 源码 / `www` / APK assets 指纹 | 均为 `5938699f3474` |
| `npm run deploy:apk -- -Serial 10AD133K3D0011C` | 同步+assembleDebug+安装+启动成功；App `origin=https://localhost` |
| 真机 DOM | 46 学生卡 / 104 座位格 / 46 座位卡 |
| 真机 CDP | 成绩 Sheet 幽灵点击阻断与解除通过；诊断开关通过；Escape 关菜单通过；`.grade-scroll` 为 `none` |
| 触觉 | `MainActivity` 关闭框架 haptic；`haptics.js` 原生平台走 Capacitor Haptics 并 `return`（不双发）。体感未代测 |
| 未代测 | 慢拖/快甩/斜拖/长按/连续快速点击；系统 IME；旋转；切后台恢复 |
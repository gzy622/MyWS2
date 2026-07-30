# 架构说明

## 1. 架构目标

教师工作台采用零 Web 运行时依赖的原生 HTML、CSS 与 ES Modules。架构优先保证：

- Web Demo 无需构建即可运行。
- UI 瞬时状态与可持久化业务状态边界清楚。
- 网格、座位、人员和课程共用同一领域数据，不建立第二份可写副本。
- 可选 Capacitor Android 通道不进入浏览器模块依赖图。
- 生成目录与源码目录分离，避免误改或误打包开发工具。

## 2. 目录与交付边界

```text
src/
├─ index.html       静态语义结构和浮层容器
├─ scripts/         浏览器 ES Modules
└─ styles/          CSS token 与组件样式

tests/              Node 内置测试运行器用例
tools/              Node/PowerShell 开发、自动验收与交付工具
docs/               现行文档、指南和档案
android/            可选 Capacitor Android 工程
www/                 由 tools/sync-web-assets.ps1 生成
dist/                由 tools/build-single-html.ps1 生成
```

`src/` 是 Web 资源的唯一源码。`www/` 和 `dist/` 是可删除、可重建的输出目录，不得反向编辑。`lan-server.js` 将 `src/` 作为站点根目录，并提供 Live Reload、健康检查和内容指纹端点。

`tools/verify-web.ps1` 通过临时 LAN 服务与 Microsoft Edge CDP 执行零依赖浏览器验收；它只读取运行结果，不进入浏览器模块依赖图，也不写入 `src/`、`www/` 或 `dist/`。

## 3. 运行拓扑

### 浏览器路径

```text
node lan-server.js
  ├─ /                 → src/index.html
  ├─ /scripts/*        → src/scripts/*
  ├─ /styles/*         → src/styles/*
  ├─ /__health         → 服务状态与内容指纹
  ├─ /__build-id       → 内容指纹详情
  └─ /__livereload     → 开发期 SSE 刷新
```

`src/index.html` 只加载 `src/styles/main.css` 与 `src/scripts/main.js`。`main.js` 创建 Store、初始化模块并注入接口，不承载领域逻辑。

### Android 路径

```text
src/ ── tools/sync-web-assets.ps1 ──> www/
www/ ── Capacitor sync ──> android/ ── Gradle ──> APK
```

Capacitor 依赖只用于原生壳。浏览器代码通过 `globalThis.Capacitor` 做可选桥接，不静态导入 npm 包。

## 4. 状态边界

### UI 瞬时状态

`src/scripts/state.js` 保存当前页面、各页子视图、浮层、姓名字号控件、座位编辑模式、座位横屏模式、成绩当前考试与排序等 UI 状态；全局与局部点击抑制由手势与各模块守卫实现（见 [`interaction.md`](interaction.md)「点击抑制」），不写入 `state.js`。除姓名字号值外，这些状态刷新后重置。

### 业务状态

`src/scripts/roster-store.js` 是以下数据的唯一可写来源：

- 学生与座位；
- 作业、活动作业、完成记录与作业分数；
- 班干、值日及人员指派；
- 节次、课表格、科目、考试与课程成绩。

渲染器只订阅 Store，交互模块只调用 Store 方法。浮层可以保留未提交草稿，但确认前不得写入业务状态。

### 持久化

`src/scripts/roster-storage.js` 负责业务 Schema 的严格解析、已知版本迁移、整体回退与写入异常隔离。姓名字号、主题和高亮科目各由自己的模块管理受控键。允许的键见 [`engineering.md`](engineering.md)。

## 5. 模块分层

### 基础层

| 模块 | 职责 |
| --- | --- |
| `dom.js` | 集中查询必需 DOM，并在契约缺失时快速失败 |
| `state.js` | UI 瞬时状态与边界校验 |
| `roster-model.js` | 默认领域数据、Schema 常量、纯校验与迁移函数 |
| `focus.js`、`haptics.js`、`toast.js` | 焦点、触觉和临时反馈基础能力 |
| `viewport.js`、`theme.js`、`build-id.js` | 视口、主题和运行版本环境同步 |

### 导航与浮层基础设施

| 模块 | 职责 |
| --- | --- |
| `navigation.js` | 主页面、子视图、顶栏标题和导航状态渲染 |
| `gestures.js` | 主页面、底栏、分段与全屏 Sheet 手势路由 |
| `overlay-stack.js` | 浮层 ID、类型、视觉层级和唯一关闭优先级；不承载业务规则 |
| `sheet-drag.js` | Sheet progress 控制器、注册表和从 `overlay-stack.js` 派生的最上层顺序 |
| `sheet-gestures.js` | Sheet 全屏纵向跟手与滚动优先桥接 |
| `drawer.js`、`more-sheet.js` | 全屏设置页，以及底部“更多”上下文动作与确认面板 |
| `system-back.js` | Escape 与 Android 系统返回键的统一关闭入口，按 `overlay-stack.js` 顺序路由 |
| `sheet-debug.js` | 显式开启的 Sheet/构建调试信息 |

### 业务功能层

| 领域 | 模块 |
| --- | --- |
| 登记 | `roster-store.js`、`roster-storage.js`、`roster-renderer.js`、`student-interactions.js`、`student-record.js`、`assignments.js`、`student-font-size.js` |
| 座位 | `seat-geometry.js`、`seat-canvas.js`、`seat-landscape.js` |
| 姓名索引 | `name-initial.js`、`letter-index.js` |
| 人员 | `people-renderer.js`、`people-interactions.js` |
| 课程 | `courses-renderer.js`、`courses-interactions.js`、`exams.js`、`highlight-subjects-model.js`、`highlight-subjects.js` |
| 备份 | `backup.js` |

## 6. 数据流

```text
用户输入
  → 交互模块
  → UI state 或 roster-store
  → 导航渲染器 / 业务渲染器订阅
  → DOM 与 ARIA

roster-store 成功变更
  → roster-storage 保存
  → 刷新时严格读取或整体回退默认值
```

CSS class、ARIA 属性和 CSS 自定义属性都是状态的渲染结果，不是新的状态源。座位画布 transform 仅保存在 `seat-canvas.js` 内存中。

## 7. DOM 与手势契约

页面、导航和状态数组通过从 0 开始的 `data-page`、`data-index`、`data-sub`、`data-view` 一一对应。业务命令使用 `data-action`。完整必需 ID、class 和 data 契约见 [`engineering.md`](engineering.md)。

所有移动端手势继续使用 Pointer Events；纵向 Sheet（含更多）的关闭顺序由 `sheet-drag.js` 与 `system-back.js` 共同维护；全屏设置页只进入返回关闭栈，不注册为 Sheet。改变任何一方时必须同步另一方和 [`interaction.md`](interaction.md)。

## 8. 样式架构

`src/styles/main.css` 只负责按顺序聚合：

1. `tokens.css`：颜色、尺寸、阴影、圆角和动效变量；
2. `base.css`：reset、基础元素、通用动画和 reduced motion；
3. `shell.css`：应用外壳、顶栏、页面视口；
4. `content.css`：页面内容、网格、座位、人员和课程；
5. `sheets.css`：共享 Sheet 基础；
6. `controls.css`：底栏、全屏设置页、更多底部 Sheet、确认、Popover 与 Toast；
7. `assignments.css`：作业列表、作业名称、考试列表与考试名称。

深色主题只覆盖语义 token，不复制组件样式。

## 9. 架构变更原则

- 新模块必须有独立职责；不因文件数量本身继续分层。
- 不把业务逻辑塞入 `main.js`、`index.html` 或导航模块。
- 不让渲染器直接写 Store，也不让交互模块维护领域数组副本。
- 不让 `tools/`、`tests/` 或 npm 包进入浏览器模块图。
- 目录或入口变化必须同步内容指纹、Web 资源同步、单文件导出、测试引用和文档。

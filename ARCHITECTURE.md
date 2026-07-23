# 架构说明

本项目是零依赖的原生 HTML、CSS 与 ES Modules Demo，不需要构建步骤。

## 启动

```powershell
node lan-server.js
```

请通过 `http://localhost:8080` 访问；不要直接双击 `index.html`，因为浏览器会限制 ES Modules 的加载。

## 文件职责

| 位置 | 职责 |
| --- | --- |
| `index.html` | 静态语义结构、三页内容、登记网格与座位画布容器、业务浮层、导航、抽屉与 Toast 文案。修改页面文案请编辑此文件；学生与座位默认数据由领域模型维护。 |
| `styles/tokens.css` | 颜色、尺寸与动画变量。 |
| `styles/base.css` | Reset、基础元素、通用动画和减弱动效设置。 |
| `styles/shell.css` | 应用外壳、顶栏、页面视口及桌面容器。 |
| `styles/content.css` | 页面内容组件、卡片、进度与趋势图。 |
| `styles/controls.css` | 底部导航、菜单按钮、字号浮层、抽屉、遮罩和 Toast。 |
| `styles/main.css` | 按顺序聚合所有样式模块。 |
| `scripts/dom.js` | 固定 DOM 引用与缺失元素检查。 |
| `scripts/state.js` | UI 瞬时状态来源与状态边界。 |
| `scripts/navigation.js` | 主页面、子视图和导航渲染及点击。 |
| `scripts/gestures.js` | 横向拖动与底部导航上滑意图。 |
| `scripts/drawer.js` | 抽屉开关与下拉关闭手势。 |
| `scripts/toast.js` | 菜单反馈与 Toast 生命周期。 |
| `scripts/student-font-size.js` | 网格姓名字号控制及字号持久化。 |
| `scripts/seat-geometry.js` | 13×8 座位逻辑几何的唯一常量来源。 |
| `scripts/seat-canvas.js` | 座位画布的自适应定位、平移、缩放、惯性与编辑拖放手势。 |
| `scripts/roster-model.js` | 默认学生、座位、作业及领域纯校验函数。 |
| `scripts/roster-store.js` | 唯一业务状态、领域查询、变更与订阅通知。 |
| `scripts/roster-storage.js` | 业务 Schema 的严格读取、迁移、回退与写入。 |
| `scripts/theme.js` | 浅色/深色主题状态、根主题属性与受控主题持久化。 |
| `scripts/roster-renderer.js` | 基于 Store 同步渲染网格和座位卡。 |
| `scripts/student-interactions.js` | 学生轻点、长按、右键和点击抑制。 |
| `scripts/student-record.js` | 学生记录面板、分数草稿、校验和焦点管理。 |
| `scripts/assignments.js` | 作业列表及新增、改名、删除流程。 |
| `scripts/more-sheet.js` | 登记上下文更多面板与批量操作入口。 |
| `scripts/viewport.js` | Visual Viewport 与输入法可见区域同步。 |
| `scripts/main.js` | 初始化编排。 |

## 状态与 DOM 契约

状态分为两个边界：`scripts/state.js` 是 UI 瞬时状态来源，`scripts/roster-store.js` 是学生、座位、作业、提交和分数的唯一业务状态来源。刷新后仍从中间的“登记”页和各页第一子视图开始；导航、子视图、抽屉、浮层、座位编辑模式和画布 transform 均不持久化。持久化仅限学生姓名字号键 `teacher-workbench.student-name-font-size`、业务数据键 `teacher-workbench.roster.v1` 与主题键 `teacher-workbench.theme`，其读取和失败回退必须遵守工程 Spec。

`scripts/viewport.js` 将 Visual Viewport 的可见高度和顶部偏移同步到应用外壳；不支持时回退到 `window.innerHeight`。学生记录或作业输入期间只锁定背景网格的实际高度，不改变业务状态；短横屏仅在视口宽至少 500px 且高不超过 500px 时使用 10×5 网格，其他场景保持 5×10。

实现或评审改动前，还应阅读 `specs/` 下的产品、视觉、交互与工程约束；根目录 `AGENTS.md` 定义了强制执行顺序。

导航和内容依赖以下属性，修改结构时必须保留其含义：`data-page`、`data-index`、`data-sub`、`data-view`、`data-action`。

## 模块依赖

`dom.js`、`state.js` 和 `roster-model.js` 是基础模块。`roster-store.js` 只依赖模型并通过注入的 `roster-storage.js` 保存器持久化；渲染器和交互模块只通过 Store 读写业务数据，不直接修改业务数组。`navigation.js`、`gestures.js`、`drawer.js` 与 `toast.js` 只依赖 UI 基础模块（`gestures.js` 还使用导航的渲染接口）。`student-font-size.js` 和 `theme.js` 分别管理各自受控键；`seat-canvas.js` 依赖固定 DOM、`seat-geometry.js` 与 Store 操作接口，并独立保存非持久化的画布 transform。`main.js` 只负责创建 Store、初始化模块和注入接口，避免循环依赖。

修改导航请编辑 `scripts/navigation.js`，修改页面手势请编辑 `scripts/gestures.js`，修改抽屉请编辑 `scripts/drawer.js`，修改网格姓名字号行为请编辑 `scripts/student-font-size.js`，修改领域数据请编辑 `scripts/roster-store.js`。视觉修改应按对应样式模块定位。

# 架构说明

本项目是零依赖的原生 HTML、CSS 与 ES Modules Demo，不需要构建步骤。

## 启动

```bash
node lan-server.js
```

请通过 `http://localhost:8080` 访问；不要直接双击 `index.html`，因为浏览器会限制 ES Modules 的加载。

## 文件职责

| 位置 | 职责 |
| --- | --- |
| `index.html` | 静态语义结构、三页内容、登记网格、字号浮层、导航、抽屉与 Toast 文案。修改页面文案或学生名单请编辑此文件。 |
| `styles/tokens.css` | 颜色、尺寸与动画变量。 |
| `styles/base.css` | Reset、基础元素、通用动画和减弱动效设置。 |
| `styles/shell.css` | 应用外壳、顶栏、页面视口及桌面容器。 |
| `styles/content.css` | 页面内容组件、卡片、进度与趋势图。 |
| `styles/controls.css` | 底部导航、菜单按钮、字号浮层、抽屉、遮罩和 Toast。 |
| `styles/main.css` | 按顺序聚合所有样式模块。 |
| `scripts/dom.js` | 固定 DOM 引用与缺失元素检查。 |
| `scripts/state.js` | 唯一状态来源与状态边界。 |
| `scripts/navigation.js` | 主页面、子视图和导航渲染及点击。 |
| `scripts/gestures.js` | 横向拖动与底部导航上滑意图。 |
| `scripts/drawer.js` | 抽屉开关与下拉关闭手势。 |
| `scripts/toast.js` | 菜单反馈与 Toast 生命周期。 |
| `scripts/student-font-size.js` | 网格姓名字号、“更多”浮层与字号持久化。 |
| `scripts/main.js` | 初始化编排。 |

## 状态与 DOM 契约

应用状态唯一来源是 `scripts/state.js`；刷新后从中间的“登记”页和各页第一子视图开始。导航、子视图、抽屉和浮层开关不持久化；仅学生姓名字号允许使用 `localStorage` 键 `teacher-workbench.student-name-font-size` 保存。

实现或评审改动前，还应阅读 `specs/` 下的产品、视觉、交互与工程约束；根目录 `AGENTS.md` 定义了强制执行顺序。

导航和内容依赖以下属性，修改结构时必须保留其含义：`data-page`、`data-index`、`data-sub`、`data-view`、`data-action`。

## 模块依赖

`dom.js` 和 `state.js` 是基础模块。`navigation.js`、`gestures.js`、`drawer.js` 与 `toast.js` 只依赖基础模块（`gestures.js` 还使用导航的渲染接口）。`student-font-size.js` 依赖基础模块和 Toast 接口，独立管理字号浮层及持久化。`main.js` 负责导入并初始化全部功能；它将 `openDrawer` 注入手势模块，避免循环依赖。

修改导航请编辑 `scripts/navigation.js`，修改手势请编辑 `scripts/gestures.js`，修改抽屉请编辑 `scripts/drawer.js`，修改网格姓名字号行为请编辑 `scripts/student-font-size.js`。视觉修改应按对应样式模块定位。

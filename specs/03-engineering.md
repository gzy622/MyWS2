# 03 · 工程与验收 Spec

## 1. 技术约束

- 只使用原生 HTML、CSS、JavaScript ES Modules。
- 不新增 npm 依赖、框架、打包器、CSS-in-JS、图标库或远程 CDN。
- 不增加构建步骤；运行入口始终是 `node lan-server.js`。
- 代码应能在当前主流移动浏览器中工作；手势使用 Pointer Events。
- 不使用 `localStorage`、cookie 或 IndexedDB 保存界面状态。

## 2. 文件职责

| 修改类型 | 首选文件 |
| --- | --- |
| 页面结构、文案、卡片内容、语义属性 | `index.html` |
| 全局颜色、尺寸、缓动变量 | `styles/tokens.css` |
| reset、基础元素、全局动画、reduced motion | `styles/base.css` |
| 应用容器、顶栏、页面视口 | `styles/shell.css` |
| 页面内容、Hero、卡片、图表 | `styles/content.css` |
| 底导航、抽屉、Toast | `styles/controls.css` |
| DOM 查询及必需元素校验 | `scripts/dom.js` |
| 状态和状态边界 | `scripts/state.js` |
| 主/子导航和渲染 | `scripts/navigation.js` |
| 页面、导航手势 | `scripts/gestures.js` |
| 抽屉行为 | `scripts/drawer.js` |
| Toast 与占位菜单反馈 | `scripts/toast.js` |
| 初始化和依赖注入 | `scripts/main.js` |

不得为了“小改动方便”把 CSS 或 JS 塞回 `index.html`。只有新增了清晰、独立的职责时才创建新模块。

## 3. 不可破坏的 DOM 契约

以下 selector/属性被脚本依赖，修改结构时必须保留语义和唯一性：

- ID：`#app`、`#viewport`、`#pages`、`#nav`、`#glider`、`#drawer`、`#drawerHandle`、`#gestureTip`、`#menuButton`、`#moreButton`、`#closeDrawer`、`#scrim`、`#toast`。
- Class：`.page`、`.nav-btn`、`.segment`、`.subview`、`.subdots i`、`.menu-item`。
- Data：`data-page`、`data-index`、`data-sub`、`data-view`、`data-action`。

索引必须是从 0 开始的连续整数，并保持“页面—导航—状态数组”一一对应。

## 4. 模块依赖边界

- `dom.js`、`state.js` 为基础模块。
- `navigation.js` 负责状态到导航 DOM 的统一渲染。
- `gestures.js` 可以调用导航渲染，但不得直接形成新的导航状态源。
- `drawer.js` 独立管理抽屉；`main.js` 将 `openDrawer` 注入手势模块，以避免循环依赖。
- `main.js` 只负责编排初始化，不承载业务逻辑。

禁止复制一份类似的状态、渲染或手势逻辑到其他文件。

## 5. 改动流程

1. 读取任务相关 spec 和现有实现。
2. 列出需求影响：结构 / 视觉 / 状态 / 手势 / 可访问性。
3. 选择职责对应的最少文件；先复用 token、组件和函数。
4. 实现最小闭环，不顺手重构无关区域。
5. 做静态检查、运行检查和交互回归。
6. 检查 `git diff`，确认无意外格式化、文案或视觉漂移。

## 6. 代码质量要求

- 常量有语义化名称；手势阈值不得散落为魔法数字。
- 事件监听只在初始化函数中注册一次。
- 所有手势结束路径（up / cancel / lost capture）都要恢复临时视觉状态。
- DOM 查询集中在 `dom.js`，必需元素缺失时快速失败。
- 状态变更通过 `state.js` 导出的函数完成。
- CSS 优先使用 token；相同值重复出现 3 次以上时考虑提取变量。
- 不留下 `console.log`、调试边框、注释掉的大段代码或无用 selector。
- 不做全文件无关格式化。

## 7. 每次提交前验收清单

### 静态检查

- [ ] `node --check` 检查所有 `scripts/*.js` 和 `lan-server.js` 无语法错误。
- [ ] 页面中的 ID 唯一，`data-page` / `data-index` 连续且对应。
- [ ] 新增颜色、尺寸、动效符合视觉 Spec。
- [ ] 没有远程资源、第三方依赖、持久化或内联脚本样式。
- [ ] `git diff --check` 无空白错误。

### 运行检查

- [ ] `node lan-server.js` 可启动，`http://localhost:8080` 可访问。
- [ ] 控制台无 error，必需 DOM 查询不报错。
- [ ] 320px、390px、430px 宽度无水平溢出、遮挡或文字不可读。
- [ ] 桌面宽度下仍为最大 430px 的居中手机容器。
- [ ] 顶部和底部安全区布局正确。

### 回归检查

- [ ] 执行 `specs/02-interaction.md` 的 8 个必测场景。
- [ ] 点击和拖动不重复触发。
- [ ] active class、glider、subdots 和 ARIA 状态始终同步。
- [ ] reduced motion 下功能完整。
- [ ] 任务之外的页面、文案、视觉和行为没有改变。

## 8. 完成定义

只有同时满足以下条件才算完成：

1. 用户要求可见且可操作。
2. 没有破坏既有导航、滚动、抽屉与 Toast。
3. 视觉符合 `01-visual.md`，不是仅仅“能运行”。
4. 已执行能在当前环境执行的检查；未执行项及原因明确写出。
5. 最终回复列出修改文件、行为变化和验证结果，不用“应该可以”等模糊表述。

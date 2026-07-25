# 04 · 界面命名对照

本表定义当前教师工作台 Demo 的统一称呼，供需求、评审与开发沟通使用。名称描述界面职责，不替代现有 DOM class、ID 或 data 属性；代码改动仍须遵守 `ARCHITECTURE.md` 和工程 Spec 中的 DOM 契约。

## 1. 全局框架

| 沟通名称 | 对应元素 / 标识 | 说明 |
| --- | --- | --- |
| 应用外壳 | `#app.app` | 整个手机工作台容器。 |
| 应用顶栏 | `.topbar` | 最上方的三列操作栏。 |
| 菜单按钮 | `#menuButton` | 顶栏左侧的“菜单”触发器。 |
| 顶栏标题 | `#topbarTitle.topbar-title` | 居中显示当前页面语义：人员页显示“人员”，登记页显示当前活动作业名称（右侧向下箭头，左侧等宽占位以保持文字居中），课程页显示“课程”。 |
| 更多按钮 | `#moreButton` | 顶栏右侧触发器；登记页打开更多菜单，包含主题、清除当前作业及视图特定操作。 |
| 内容视口 | `#viewport.viewport` | 承载横向页面手势的可视区域。 |
| 页面轨道 | `#pages.pages` | 三个主页面组成的横向移动容器。 |
| 主页面 | `.page[data-page]` | 页面轨道中的一个纵向滚动容器。 |
| 页面内容内层 | `.page-inner` | 单个主页面的内容排版层。 |
| 子视图切换器 | `.segments` | 人员页和课程页中的两项分段控件；登记页不显示。 |
| 分段滑块 | `.segment-glider` | 跟随当前子视图移动的白色选中底。 |
| 子视图按钮 | `.segment[data-sub]` | 切换所属页面子视图的按钮。 |
| 子视图内容 | `.subview[data-view]` | 每个主页面的两个内容组之一。 |

## 2. 主页面与子视图

| 主页面 | `data-page` | 子视图（`data-view` / `data-sub`） | 统一简称 |
| --- | ---: | --- | --- |
| 人员页 | `0` | `0` 班干 | 班干视图 |
| 人员页 | `0` | `1` 值日 | 值日视图 |
| 登记页 | `1` | `0` 网格 | 网格视图 |
| 登记页 | `1` | `1` 座位 | 座位视图 |
| 课程页 | `2` | `0` 课表 | 课表视图 |
| 课程页 | `2` | `1` 成绩 | 成绩视图 |

提及某个子视图内部元素时，使用“**[子视图简称] + 元素名称**”的格式，例如“网格视图学生格”“座位视图 Hero 卡片”。

登记页不显示子视图切换器；重复点击底部的登记导航项，在网格视图与座位视图之间切换。

## 3. 网格视图

| 沟通名称 | 对应元素 / 标识 | 说明 |
| --- | --- | --- |
| 学生网格 | `#studentGrid.student-grid` | 一个 5 列 × 10 行的大矩形网格，共 50 格。 |
| 学生格 | `.student-card[role="listitem"]` | 学生网格中的姓名单元；当前共 46 个，末尾 4 格留空。 |
| 学生姓名 | `.student-card` 的文本内容 | Demo 占位姓名，默认字号 16px。 |
| 分数角标 | `.student-card[data-score]::after` | 仅存在 `data-score` 时显示的右上角文字，无背景和边框。 |
| 姓名字号变量 | `--student-name-size` | 由字号状态渲染到学生网格，控制全部学生姓名。 |

## 4. 作业与学生记录

| 沟通名称 | 对应元素 / 标识 | 说明 |
| --- | --- | --- |
| 活动作业 | `roster-store` 的 `activeAssignmentId` | 当前登记、计分和计数归属的作业。 |
| 完成记录 | `submissions` | `(assignmentId, studentId)` 唯一的已完成状态。 |
| 分数记录 | `scores` | `(assignmentId, studentId)` 唯一的 `0～100`、最多一位小数分数；存在即表示完成。 |

## 5. 浮层与弹层（四型）

沟通时使用本表「沟通名称」；类型决定视觉与动效基线（见视觉 Spec）。

| 沟通名称 | 对应元素 / 标识 | 类型 | 说明 |
| --- | --- | --- | --- |
| 通用菜单 | `#menuDrawer.menu-drawer` | 底部 Sheet | 从底部弹出的登记工具菜单。 |
| 学生记录 | `.student-record-sheet` | 底部 Sheet | 长按或右键学生后打开，计分与清除单人记录。 |
| 确认面板 | `.confirm-sheet` | 底部 Sheet | 危险操作确认（含删除作业、恢复默认名单等）。 |
| 作业列表 | `.assignment-sheet` | 顶部 Sheet | 显示作业、已交人数，管理选择、新增、改名和删除。 |
| 作业名称 | `.assignment-name-sheet` | 顶部 Sheet（二级） | 新增或改名共用的名称输入层；不占 `activeOverlay`。 |
| 更多菜单 | `.more-menu` | 角弹出 | 登记页右上角上下文菜单。 |
| 姓名字号 | `#fontSizePopover.font-size-popover` | 轻量 Popover | 仅网格视图由更多菜单打开的字号控制。 |
| Toast 提示 | `#toast.toast` | 反馈（非模态） | 顶部短暂提示，不纳入 Sheet 体系。 |

| 沟通名称 | 对应元素 / 标识 | 说明 |
| --- | --- | --- |
| 菜单遮罩 | `#scrim.scrim` | 通用菜单打开时覆盖主界面；其它 Sheet 使用各自遮罩层，颜色均为 `--scrim`。 |
| 通用菜单把手区 | `#menuDrawerHandle.menu-drawer-handle-zone` | 下拉关闭通用菜单的手势区域；阈值 88px。 |
| 学生记录把手区 | `#studentRecordHandle.student-record-handle-zone` | 下拉关闭学生记录的手势区域；阈值 88px。 |
| 作业列表把手区 | `.assignment-panel .sheet-handle-zone` | 上拉关闭作业列表的手势区域；阈值 88px。 |
| 作业名称把手区 | `.assignment-name-panel .sheet-handle-zone` | 上拉关闭作业名称的手势区域；阈值 88px。 |
| 通用菜单关闭按钮 | `#closeMenuDrawer.sheet-close` | 通用菜单头部右侧关闭触发器。 |
| 学生记录关闭按钮 | `#closeStudentRecord.sheet-close` | 学生记录头部右侧关闭触发器。 |
| 菜单项 | `.menu-item[data-action]` | 视图切换、批量标记、清除、复制未交或恢复默认的入口。 |
| 字号标题 | `.font-size-popover-head label` | 控件名称「姓名字号」。 |
| 字号滑杆 | `#studentFontSize` | `14～18px`、步长 `1px`。 |
| 字号数值 | `#studentFontSizeValue` | 例如「16px」。 |
| 字号刻度 | `.font-size-popover-scale` | 滑杆两端「小 / 大」。 |
| 字号持久化键 | `teacher-workbench.student-name-font-size` | 三个受控键之一。 |

关闭栈（高→低）：确认面板 → 作业名称 → 作业列表 → 学生记录 → 更多菜单 → 姓名字号 → 通用菜单。

## 6. 座位画布与编辑

| 沟通名称 | 对应元素 / 标识 | 说明 |
| --- | --- | --- |
| 座位逻辑位置 | `.seat-cell[data-seat-index]` | 13×8 网格中的一个位置，共 104 个。 |
| 座位卡 | `.seat-card[data-student-id]` | 已安排学生的座位表呈现，与网格共享完成与分数状态。 |
| 座位编辑模式 | `state.seatEditing` | 拖到空位移动，拖到占用位置交换。 |
| 座位画布 transform | `seat-canvas.js` 内存态 | 当前会话的平移和缩放，不持久化。 |

## 7. 人员列表与课程占位组件

人员页为已接入列表；课程页未接入前仍用差异化空态骨架（单层卡片，无假进度、无色块字图标）：

| 沟通名称 | 对应元素 / 标识 | 说明 |
| --- | --- | --- |
| 内容区标题 | `.section-title` | 子视图区块标题；课程空态右侧可用「未接入」状态字。 |
| 内容卡片 | `.card` | 当前子视图的唯一信息组容器。 |
| 班干列表 | `#roleList.role-list` | Store 驱动的班干职位列表。 |
| 值日列表 | `#dutyList.duty-list` | Store 驱动的值日轮换列表。 |
| 人员行 | `.people-row` | 可轻点指派、长按编辑的班干 / 值日行。 |
| 内容文案组 | `.grow` | 行内左侧文字容器。 |
| 内容项标题 | `.item-title` | 职位或日期等主文案。 |
| 内容项说明 | `.item-note` | 值日任务等辅助说明。 |
| 行状态 | `.item-status` | 未指派为「未指定」「未排」；已指派显示学生姓名。 |
| 学生选择 Sheet | `.people-pick-sheet` | 从名单指派或清除指派。 |
| 人员编辑 Sheet | `.people-edit-sheet` | 编辑职位/值日文案或删除项。 |
| 周课表条 | `.week-strip` | 课表视图的一周占位骨架。 |
| 成绩表 | `.grade-table` | 成绩视图的表头 + `—` 占位行。 |
| 空态说明 | `.empty-note` | 卡片内短说明，不假装已有业务数据。 |

## 8. 底部导航与手势提示

| 沟通名称 | 对应元素 / 标识 | 说明 |
| --- | --- | --- |
| 底部导航外壳 | `.bottom-shell` | 底部导航的背景与安全区容器，基础高度 66px。 |
| 底部主导航 | `#nav.nav` | 三个主页面入口，也是上滑打开通用菜单的手势区域。 |
| 导航滑块 | `#glider.nav-glider` | 跟随当前主页面移动的深色选中背景。 |
| 导航项 | `.nav-btn[data-index]` | 无可见文字的页面入口，通过图标和 `aria-label` 表达名称。 |
| 人员导航项 | `.nav-btn[data-index="0"]` | 进入人员页；再次点击切换班干 / 值日。 |
| 登记导航项 | `.nav-btn[data-index="1"]` | 进入登记页；再次点击切换网格 / 座位。 |
| 课程导航项 | `.nav-btn[data-index="2"]` | 进入课程页；再次点击切换课表 / 成绩。 |
| 导航图标 | `.nav-icon` | 导航项中的线性 SVG 图标容器。 |
| 子视图指示点 | `.subdots` | 导航项底部的两个状态点容器。 |
| 子视图指示点单元 | `.subdots i` | 对应该页面两个子视图的单个状态点。 |

## 9. 状态名称

| 状态名称 | 状态来源 / 表现 | 含义 |
| --- | --- | --- |
| 当前主页面 | `state.currentPage`、导航项 `.active` | 当前展示的人员、登记或课程页。 |
| 当前子视图 | `state.subviews`、子视图 `.active` | 每个主页面在本次会话内记住的子视图。 |
| 导航激活态 | `.nav-btn.active`、`aria-current="page"` | 与当前主页面对应的导航项状态。 |
| 分段激活态 | `.segment.active` | 人员页和课程页当前子视图的按钮状态。 |
| 内容激活态 | `.subview.active` | 当前可见的子视图内容状态。 |
| 指示点选中态 | `.subdots i.on` | 当前子视图对应的状态点。 |
| 姓名字号 | `state.studentFontSize` | 取值 14～18，并持久化保存。 |
| 姓名字号打开态 | `state.fontSizePopoverOpen`、`.font-size-popover.show` | 姓名字号控件当前可见；不持久化。 |
| 业务状态 | `roster-store.js` | 学生、座位、作业、提交、分数、班干与值日的唯一可写来源。 |
| 活动浮层 | `state.activeOverlay` | 当前业务浮层（`assignments` / `student-record` / `people-pick` / `people-edit` / `more` / `confirm`）；与通用菜单互斥且不持久化。 |
| 座位编辑态 | `state.seatEditing` | 当前会话中座位卡可移动/交换的状态。 |
| 拖动中 | `.pages.dragging`、`.nav-glider.dragging`、`.segment-glider.dragging` 或 `.menu-drawer.dragging` | 手势跟手阶段，临时取消过渡动画。 |
| 通用菜单打开态 | `state.drawerOpen`、`.app.drawer-open` | 通用菜单已打开（状态字段名保留 `drawerOpen`）。 |
| Toast 显示态 | `#toast.toast.show` | Toast 正在显示。 |
| 导航点击抑制态 | `state.suppressNavClick` | 有效拖动结束后的短暂误触保护。 |

## 10. 初始画面称呼

刷新后的默认画面称为“**登记页 / 网格视图首屏**”：`currentPage` 为 `1`，三个页面均选中各自的第一个子视图，通用菜单和姓名字号关闭，Toast 隐藏。学生姓名字号默认 16px；若本地存在有效持久化值，则恢复该值。

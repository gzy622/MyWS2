<!-- Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 -->
<!-- Hallmark · genre: modern-minimal · macrostructure: Workbench Stack · design-system: design.md · designed-as-app -->

# Design — 教师工作台

Workbench Stack 是本应用锁定的设计系统。页面与浮层修改先遵循本文件；它只描述呈现与交互层，不改变教师工作流、业务数据或固定文案。

## Genre

modern-minimal：冷灰纸面、黑白正文和克制的蓝色定位强调。红色只用于危险操作与关键提交。

## Macrostructure family

- App pages: 稳定顶栏 + 当前任务内容 + 稳定底栏；三页与各自两个子视图保持既有信息架构。
- Context: 顶部 Sheet 只切换作业或考试及其名称；底部 Sheet 完成选择、编辑、计分、统计和设置。
- Overlay: 姓名字号是唯一锚定 Popover；学生名单保持独立全屏页；Toast 始终位于最高反馈层。

## Theme

- `--paper` / `--card`: 冷灰纸面与白色内容表面，dark theme 使用等语义深色映射。
- `--ink` / `--muted`: 黑白正文与弱化说明。
- `--teal`: 蓝色定位、焦点与非危险的已选状态。
- `--accent` / `--accent-text`: 红色，仅危险、清除和关键提交。
- `--action-primary` / `--action-primary-text`: 非危险主操作的低饱和雾蓝表面；与蓝色定位语义同源但更柔和，浅色与深色主题分别映射。
- 课程表“今天”是安静的时间定位状态：正文色星期标题 + 蓝色小圆点 + 低比例冷蓝灰列洗底；不得复用红色危险弱底。
- 分层仅用 `--layer-chrome`、`--layer-popover`、`--layer-scrim`、`--layer-modal`、`--layer-nested`、`--layer-feedback`、`--layer-debug`。

## Typography and spacing

- 使用系统无衬线字体；标题始终正体。
- 沿用 `tokens.css` 的圆角、间距与动态 token；新增样式必须引用语义 token，不以颜色值或裸层级值表达语义。
- 所有可点击文案保持单行，内容区域可压缩且不产生横向滚动。

## Motion and microinteractions

- Sheet 以 `--duration-sheet` 和 `--ease` 直进直出；遮罩淡入淡出，跟手期仅更新面板 transform 与直接遮罩 opacity。
- Sheet 可纵向跟手关闭；关闭后立即退出命中以规避 ghost click。`prefers-reduced-motion` 保留降级。
- 更多操作的主操作、普通操作与危险操作统一使用纸面列表，避免大面积深色或红色底；危险操作只保留红色文字。关键提交按钮仍可使用高对比中性色或红色实底。共享关闭按钮、标题与底部操作区。

## Workbench Stack

浮层元数据与关闭优先级由 `src/scripts/overlay-stack.js` 统一定义。关闭从嵌套确认/编辑开始，依次到学生名单、学生记录、更多 Sheet、字号 Popover、通用菜单与横屏模式；Toast 不进入关闭栈。

## Shared invariants

- 顶栏与底栏是稳定 chrome，不因普通上下文操作改变。
- 同时只呈现一个业务主浮层；名称编辑与确认属于其嵌套层。
- 通用菜单含外观、学生名单和备份；学生名单是全屏页，不是 Sheet。
- 不使用图片、CDN、虚构数据或额外运行时依赖。

# 工程与验收

## 0. 最小必读

任意代码改动默认只读本节列出的章节，**不要默认通读全文**。其余章节按触发再读。

默认阅读：

- §1 技术边界
- §3 修改职责映射（只看与本次改动相关的行）
- §8 改动流程
- §9 代码质量
- §11 完成定义

按触发补充：

| 触发 | 再读 |
| --- | --- |
| 触及 DOM、ID、class 或跨模块外壳查询 | §5 DOM 契约；必要时 §2 目录职责、§4 状态与模块边界 |
| 触及存储或 Schema | §6 持久化契约 |
| 触及工具或生成物（`www/`、`dist/`、指纹等） | §7 工具与生成文件 |
| 收尾验收 | §10 验收清单（按当前环境执行可执行项；`verify-web` 节奏见 §10.0） |

## 1. 技术边界

- Web 运行时只使用原生 HTML、CSS 和 JavaScript ES Modules。
- 不新增 Web 运行时 npm 依赖、框架、打包器、CSS-in-JS、图标库或远程 CDN。
- 日常入口始终是 `node lan-server.js`；`src/` 无需转换即可运行。
- Capacitor、npm 和 `android/` 仅是可选 Android 通道，不得成为 Web Demo 的启动前置。
- Capacitor 能力只能通过 `globalThis.Capacitor` 可选桥接；浏览器模块禁止静态导入 npm 包。
- 移动端手势使用 Pointer Events，并保留 `prefers-reduced-motion` 降级。
- 不使用 cookie 或 IndexedDB 保存界面状态。

## 2. 目录职责

| 位置 | 职责 |
| --- | --- |
| `src/index.html` | 静态语义结构、页面与浮层容器、可访问属性和固定文案 |
| `src/scripts/` | 浏览器 ES Modules；默认业务数据由领域模型维护 |
| `src/styles/` | token、基础样式、外壳、内容、Sheet 和控件样式 |
| `tests/` | `node:test` 领域、存储与纯计算测试 |
| `tools/` | 内容指纹、单文件导出、Web 资源同步与 Android 辅助脚本 |
| `docs/` | 现行文档、操作指南和历史档案 |
| `android/` | 可选 Capacitor Android 工程 |
| `www/` | 由 `tools/sync-web-assets.ps1` 生成的 Capacitor Web 资源 |
| `dist/` | 由 `tools/build-single-html.ps1` 生成的单文件输出 |

`src/` 是 Web 资源唯一源码。禁止直接修改 `www/` 或 `dist/`，也不得把工具脚本复制回 `src/scripts/`。

## 3. 修改职责映射

| 修改类型 | 首选文件 |
| --- | --- |
| 页面结构、固定文案、语义属性 | `src/index.html` |
| 颜色、尺寸、圆角、阴影、缓动和语义层级 | `src/styles/tokens.css` |
| reset、基础元素、通用动画、reduced motion | `src/styles/base.css` |
| 应用容器、顶栏、页面视口 | `src/styles/shell.css` |
| 页面内容、网格、座位、人员、课程 | `src/styles/content.css` |
| 共享 Sheet | `src/styles/sheets.css` |
| 底栏、菜单、Popover、确认、Toast | `src/styles/controls.css` |
| 作业列表、作业名称、考试列表与考试名称 | `src/styles/assignments.css` |
| 跨模块固定 DOM 引用 | `src/scripts/dom.js` |
| UI 瞬时状态 | `src/scripts/state.js` |
| 默认数据、领域常量、Schema 校验与迁移 | `src/scripts/roster-model.js` |
| 业务查询、变更与订阅 | `src/scripts/roster-store.js` |
| 业务数据读取、迁移、回退与写入 | `src/scripts/roster-storage.js` |
| 网格和座位共享渲染 | `src/scripts/roster-renderer.js` |
| 学生名单全屏编辑 | `src/scripts/roster-editor.js` |
| 学生点击、长按和记录面板 | `src/scripts/student-interactions.js`、`src/scripts/student-record.js` |
| 打分键盘（标准/整十） | `src/scripts/score-keypad.js` |
| 作业管理 | `src/scripts/assignments.js` |
| 考试列表与考试名称 | `src/scripts/exams.js` |
| 座位几何、画布手势与主动横屏 | `src/scripts/seat-geometry.js`、`src/scripts/seat-canvas.js`、`src/scripts/seat-landscape.js` |
| 姓名首字母和侧边索引 | `src/scripts/name-initial.js`、`src/scripts/letter-index.js` |
| 人员渲染与交互 | `src/scripts/people-renderer.js`、`src/scripts/people-interactions.js` |
| 课程渲染与交互 | `src/scripts/courses-renderer.js`、`src/scripts/courses-interactions.js` |
| 高亮科目校验、存储与 Sheet | `src/scripts/highlight-subjects-model.js`、`src/scripts/highlight-subjects.js` |
| 备份导入导出 | `src/scripts/backup.js` |
| 表格导入导出 | `src/scripts/workbook-transfer.js`；旧 CSV 导入兼容保留在 `csv-transfer.js` |
| XLSX 文件生成与读取 | `src/scripts/xlsx-workbook.js` |
| 文本/二进制文件读写 | `src/scripts/text-file-transfer.js` |
| 主/子导航 | `src/scripts/navigation.js` |
| 页面、底栏、分段与 Sheet 手势路由 | `src/scripts/gestures.js`、`src/scripts/sheet-gestures.js` |
| 手势阈值与点击保护纯判定 | `src/scripts/gesture-policy.js` |
| IME 立即操作与幽灵点击保护 | `src/scripts/pointer-guards.js` |
| 细滚动条滑动显隐 | `src/scripts/scroll-thin.js`、`sheets.css` `.scroll-thin` |
| 浮层 ID、类型、视觉层与关闭优先级 | `src/scripts/overlay-stack.js` |
| Sheet progress 与最上层栈 | `src/scripts/sheet-drag.js`（读取 `overlay-stack.js`） |
| 全屏设置、更多底部 Sheet 与确认 | `src/scripts/drawer.js`、`src/scripts/more-sheet.js` |
| Escape / Android 返回 | `src/scripts/system-back.js`（读取 `overlay-stack.js`） |
| 主题、视口、触觉、焦点、Toast | 对应同名模块 |
| 初始化和依赖注入 | `src/scripts/main.js` |
| 内容指纹 | `tools/content-id.cjs`、`src/scripts/build-id.js` |
| 浏览器自动验收 | `tools/verify-web.ps1` |
| 单文件导出 | `tools/build-single-html.ps1` |
| Web 资源同步 | `tools/sync-web-assets.ps1` |
| Android 预览、部署、手机同步 | `tools/preview-native.ps1`、`tools/deploy-apk.ps1`、`tools/sync-phone.ps1`、`tools/live-reload-connections.js` |

不得为了“小改动方便”把 CSS 或 JS 塞回 `src/index.html`。只有出现清晰、独立且可测试的职责时才新建模块。

## 4. 状态与模块边界

- `state.js` 是 UI 瞬时状态来源；`roster-store.js` 是业务状态唯一可写来源。
- 渲染器只读取 Store 快照并订阅变更，不直接修改领域数组。
- 交互模块只调用 Store 方法；浮层草稿确认前可保存在模块内。
- `roster-storage.js` 只负责严格读取、已知迁移和写入，不承载业务操作。
- `navigation.js` 统一将页面状态渲染到轨道、顶栏、导航、分段、子视图和指示点。
- `gestures.js` 可调用导航渲染接口，但不得建立新的导航状态。
- `main.js` 只创建 Store、初始化模块和注入接口，禁止承载业务规则。
- CSS class、ARIA、data 属性和 CSS 自定义属性都是渲染结果，不是第二份状态。
- 跨模块外壳 DOM 查询集中在 `dom.js`；模块私有面板允许在所属模块内查询，但不得被其他模块依赖。

更完整的数据流和模块分层见 [`architecture.md`](architecture.md)。

## 5. DOM 契约

### 5.1 页面与导航

以下属性必须保留语义、唯一性和从 0 开始的连续索引：

- `data-page`：主页面，人员 `0`、登记 `1`、课程 `2`；
- `data-index`：底部导航，与主页面一一对应；
- `data-sub`：子视图按钮索引；
- `data-view`：子视图内容索引；
- `data-action`：业务命令入口。

每个主页面恰有两个子视图。`state.subviews`、页面 DOM、导航 DOM、分段控件和指示点必须保持同序。

### 5.2 必需外壳 ID

`src/scripts/dom.js` 是跨模块必需 selector 的事实来源。当前不可删除或复用的 ID 包括：

- 外壳与导航：`#app`、`#viewport`、`#pages`、`#nav`、`#glider`、`#topbarTitle`、`#topbarTitleLabel`、`#settingsButton`、`#moreButton`；
- 登记与座位：`#studentGrid`、`#gridLetterIndex`、`#studentFontSize`、`#studentFontSizeValue`、`#seatViewport`、`#seatStage`、`#seatGrid`、`#seatHint`、`#seatFitButton`、`#seatLandscapeButton`、`#seatModeBar`、`#seatEditStatus`、`#exitSeatEdit`、`#seatLetterIndex`；
- 人员与课程：`#roleList`、`#dutyList`、`#weekStrip`、`#gradeTable`；
- 设置、更多与反馈：`#fontSizePopover`、`#menuDrawer`、`#menuDrawerBuild`、`#closeMenuDrawer`、`#moreMenu`、`#moreMenuPanel`、`#moreMenuHandle`、`#closeMoreMenu`、`#moreMenuBuild`、`#toast`；
- 备份/表格文件选择：`#backupFileInput`（JSON、XLSX 与旧 CSV 共用）；
- 学生记录：`#studentRecordSheet`、`#studentRecordPanel`、`#studentRecordHandle`、`#studentRecordTitle`、`#closeStudentRecord`、`#studentRecordStatus`、`#studentScoreTensToggle`、`#studentScoreControls`、`#studentScoreInput`、`#studentScoreError`、`#cancelStudentRecord`、`#saveStudentRecord`；
- 上下文动作与确认：`#moreMenu [data-more-action]`、`#confirmSheet`、`#confirmTitle`、`#confirmMessage`、`#cancelConfirm`、`#acceptConfirm`。

模块私有标题、字段和面板 selector 也属于各模块内部契约；修改对应 HTML 时必须搜索 `querySelector`、`getElementById` 和事件委托选择器。

### 5.3 关键动态 class

不得改变以下 class 的语义：

- 导航：`.page`、`.nav-btn`、`.segment`、`.segment-glider`、`.subview`、`.subdots i`；
- 外壳瞬时态：`.is-sheet-gesturing`、`.is-page-gesturing`（跟手/落位时关闭顶栏 backdrop-filter）；设置页横滑跟手：`.menu-drawer.is-dragging`（跟手期间取消 transition）、`.app.is-drawer-gesturing`（跟手时关闭设置页头部 backdrop-filter）；全屏左滑面遮罩：`.fullscreen-scrim`、`.drawer-scrim`、`.roster-editor-scrim`（透明度与面板位移 1:1 跟手，`.is-dragging` 期间切换为 `--duration-scrim-track` 追赶过渡）；
- 登记：`.student-grid`、`.student-card`、`.seat-cell`、`.seat-card`、`.letter-index`、`.letter-index-item`、`.letter-index-badge`；
- 人员与课程：`.people-row`、`.week-slot-cell`、`.week-period-label`、`.grade-score-cell`、`.grade-subject-head`；
- 浮层与全屏页：`.menu-drawer`、`.more-menu`、`.student-record-sheet`、`.assignment-sheet`、`.assignment-name-sheet`、`.exam-sheet`、`.exam-name-sheet`、`.people-pick-sheet`、`.people-edit-sheet`、`.course-slot-sheet`、`.course-period-sheet`、`.course-subject-sheet`、`.course-grade-sheet`、`.course-stats-sheet`、`.course-highlight-sheet`、`.confirm-sheet`；受控 Sheet 的直接子级 `.sheet-scrim` 是唯一遮罩命中层，由 `sheet-drag.js` 注入和管理；
- 字母索引拖动态：`.is-scrubbing`、`.is-scrubbing-shown`、`.is-letter-hit`。

学生格可选 `data-score` 驱动分数角标；座位卡必须维护 `data-student-id` 与 `data-seat-index`。

## 6. 持久化契约

`localStorage` 只允许以下键：

| 键 | 所属模块 | 值 |
| --- | --- | --- |
| `teacher-workbench.student-name-font-size` | `student-font-size.js` | `14～18` |
| `teacher-workbench.roster.v1` | `roster-storage.js` | 完整业务 Schema 对象 |
| `teacher-workbench.theme` | `theme.js` | `light` 或 `dark` |
| `teacher-workbench.highlight-subjects` | `highlight-subjects.js` | 关键词 JSON |

禁止保存导航、子视图、设置页、浮层、座位编辑模式或画布 transform。所有读取、解析和写入都必须捕获存储不可用异常。

### 6.1 业务 Schema Version 6

结构示例如下；数组为便于阅读只展示代表项，实际存储必须包含完整字段并满足后续约束。

```js
{
  schemaVersion: 6,
  students: [{ id: 1, name: '示例学生', initial: 'S' }],
  seats: [{ studentId: 1, seatIndex: 0 }],
  assignments: [{ id: 1, name: '作业 1' }],
  activeAssignmentId: 1,
  submissions: [{ assignmentId: 1, studentId: 1 }],
  scores: [{ assignmentId: 1, studentId: 1, value: 95.5 }],
  nextAssignmentId: 1,
  roles: [{ id: 1, title: '班长', studentIds: [] }],
  duties: [{ id: 1, title: '周一', note: '扫地 · 擦黑板', studentIds: [] }],
  nextRoleId: 1,
  nextDutyId: 1,
  periods: [{ id: 1, title: '早' }],
  scheduleSlots: [{ day: 0, periodId: 1, subject: '语文' }],
  subjects: [{ id: 1, title: '语文' }],
  exams: [{ id: 1, title: '考试 1' }],
  courseGrades: [{ examId: 1, subjectId: 1, studentId: 1, value: 88 }],
  nextPeriodId: 10,
  nextSubjectId: 1,
  nextExamId: 1
}
```

约束：

- 默认数据为 46 名学生、稳定座位映射、1 个作业、4 个班干项、3 个值日项、10 个节次、3 个科目、1 场考试、空课表和空成绩。
- 学生、作业、班干、值日、节次、科目、考试 ID 及座位索引唯一；所有引用必须存在。
- 每名学生恰有一个 `0～103` 座位；同一逻辑位置最多一人。
- 学生 `initial` 为单个 `A～Z` 或 `#`（`#` 表示不归属任何字母）。名单编辑时未手动指定则按姓名首字推导（`name-initial.js` 姓表）；手动指定后持久化，字母索引以该字段为准。
- 同一 `(assignmentId, studentId)` 最多一条完成和一条作业分数；分数为 `0～100`、最多一位小数，存在分数必须存在完成记录。
- 同一 `(day, periodId)` 最多一个课表格；`day` 为 `0～4`，节次恰好 10 项。
- 同一 `(examId, subjectId, studentId)` 最多一条课程成绩；课程成绩与作业分数分立。
- 至少保留一个作业、班干项、值日项、科目和考试；活动作业必须存在。
- 人员与课程文案 trim 后非空且不超过 40 字；值日说明可为空。
- 学生姓名写入（新增/改名）trim 后非空且不超过 40 字；加载校验仍只要求非空，避免历史长名备份整体回退。
- Version 1/2/3/4/5 可显式迁移到 Version 6（各版本缺少的 `initial` 按姓名推导补齐）；未知版本、损坏 JSON、重复值、引用失效或无法完整校验时整体回退默认值。
- 写入失败不破坏当前内存会话。

### 6.2 表格数据交换

- 表格文件只包含业务 Store 数据；主题、姓名字号、高亮关键词、当前页面和临时界面状态不进入文件。
- 新导出文件名形如 `teacher-workbench-data-YYYYMMDD-HHmmss.xlsx`，格式版本为 `WORKBOOK_FORMAT_VERSION = 2`。表格导入继续接受格式版本 1 的十二工作表 XLSX 和旧 CSV；JSON 备份继续由独立入口保留。
- 新 XLSX 恰好生成「学生名单」「作业登记」「人员安排」「课程表」「考试成绩」五个固定工作表。用户增加的个人工作表可保留并在导入时忽略；五个固定工作表不可删除或改名。
- 「学生名单」可见列为姓名、座位行、座位列；学生编号和首字母在隐藏列中。学生行顺序决定应用中的名单顺序；座位行限定 1～8，座位列限定 1～13。
- 「作业登记」隐藏第一行保存作业编号，第二行 B2 显示「当前作业」并保存唯一标记，第三行 B3 显示「学生姓名」、C3 起保存作业名称，第四行开始为学生行；每项作业只有一列，空白表示未交，`✓` 表示已交未计分，0～100 表示已交且有分数，最多一位小数。
- 「人员安排」在同一工作表放置班干和值日两个表格，至少四个成员列；成员编号和实体编号在隐藏区域，成员格提供学生姓名下拉列表，重名时显示「姓名（编号 n）」；超过四人的既有安排自动增加成员列。
- 「课程表」可见区域为节次名称和星期一至星期五，隐藏列保存节次编号，固定十个节次；「考试成绩」隐藏第一行保存考试/科目编号，第二行显示考试名称并合并同一考试的表头，第三行显示科目名称，隐藏第一列保存学生编号；后续考试中的同科目标题跟随第一场考试。
- 标题行、学生姓名列和可修改区域使用分组样式；学生姓名列使用浅灰底，当前作业表头使用淡蓝底，已交标记居中，分数右对齐，考试分组使用细分隔线。标题行或学生姓名列按工作表设置冻结，矩阵表格带筛选；成员选择和成绩单元格带输入限制与说明批注。
- 隐藏行列同时保存格式版本、数据版本、各类数量和内部编号。导入要求学生行、作业列、人员行、十个节次、考试列和科目列保持完整，以避免误删导致数据减少。
- 导入先识别版本，再检查固定工作表、标题、隐藏编号、数量、重复、座位、人员引用、作业标记、成绩范围和完整矩阵。错误使用「工作表!单元格：说明」格式，例如 `作业登记!D8：请输入 ✓ 或 0～100 的分数`；检查全部通过并经确认后才替换业务数据和重置座位画布。
- XLSX 使用浏览器原生 ZIP/Deflate 与 Office Open XML 读写，不增加 Web 运行时依赖；支持隐藏行列、合并表头、批注、筛选、冻结窗格和输入限制。输入文件上限 5 MB，解压后的 XML 总量上限 24 MB；JSON 与旧 CSV 输入仍使用 1 MB 上限。

## 7. 工具与生成文件

- `tools/sync-web-assets.ps1` 只复制 `src/index.html`、`src/styles/` 和 `src/scripts/` 到 `www/`。
- `tools/content-id.cjs` 只对上述 Web 源码计算指纹；结果使用 `XXXX-XXXX-XX` 格式的 Crockford Base32，排除易混淆的 `I`、`L`、`O`、`U`。
- `tools/verify-web.ps1` 使用本机 PowerShell 7、Node.js 与 Microsoft Edge，通过临时 LAN 服务和 CDP 模拟 320px、390px、430px 视口，并检查 DOM、控制台、成绩表横拖、幽灵点击和 Sheet 合成层生命周期；不引入第三方依赖，不写入 Web 源码或业务存储。
- `tools/build-single-html.ps1` 默认从 `src/index.html` 生成 `dist/teacher-workbench.single.html`。
- `lan-server.js` 的 `POST /__rec` 接收 App 调试录制文本并保存到 `.debug-rec/`（git 忽略）；该目录是运行期调试产物，不属于 Web 源码或生成物，`www/`、`dist/` 重建不涉及它。
- `tools/live-reload-connections.js` 记录 LAN 服务当前 Live Reload 客户端数与累计连接序号，手机同步控制台用序号区分启动前已有连接和本次新连接。
- 源码、文档与配置文本默认保持 UTF-8 无 BOM + LF；根目录 `.bat` 必须保持纯 ASCII + CRLF，`tools/*.ps1` 保持 UTF-8 BOM + CRLF。
- `.editorconfig` 统一编辑器写入格式，`.gitattributes` 统一 Git 检出换行并阻止二进制规范化；新增文本类型时必须同步评估两者。
- 生成文件不得纳入日常源码评审；如需验证，重建后检查结果而非手工补丁。

## 8. 改动流程

1. 阅读任务相关现行文档与实现。
2. 列出结构、视觉、状态、手势、可访问性和工具链影响。
3. 选择职责对应的最少文件，先复用 token、组件和函数。
4. 实现完整闭环，不顺手重构无关区域。
5. 执行静态、单元、运行和相关交互检查。
6. 检查 `git diff` 与 `git diff --check`，排除用户已有改动和无意格式化。
7. 同步受影响文档；历史过程只在有长期回溯价值时进入 `archive/`。

## 9. 代码质量

- 常量使用语义化名称；手势阈值不散落为魔法数字。
- 事件监听只在初始化函数中注册一次。
- 所有手势结束路径（up、cancel、lost capture、卸载）恢复临时视觉状态。
- 与切页 / Sheet 跟手共享指针的滚动面和 `.sheet-scrim` 须 `touch-action: none` 并由脚本接管，禁止 `pan-x`/`pan-y`（否则浏览器中途 `pointercancel`；详见 `interaction.md` §7「防复发」）。所有带 layer 的 `createSheetController()` 注册必须提供 `onRequestClose`；遮罩轻点监听由控制器统一绑定，业务模块禁止使用 `event.target === layer` 另建关闭路径。
- Store 和 UI 状态必须经过各自边界函数修改。
- CSS 优先使用 token；同一新值重复出现 3 次以上时评估提取变量。
- 不留下无条件 `console.log`、调试边框、注释掉的大段代码或无用 selector。
- 不做全文件无关格式化，不覆盖工作区已有用户改动。

## 10. 验收清单

### 10.0 智能体验收边界

除非用户在当前任务明确要求，智能体不得启动浏览器自动验收、浏览器调试或 Android 链路测试。该限制适用于任何改动规模和提交阶段，并覆盖 `tools/verify-web.ps1`、Edge/CDP、为浏览器调试启动的服务、Android 同步、构建、部署、真机检查与 adb 调试。

未获得明确要求时，只执行与改动直接相关的快速检查：修改纯逻辑时运行对应测试文件；修改 JavaScript 时检查对应文件语法；所有文本或代码改动均可执行 `git diff --check`。不因大型改动、合并前或触及既有浏览器验收覆盖面而扩大检查范围。

### 10.1 静态与单元检查

- [ ] `node --check` 检查全部 `src/scripts/*.js`、`lan-server.js` 和 `tools/content-id.cjs`。
- [ ] `node --test tests/*.test.mjs` 全部通过。
- [ ] 仅在用户明确要求时执行 `.\tools\verify-web.ps1` 并全部通过。
- [ ] 页面 ID 唯一；`data-page` / `data-index` 为 `0～2` 且一一对应；每页 `data-sub` / `data-view` 连续。
- [ ] 浏览器运行后登记网格恰有 46 个 `.student-card`；座位表恰有 104 个 `.seat-cell` 和 46 张 `.seat-card`。
- [ ] 无远程运行时资源、内联业务脚本样式或第三方 Web 依赖。
- [ ] `localStorage` 只使用 4 个受控键；Capacitor 包未被浏览器模块静态导入。
- [ ] `www/` 同步结果不包含 `tools/`、`tests/` 或文档。
- [ ] `.debug-rec/` 为运行期调试产物（`POST /__rec` 写入），不入库、不参与同步。
- [ ] `git diff --check` 无空白错误。

### 10.2 运行检查

- [ ] `node lan-server.js` 可启动，`http://localhost:8080`、`/__health` 可访问。
- [ ] 页面资源从 `/styles/` 与 `/scripts/` 正常加载，控制台无 error。
- [ ] 320px、390px、430px 无水平溢出、遮挡或不可读文字。
- [ ] 桌面宽度保持最大 430px 的居中手机容器。
- [ ] 顶部、底部安全区和 Visual Viewport 行为正确。
- [ ] 单文件导出可生成，`npm run sync:www` 可重建仅含 Web 资源的 `www/`。

### 10.3 交互回归

- [ ] 执行 [`interaction.md`](interaction.md) 的 10 个必测场景。
- [ ] 点击、长按、拖动和 Sheet 跟手不重复触发。
- [ ] active class、导航滑块、分段滑块、指示点、顶栏标题和 ARIA 始终同步。
- [ ] 姓名字号、业务数据、主题和高亮科目按契约恢复；导航、浮层、编辑模式和 transform 不持久化。
- [ ] 网格与座位的完成、作业分数和活动作业始终同步。
- [ ] 作业分数与课程成绩互不污染。
- [ ] 320px、390px、430px、短横屏、主动座位横屏、软键盘和 reduced motion 下功能完整；座位查看模式姓名与状态可读，主动横屏在系统方向确认后隐藏顶栏/底栏、保持真实横屏比例、清除行首多余空白并自动适应回中，编辑模式可通过拖动和键盘完成移动/交换。
- [ ] 任务之外的页面、文案、视觉和行为没有改变。

### 10.4 用户要求时的 Android 检查

本节只在用户明确要求 Android 链路测试时适用。

- [ ] `npm run build:apk` 可生成 debug APK。
- [ ] `npm run deploy:apk` 可同步、构建并覆盖安装到目标设备。
- [ ] App 内容指纹与电脑源码一致；Live Reload `clients > 0` 时保存可刷新。
- [ ] 原生触觉与 Web 触觉互斥，同一操作只震一次。

## 11. 完成定义

以下条件同时满足才算完成：

1. 用户要求已形成可见或可验证结果。
2. 页面、状态、手势、DOM、存储和生成路径契约未被破坏。
3. 已执行当前环境可执行的检查；未执行项及原因明确记录。
4. `git diff` 不包含任务外改动，也未覆盖用户原有工作区修改。
5. 最终说明修改文件、结构或行为变化、验证结果和剩余限制。

# Android WebView 性能优化实施方案

> 状态：已实施（阶段 A/B/C）
> 主要平台：Capacitor Android App / Android System WebView
> 制定日期：2026-08-04

## 背景与目标

现状（已核对源码）：

- 每次业务变更，`RosterStore.#notify` 先为持久化创建一份快照，再为每个 Store 订阅者各创建一份快照；这是现有监听器隔离语义，不能在缺少不可变快照约束时直接改成共享对象。
- `summary-renderer`、`courses-renderer`、`people-renderer`、`roster-renderer` 各自订阅 Store。无论所在页面是否可见，每次变更都重建汇总矩阵（学生 × 作业）、成绩表（学生 × 科目）、周课表、班干/值日列表、46 张网格卡片与 104 个座位格。
- `main.js` 静态导入全部 49 个模块（约 611KB），其中 `workbook-transfer`（90KB）+ `xlsx-workbook`（37KB）+ `csv-transfer`（28KB）+ `text-file-transfer`（8KB）共约 163KB 只有用户执行表格导入导出时才用到。

目标：不改变 DOM 契约和数据结果，降低每次变更的主线程成本与冷启动解析量。预期效果：四个高成本渲染器由四个 Store 订阅合并为一个，隐藏页不再重建；启动 JS 解析量减少约 26%。首次触发表格功能会产生一次本地模块加载等待，必须处理加载失败。

## 范围

### 纳入

- `main.js` 的可见页面渲染协调器
- `navigation.js` 导航落位通知
- 四个渲染器移除独立 Store 订阅：`roster-renderer.js`、`summary-renderer.js`、`courses-renderer.js`、`people-renderer.js`
- `main.js` 表格模块延迟加载及失败处理
- `tools/build-single-html.ps1` 动态导入收集与可核对清单
- 同步 `docs/architecture.md`、`docs/engineering.md`
- 实施时重建 `www/`（`npm run sync:www`）与单文件导出，检查生成结果

### 不纳入

- 持久化合并为微任务批处理（需改变 `roster-store` 测试语义，列为后续可选项）
- `sheet-debug.js` 延迟加载（30KB；激活手势需启动期绑定，收益小，暂保留静态导入）
- XLSX 导出移入 Web Worker（另立任务）
- `color-mix()` 在旧 WebView 的兼容改造
- 浏览器自动验收与 Android 链路（未获授权）

## A. 可见页面渲染协调器

涉及 `src/scripts/main.js`、`navigation.js` 与四个渲染器。

不修改 `RosterStore.#notify`。当前 `subscribe` 为每个监听器传入独立快照，允许监听器改写自己的副本而不影响 Store 和其它监听器。直接共享同一快照会改变该行为，且现有测试只覆盖 Store 与持久化快照隔离，未覆盖监听器之间的隔离。

改由 `main.js` 把四个高成本渲染器合并成一个 Store 订阅：

1. `roster-renderer.js`、`summary-renderer.js`、`courses-renderer.js`、`people-renderer.js` 移除各自的 `store.subscribe(render)` 和不必要的启动期 `render()`，只返回渲染接口。
2. `main.js` 保存四个渲染器控制器，并建立唯一协调器：

```js
function renderVisibleBusinessView(snapshot = rosterStore.getSnapshot()) {
  const page = state.currentPage;
  const subview = state.subviews[page];

  coursesRenderer.render(snapshot);
  if (page === 0 && subview === 0) peopleRenderer.render(snapshot);
  else if (page === 1) rosterRenderer.render(snapshot);
  else if (page === 2 && subview === 0) summaryRenderer.render(snapshot);
}

renderVisibleBusinessView();
rosterStore.subscribe(renderVisibleBusinessView);
```

3. `courses-renderer.js` 的 `render(snapshot)` 按当前页面拆开处理：
   - 页面 0、子视图 1：仅执行 `renderWeekStrip`。
   - 页面 2、子视图 1：释放旧成绩表 scroll chrome，再执行 `renderGradeTable`。
   - 成绩子视图不可见：立即调用并清空 `releaseGradeScrollChrome`，不保留隐藏页 ResizeObserver 与滚动监听。
   - `highlightSubjects.subscribe` 仅在课表子视图可见时调用课表渲染，避免高亮设置关闭后重建其它页面。
4. `summary-renderer` 的排序点击仍直接调用自身 `render()`；点击发生时汇总必可见。
5. `exams`、`courses-interactions` 的 `onGradesUiChange` 和 `more-sheet` 的 `onQuickScoreChange` 改调 `renderVisibleBusinessView()`，保持 UI 状态变化后的即时更新。

### 导航落位通知

`navigation.js` 增加：

```js
const navigationSettledListeners = new Set();

export function subscribeNavigationSettled(listener) {
  navigationSettledListeners.add(listener);
  return () => navigationSettledListeners.delete(listener);
}
```

在 `renderNavigation()` 完成页面 class、ARIA、分段状态和 `syncLetterIndexPageVisibility` 后通知。`renderDrag`、`renderNavDrag`、`renderSegmentDrag` 跟手期间不通知，避免拖动时重建内容。

### 初始化顺序

1. 创建四个渲染器控制器。
2. 定义协调器并执行一次，确保默认登记页的 104 个座位格在 `seat-canvas` 使用前存在。
3. 注册唯一 Store 订阅。
4. 其余模块初始化完成后执行既有 `renderNavigation({ animate: false })`。
5. 初始导航渲染完成后注册 `subscribeNavigationSettled(() => renderVisibleBusinessView())`，避免启动阶段重复渲染；同步初始化期间用户无法触发导航，不会漏事件。

保持独立订阅（成本低或已有显示控制）：`assignments.js`、`exams.js`、`letter-index.js`、`roster-editor.js`、`highlight-subjects.js`。因此改动不会更改 `RosterStore.subscribe` 的公开语义；四个高成本渲染器只获取一份协调器快照。

备份或表格导入可能在任意页面发生：Store 通知只更新当前可见业务视图；用户切页后由导航落位通知使用最新快照渲染目标视图。

## B. 表格模块延迟加载

涉及 `src/scripts/main.js` 与 `tools/build-single-html.ps1`。

### 主入口

- 删除静态导入 `import { initWorkbookTransfer } from './workbook-transfer.js';`。
- 增加单例加载入口；加载失败时清空缓存，允许用户重试：

```js
let workbookTransferPromise;
function ensureWorkbookTransfer() {
  workbookTransferPromise ??= import('./workbook-transfer.js')
    .then(({ initWorkbookTransfer }) => initWorkbookTransfer({
      store: rosterStore,
      showToast,
      confirm: (...args) => moreSheet.confirm(...args),
      fileInput: transferFileInput,
      onAfterImport: afterDataReplace,
    }))
    .catch((error) => {
      workbookTransferPromise = undefined;
      throw error;
    });
  return workbookTransferPromise;
}

async function runWorkbookAction(method, failureMessage) {
  try {
    const transfer = await ensureWorkbookTransfer();
    await transfer[method]();
  } catch {
    showToast(failureMessage);
  }
}
```

- `initDrawer` 回调分别调用 `runWorkbookAction('importWorkbook', '导入表格失败')` 和 `runWorkbookAction('exportWorkbook', '导出表格失败')`，复用现有错误文案。
- 多次点击共享同一个加载 Promise；模块初始化后，`initWorkbookTransfer` 现有 `importing` / `exporting` 守卫继续阻止同类动作并发。
- 首次点击导入或导出时才加载；加载后缓存，重复使用。
- 静态导入移除后，`xlsx-workbook.js`、`csv-transfer.js`、`text-file-transfer.js` 随依赖图一并延迟。

### 单文件导出构建器

`$moduleImportPattern` 需同时收集动态导入，否则单文件导出会缺模块、运行时加载失败。修改为：

```powershell
$moduleImportPattern = [regex]::new(
  '(?ms)\b(?:import\s*\(\s*|(?:import|export)\s+(?:[^;"'']+?\s+from\s+)?)(?<quote>["''])(?<specifier>\.[^"'']+)\k<quote>',
  [Text.RegularExpressions.RegexOptions]::CultureInvariant
)
```

其余机制不变：specifier 字符串替换为 token，loader 注入 blob URL，`import('blob:…')` 可直接执行；已通过静态路径收集的模块自动去重。动态导入必须使用相对路径字符串字面量，不得使用模板字符串或变量。该正则需用静态 import、side-effect import、export-from 和动态 import 四类样例核对。

## C. 现行文档同步

- `docs/architecture.md` §5/§6：四个高成本渲染器由 `main.js` 协调，Store 变更只重建当前可见业务视图；表格模块首次使用时加载。
- `docs/engineering.md` §3/§4/§7：登记 `main.js` 的可见渲染协调职责、导航落位通知、单文件导出对相对路径动态 import 的支持与限制。
- 本计划实施并验收完成后移入 `docs/archive/`，同时更新 `docs/README.md` 状态。

## 验证

按阶段执行，全部为本地快速检查：

- 阶段 A 后：`node --check` 检查 `main.js`、`navigation.js` 与四个渲染器；运行 `node --test tests/*.test.mjs`。现有 Node 测试不覆盖 DOM 渲染时机，交付时明确记录。
- 阶段 B 后：先用四类样例实际运行计划中的 PowerShell 正则；再执行 `pwsh -NoProfile tools/build-single-html.ps1`。
- 单文件清单检查：从生成 HTML 提取并解码 `manifestBase64`，确认清单包含 `src/scripts/workbook-transfer.js`、`xlsx-workbook.js`、`csv-transfer.js`、`text-file-transfer.js`，并确认 `main.js` 的依赖记录包含 `./workbook-transfer.js`。直接搜索动态导入源码无效，因为模块源码存放为 Base64。
- 表格逻辑检查：`node --test tests/workbook-transfer.test.mjs tests/csv-transfer.test.mjs`。
- 收尾：`npm run sync:www` 重建生成物；`npm run code:id` 计算内容指纹；`git diff --check`。
- 不执行 `verify-web`、浏览器自动验收与 Android 链路（未获授权）。未验证项：切页后的首次渲染、登记快速连续操作、懒加载首次点击、单文件浏览器运行、Android WebView 冷启动与帧时间。

## 风险与处理

1. 移除渲染器自订阅会改变内容构建时机。已确认人员与课程交互使用父容器事件委托；登记初始渲染仍必须早于 `seat-canvas` 可能读取座位格。若单个渲染器存在其它启动副作用，保留该模块的初始化调用，但仍由协调器接管后续 Store 更新。
2. 导航落位通知必须在 DOM class 与 ARIA 更新之后触发，跟手期间不得触发。若出现首次切页内容为空，优先检查监听注册顺序，不恢复隐藏页全量重建。
3. 成绩表离开可见状态时必须释放 scroll chrome；否则隐藏页仍保留 ResizeObserver 与滚动监听，削弱本次优化。
4. 动态导入失败后必须清空缓存并显示既有导入或导出错误文案；未清空会让后续点击永久复用失败 Promise。
5. 单文件构建器正则遗漏会生成缺模块的文件；验收必须解码清单，构建成功和源码字面量搜索都不足以证明完整。
6. `color-mix()` 需要 Chromium 111+，不更新 WebView 的老设备背景会失效。本次不处理，交付说明中记录。

## 分批与提交

- 阶段 A：可见渲染协调器 → `perf: 合并高成本渲染订阅并仅更新当前视图`
- 阶段 B：懒加载 + 构建器适配 → `perf: 延迟加载表格模块并适配单文件导出`
- 阶段 C：文档同步 + 全量检查 → `docs: 同步可见渲染与动态导入说明`

每阶段独立提交，正文简体中文。

# 项目文档

本目录将**现行约束、事实说明、操作指南和历史档案**分开维护。文档文件名使用稳定的英文 kebab-case，不依赖数字序号表达优先级。

智能体日常以仓库根目录 [`AGENTS.md`](../AGENTS.md) 的阅读路由为准；[`agent-workflow.md`](agent-workflow.md) 定义工作规则、验证边界和冲突处理。本文件只维护文档地图。

## 智能体工作文档

| 文档 | 职责 | 何时阅读 |
| --- | --- | --- |
| [`../AGENTS.md`](../AGENTS.md) | 工作入口、阅读路由、强制边界和交付约定 | 每个任务开始时自动加载 |
| [`agent-workflow.md`](agent-workflow.md) | 工作基线、冲突处理、验证边界和规则维护 | 重建工作规则、维护文档或处理冲突时 |

## 现行文档

| 文档 | 职责 | 何时阅读 |
| --- | --- | --- |
| [`product.md`](product.md) | 产品定义、固定信息架构、范围和文案原则 | 改页面、功能或业务范围前 |
| [`visual-design.md`](visual-design.md) | 视觉 token、组件外观、布局和动效基线 | 改 CSS、图标或视觉状态前 |
| [`interaction.md`](interaction.md) | 状态模型、业务交互、手势、返回栈与可访问性 | 改状态、事件或手势前 |
| [`engineering.md`](engineering.md) | 技术边界、文件职责、DOM/存储契约和验收清单 | 所有代码改动：先读「最小必读」；其余章节按触发 |
| [`architecture.md`](architecture.md) | 当前目录、模块关系、数据流和交付边界 | 改模块职责或跨模块依赖前 |
| [`glossary.md`](glossary.md) | 产品、领域、界面和工程统一用语 | 写需求、评审、命名或文案时 |

## 执行计划

当前进行中的阶段计划与已完成记录如下；已完成计划另存于 [`archive/`](archive/)。

| 文档 | 状态 | 用途 |
| --- | --- | --- |
| [`android-webview-performance-plan.md`](android-webview-performance-plan.md) | 待实施（2026-08-04） | Capacitor Android WebView 可见页面渲染、表格模块延迟加载与单文件导出适配 |
| [`archive/webview-flicker-remediation-plan.md`](archive/webview-flicker-remediation-plan.md) | 已完成并验收通过（2026-08-03） | WebView 闪烁风险修订、分批实施和验证记录 |
| [`archive/milestone-one-unification-plan.md`](archive/milestone-one-unification-plan.md) | 已完成（2026-07-30） | 里程碑一触摸可靠性、滚动与 UI 统一收口记录 |

## 指南与档案

| 位置 | 性质 |
| --- | --- |
| [`guides/development.md`](guides/development.md) | 启动、测试、单文件导出、Android 预览与部署操作指南 |
| [`archive/`](archive/) | 已完成方案与历史决策，仅用于回溯，不参与日常规则优先级 |

## 维护规则

- 工作规则、冲突处理和验证边界维护在 [`agent-workflow.md`](agent-workflow.md)。
- 行为变化必须同步对应现行文档，不能只改术语表或架构说明。
- `architecture.md` 描述当前事实，不承载冗长操作步骤；操作步骤写入 `guides/`。
- `glossary.md` 定义沟通语言，不复制整份 DOM 契约。
- 已完成的执行日志放入 `archive/`，现行文档不保留过时阶段计划。
- 链接使用相对路径；路径调整时同步修改源码注释、工具入口和 `AGENTS.md`。

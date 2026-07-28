# 项目执行规则

以本文件为日常执行入口。按下方路由**只打开命中的文档或章节**；不要通读全部现行文档。

## 文档阅读路由

| 改动类型 | 打开 |
| --- | --- |
| 任意代码改动 | `docs/engineering.md` 的「最小必读」；并查看 §3 中与改动相关的映射行 |
| 改 CSS、图标或视觉状态 | 再加 `docs/visual-design.md` |
| 改状态、手势、返回栈或浮层行为 | 再加 `docs/interaction.md` 对应章节 |
| 改页面、功能范围或固定文案 | 再加 `docs/product.md` |
| 改模块职责或跨模块依赖 | 再加 `docs/architecture.md` |
| 命名或文案用语不确定 | 再加 `docs/glossary.md` 相关节 |
| 启动、测试、导出或 Android 操作 | `docs/guides/development.md` |
| 维护文档、处理冲突，或不确定该读哪份 | `docs/README.md` |

`docs/README.md` 是文档地图与冲突/维护规则，不是每次开工的必读入口。

## 强制工作方式

- 先复述需求影响到的页面、状态和文件，再动手。
- 按改动职责按需分批提交；仅当本次任务产生可 Git 提交的改动时，才在最终回复末尾输出本批次可直接使用的 Git commit message。提交信息必须使用 Conventional Commits 格式，以代码块呈现；类型标签使用英文（如 `feat`、`fix`、`docs`），正文使用简体中文。
- 若用户要求与 spec 冲突，以用户最新的明确要求为准，但要指出冲突和处理方式。

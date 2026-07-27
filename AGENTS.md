# 项目执行规则

修改本项目之前，先阅读 `docs/README.md`，再按照改动涉及面阅读：

1. `docs/product.md`
2. `docs/visual-design.md`
3. `docs/interaction.md`
4. `docs/engineering.md`
5. `docs/architecture.md`
6. `docs/glossary.md`

## 强制工作方式

- 先复述需求影响到的页面、状态和文件，再动手。
- 现有界面是设计基线，不得以个人偏好重做。没有明确要求时，不改颜色、字体层级、圆角、阴影、间距和动效。
- 一个需求只修改职责对应的模块；禁止把模块重新合并、引入框架、构建工具或第三方依赖。
- 保留所有 DOM/状态契约及移动端手势。
- 完成后逐项执行 `docs/engineering.md` 的验收清单，并在回复中说明修改文件和验证结果。
- 按改动职责按需分批提交；仅当本次任务产生可 Git 提交的改动时，才在最终回复末尾输出本批次可直接使用的 Git commit message。提交信息必须使用 Conventional Commits 格式，以代码块呈现；类型标签使用英文（如 `feat`、`fix`、`docs`），正文使用简体中文。
- 若用户要求与 spec 冲突，以用户最新的明确要求为准，但要指出冲突和处理方式。

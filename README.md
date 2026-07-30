# 教师工作台

教师工作台是一个面向手机的高保真本地 Demo，用于演示人员安排、作业登记、座位管理、课表与成绩录入。Web 运行时使用原生 HTML、CSS 和 ES Modules；Capacitor Android 仅是可选交付通道。

## 快速开始

需要 Node.js，无需安装 npm 依赖：

```powershell
node lan-server.js
```

浏览器访问 <http://localhost:8080>。不要直接双击 `src/index.html`，浏览器会限制 ES Modules 加载。项目根目录的 `index.html` 是静态托管兼容入口，会转至完整的 `src/` 应用。

Windows 也可双击 `start-lan-server.bat`。

## GitHub Pages 部署

仓库已包含 `.github/workflows/deploy-pages.yml`：推送至 `main` 分支后会将 `src/` 部署为 GitHub Pages 站点根目录，并生成用于版本显示的 `build-id.json`。

首次启用时，在仓库 **Settings → Pages → Build and deployment** 中将 Source 设为 **GitHub Actions**。工作流完成后，从该页提供的站点地址访问；所有资源均使用相对路径，因此项目页（`https://<用户名>.github.io/<仓库名>/`）可直接打开。

## 常用命令

```powershell
# 单元测试
node --test tests/*.test.mjs

# 浏览器自动验收（PowerShell 7 + Microsoft Edge）
.\tools\verify-web.ps1

# 生成可直接打开的单文件版本
.\tools\build-single-html.ps1

# 计算当前 Web 源码内容指纹
npm run code:id

# 可选：同步 Capacitor Web 资源
npm run sync:www

# 可选：构建 Android debug APK
npm run build:apk
```

Android 命令需要先执行 `npm install`，并准备 JDK 21+、Android SDK 与 adb。完整流程见 [`docs/guides/development.md`](docs/guides/development.md)。

## 目录结构

```text
.
├─ index.html           静态托管兼容入口，转至 src/ 应用
├─ src/                 Web 源码：HTML、浏览器脚本与样式
├─ tests/               零依赖 Node 单元测试
├─ tools/               构建、同步、内容指纹与 Android 辅助工具
├─ docs/                现行文档、开发指南与历史档案
├─ android/             可选 Capacitor Android 工程
├─ dist/                单文件导出（生成目录，不提交）
├─ www/                 Capacitor Web 资源（生成目录，不提交）
├─ lan-server.js        零依赖开发服务器与 Live Reload
└─ *.bat                Windows 便捷启动入口
```

`src/` 是 Web 资源的唯一源码；`www/` 和 `dist/` 均由工具生成，不应手工修改。

## 文档入口

- [文档导航与优先级](docs/README.md)
- [产品与范围](docs/product.md)
- [视觉设计](docs/visual-design.md)
- [交互与状态](docs/interaction.md)
- [工程与验收](docs/engineering.md)
- [架构说明](docs/architecture.md)
- [项目术语表](docs/glossary.md)

## 项目边界

- 不引入 Web 运行时框架、打包器或远程 CDN。
- 不把可选 Android 工具链变成 Web Demo 的启动前置。
- 导航与浮层状态不持久化；业务数据只使用文档允许的受控存储键。
- 修改前遵守根目录 [`AGENTS.md`](AGENTS.md) 的执行规则。

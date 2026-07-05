# 外语词测 Cloudflare Pages 部署说明

这是从原本地版「外语词测」整理出的静态前端仓库。仓库根目录已经放置 `index.html`，适合接入 Cloudflare Pages 作为静态站点发布。

## 项目类型

- 类型：纯 HTML/CSS/JavaScript 静态前端
- 入口文件：`index.html`
- 样式文件：`styles.css`
- 脚本文件：`app.js`
- PWA 文件：`manifest.webmanifest`、`sw.js`、`icon-192.png`、`icon-512.png`
- 依赖安装：无
- `node_modules`：未提交，且已在 `.gitignore` 中忽略

## Cloudflare Pages 设置

在 Cloudflare Pages 中选择 GitHub 仓库后，使用以下设置：

| 设置项 | 值 |
| --- | --- |
| Framework preset | `None` / `Static HTML` |
| Production branch | `main` |
| Build command | `exit 0` |
| Build output directory | `/` |

如果 Cloudflare 控制台要求相对路径形式，`Build output directory` 可填写 `.`，含义同样是仓库根目录。

## 部署步骤

1. 把本仓库推送到 GitHub 的 `main` 分支。
2. 打开 Cloudflare Dashboard，进入 `Workers & Pages`。
3. 选择 `Create application`，切到 `Pages`。
4. 选择 `Import an existing Git repository`，授权并选择本仓库。
5. 按上方表格填写构建设置。
6. 点击部署，部署完成后访问 Cloudflare 提供的 `*.pages.dev` 地址。

## 后端与环境检查

原本地项目不是完整的纯静态应用，曾包含 Python 后端与本地 Ollama 调用。本次整理只放入可静态托管的前端文件，没有提交本地后端、日志、PDF 测试文件、Cloudflare Tunnel 二进制或运行数据。

检查结果：

- 后端 API：前端仍会请求 `/api/login`、`/api/status`、`/api/health`、`/api/judge`、`/api/export-pdf`。
- 数据库：未发现数据库依赖。
- 本地文件读写：原 Python 后端会读写 `data/settings.json`、错误日志和导出的 PDF；这些文件没有放进本仓库。前端只使用浏览器 `localStorage` 和用户手动导入的词表文件。
- 环境变量：原 Python 后端使用过 `VOCAB_APP_TOKEN`、`OLLAMA_HOST`、`OLLAMA_MODEL`、`OLLAMA_TIMEOUT_SEC`、`VOCAB_MAX_JSON_BYTES`；静态 Pages 部署不会使用这些变量。

## 重要限制

Cloudflare Pages 可以托管当前静态前端，但仅部署这些文件时，登录、AI 判卷、健康检查和 PDF 导出接口不会工作，因为这些功能依赖原来的 Python/Ollama 后端。

如果要让完整功能在 Cloudflare 上运行，需要后续把 `/api/*` 迁移到 Cloudflare Pages Functions 或 Workers，并把 AI 判卷改成可从云端访问的服务。

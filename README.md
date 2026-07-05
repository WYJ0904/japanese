# 外语词测 Cloudflare Pages 部署说明

这是从原本地版“外语词测”整理出的 Cloudflare Pages 仓库。仓库根目录提供静态前端，`functions/api/[[path]].js` 提供 `/api/*` 代理，用来把线上 Pages 请求转发回你电脑上运行的 Python/Ollama 本地后端。

## 项目类型

- 类型：纯 HTML/CSS/JavaScript + Cloudflare Pages Functions
- 前端入口：`index.html`
- 样式文件：`styles.css`
- 脚本文件：`app.js`
- PWA 文件：`manifest.webmanifest`、`sw.js`、`icon-192.png`、`icon-512.png`
- 后端代理：`functions/api/[[path]].js`
- 依赖安装：无
- `node_modules`：不要提交，已在 `.gitignore` 中忽略

## Cloudflare Pages 设置

| 设置项 | 值 |
| --- | --- |
| Framework preset | `None` / `Static HTML` |
| Production branch | `main` |
| Build command | `exit 0` |
| Build output directory | `/` |

如果 Cloudflare 控制台要求相对路径，`Build output directory` 可以填 `.`。

## 本地后端路线

你选择继续使用本地 Ollama。线上 Pages 本身不能直接访问你电脑的 `localhost`，所以需要用 Cloudflare Tunnel 把本地 Python 后端暴露成一个 HTTPS 地址，然后让 Pages Function 代理过去。

### 1. 在电脑上启动本地后端

旧本地项目目录：

```text
C:\Users\78252\Documents\Codex\2026-06-27\presentations-plugin-presentations-openai-primary-runtime\outputs\vocab-website
```

双击或运行：

```powershell
start-all.cmd
```

它会启动：

- Python 本地网站：`http://127.0.0.1:8765`
- 本地 Ollama：默认由后端调用 `http://127.0.0.1:11434`
- Cloudflare Tunnel：生成 `https://...trycloudflare.com`

Tunnel 地址会保存到：

```text
data\latest-url.txt
```

访问口令在旧项目的：

```text
data\settings.json
```

### 2. 在 Cloudflare Pages 设置环境变量

进入 Cloudflare Dashboard：

```text
Workers & Pages -> japanese -> Settings -> Environment variables
```

添加生产环境变量：

| 变量名 | 示例值 |
| --- | --- |
| `LOCAL_API_BASE` | `https://xxxx.trycloudflare.com` |

保存后重新部署 Pages。之后浏览器访问 `https://japanese-6pa.pages.dev/` 时，前端请求 `/api/login`、`/api/status`、`/api/health`、`/api/judge`、`/api/export-pdf` 会由 Cloudflare Pages Function 转发到这个本地 Tunnel。

临时 `trycloudflare.com` 地址可能会变化。如果 Tunnel 断开并换了新地址，需要更新 `LOCAL_API_BASE` 并重新部署。长期使用建议改成 Cloudflare Named Tunnel 和固定域名。

## 后端与环境检查

- 后端 API：由旧 Python 后端提供，Pages Function 只做代理。
- 数据库：未发现数据库依赖。
- 本地文件读写：旧 Python 后端会读写 `data/settings.json`、错误日志和导出的 PDF；这些运行时文件不提交到 GitHub。
- 前端本地数据：浏览器使用 `localStorage` 保存词表、错题本、会话和设置。
- 本地后端环境变量：旧 Python 后端支持 `VOCAB_APP_TOKEN`、`OLLAMA_HOST`、`OLLAMA_MODEL`、`OLLAMA_TIMEOUT_SEC`、`VOCAB_MAX_JSON_BYTES`、`VOCAB_HOST`、`VOCAB_PORT`。
- Pages 环境变量：线上只需要 `LOCAL_API_BASE` 指向本地 Tunnel 地址。

## 部署步骤

1. 提交并推送本仓库到 GitHub `main` 分支。
2. Cloudflare Pages 按上方表格部署。
3. 在你的电脑上运行旧项目的 `start-all.cmd`。
4. 复制 `data\latest-url.txt` 里的 Tunnel 地址。
5. 在 Cloudflare Pages 生产环境变量中设置 `LOCAL_API_BASE`。
6. 重新部署 Pages。
7. 打开 `https://japanese-6pa.pages.dev/`，输入旧本地后端显示或 `data\settings.json` 中的访问口令。

## 注意

不要把 Ollama 的 `11434` 端口直接暴露到公网。只暴露旧 Python 后端的 `8765` 端口，并继续使用访问口令保护应用。

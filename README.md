# 外语词测 Cloudflare Pages 部署说明

这是从原本地版“外语词测”整理出的 Cloudflare Pages 仓库。仓库根目录提供静态前端，`functions/api/[[path]].js` 提供 `/api/*` 代理，用来把线上 Pages 请求转发回你电脑上运行的 Python/Ollama 本地后端。

## 项目类型

- 类型：纯 HTML/CSS/JavaScript + Cloudflare Pages Functions
- 前端入口：`index.html`
- 样式文件：`styles.css`
- 脚本文件：`app.js`
- PWA 文件：`manifest.webmanifest`、`sw.js`、`icon-192.png`、`icon-512.png`；应用外壳支持离线打开
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

日常使用请双击：

```text
C:\Users\78252\Desktop\编程\背单词网站\启动外语词测.cmd
```

启动程序会检查并自动修复：

- Python 本地网站：`http://127.0.0.1:8765`
- 本地 Ollama：默认由后端调用 `http://127.0.0.1:11434`
- Cloudflare Named Tunnel：固定域名 `https://api.thewyj.uk`

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
| `LOCAL_API_BASE` | `https://api.thewyj.uk` |

保存后重新部署 Pages。前端请求 `/api/login`、`/api/status`、`/api/health`、`/api/judge`、`/api/rubric`、`/api/export-pdf` 会由 Cloudflare Pages Function 转发到固定 Tunnel。

代理代码不再包含硬编码的临时 `trycloudflare.com` 地址。只有明确设置 `LOCAL_API_FALLBACK` 时才使用备用后端，避免把登录口令或会话转发到失效的临时域名。

## 本地复习与错题备份

- 第一次释义判卷使用本地 Ollama 生成标准释义和可接受答案。
- 错题复习直接使用已保存的释义在浏览器本地判卷，不重复请求 AI。
- 旧的跳过记录如果没有标准释义，会在本地 AI 在线时补充一次，之后即可离线复习。
- “导出错题数据”生成结构化 JSON，包含本轮错题、历史错题、标准释义和可接受答案。
- “导入错题数据”会与当前错题合并，导入后可直接复习或重新导出 PDF。
- PDF 用于打印和阅读；JSON 用于可靠备份、恢复和本地复习。

## 后端与环境检查

- 后端 API：由旧 Python 后端提供，Pages Function 只做代理。
- 数据库：未发现数据库依赖。
- 本地文件读写：旧 Python 后端会读写 `data/settings.json`、错误日志和导出的 PDF；这些运行时文件不提交到 GitHub。
- 前端本地数据：浏览器使用 `localStorage` 保存错题、成就和设置；登录会话只保存在当前浏览器会话的 `sessionStorage`。
- 本地后端环境变量：支持 `VOCAB_APP_TOKEN`、`OLLAMA_HOST`、`OLLAMA_MODEL`、`OLLAMA_TIMEOUT_SEC`、`VOCAB_MAX_JSON_BYTES`、`VOCAB_MAX_REJECT_DRAIN_BYTES`、`VOCAB_HOST`、`VOCAB_PORT`、`VOCAB_SESSION_TTL_SEC`、`VOCAB_SESSION_MAX_ITEMS`、`VOCAB_AI_MAX_CONCURRENCY`、`VOCAB_AI_QUEUE_TIMEOUT_SEC`。
- Pages 环境变量：线上只需要 `LOCAL_API_BASE` 指向本地 Tunnel 地址。

## 部署步骤

1. 提交并推送本仓库到 GitHub `main` 分支。
2. Cloudflare Pages 按上方表格部署。
3. 在 Cloudflare Pages 生产环境变量中设置 `LOCAL_API_BASE=https://api.thewyj.uk`。
4. 重新部署 Pages。
5. 在电脑上双击桌面目录里的 `启动外语词测.cmd`。
6. 打开 `https://thewyj.uk`，输入本地后端 `data\settings.json` 中的访问口令。

## 注意

不要把 Ollama 的 `11434` 端口直接暴露到公网。只暴露旧 Python 后端的 `8765` 端口，并继续使用访问口令保护应用。

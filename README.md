# WYJ的网站

这是部署在 Cloudflare Pages 上的纯 HTML/CSS/JavaScript 词汇测试网站。前端通过 `functions/api/[[path]].js` 把 `/api/*` 请求转发到 `https://api.thewyj.uk`，再由 Cloudflare Tunnel 连接到本机 Python 后端和 Ollama。

## 架构

- 前端：纯 HTML、CSS、JavaScript，无 npm 依赖、无构建步骤
- Pages Functions：`functions/api/[[path]].js`，只负责 API 代理
- 本地后端：Python 标准库 `ThreadingHTTPServer`
- 数据库：SQLite，运行时文件 `data/users.sqlite3`
- 用户镜像：运行目录中的 `users.txt`，按产品要求包含明文登录密钥
- 本地 AI：Ollama
- PWA：`manifest.webmanifest`、`sw.js`、现有图标和离线应用外壳

网站入口为仓库根目录的 `index.html`，Cloudflare Pages 不需要 `node_modules`。

## 页面流程

刷新网站后先播放全屏启动动画。未登录时先显示登录/注册页，登录成功后才显示项目选择页。选择英语或日语后，底层语言会被固定，不再重复显示语言选择框。返回项目选择页不会刷新页面，也不会清除登录、本地错题、成就或设置。

前端会对 `/api/status` 做短间隔重试；设备重新联网或从微信后台回到页面时会自动复查。登录和注册按钮也会主动恢复连接，单次网络超时不会再被永久误判为 `LOCAL_API_BASE` 未配置。

账户区位于页面右上角。超级管理员用户名固定为 `wyj`，但登录密钥不再写入公开仓库。已有数据库保留原密钥；全新数据库首次创建时读取本机 `VOCAB_ADMIN_SECRET`，未设置时生成随机密钥并写入运行目录的 `users.txt`。只有数据库会话中同时满足 `username == "wyj"` 和 `role == "super_admin"` 的账户才能看到并访问 `/admin`。普通用户即使手工打开该路径或直接调用管理员 API，也会被服务器拒绝。

## 账户与会员

`users` 表保存：

- `id`：用户 ID
- `username` / `username_normalized`：显示名及不区分大小写的唯一索引
- `secret`：明文登录密钥（产品明确要求）
- `role`：`user` 或 `super_admin`
- `membership`：`free`、`trial_single_language`、`monthly`、`lifetime`
- `membership_start` / `membership_expires`：会员开始和到期时间
- `trial_language`：体验版无限使用的单一语言
- `registered_at` / `last_login_at` / `created_at` / `updated_at`
- `banned` / `permanent_ban` / `deleted` / `ban_reason`

`sessions` 表保存 7 天有效的持久登录会话；改密钥、封禁、强制退出或删除账户会立即删除相应会话。

`recharge_requests` 表保存套餐、体验语言、申请时间、处理状态和管理员处理记录。同一用户同时只能有一条待处理申请，选择套餐不会自动开通会员。

普通账户每次最多测试 15 个单词。前端会提示并打开会员窗口，后端 `/api/quiz/start` 仍会独立校验，因此不能通过修改浏览器变量绕过。体验会员只对已选语言无限；包月、永久和超级管理员对两种语言无限。后端在每次读取账户和授权测试时检查到期时间，过期后立即恢复 `free`。

词表页提供“AI 联网选词”：日语支持 JLPT N5 至 N1，英语支持小学三至六年级、初中一至三年级、高中一至三年级及大学英语四、六级。用户可填写数量并选择替换或追加词表。追加时前端会把已有词传给后端排除，后端也会再次过滤重复词；界面按实际新增数量反馈，不会把重复词误报为已追加。后端只访问预设搜索服务，日语优先使用 JLPT 标签候选，搜索资料由本地 Ollama 过滤和去重；外网资料暂不可用时会明确降级为本地 AI。普通账户仍受 15 词限制，其他账户单次最多生成 100 词。

管理员编辑会员时，开始和截止日期可按 `年/月/日` 输入，分隔符支持 `/`、`.`、`。` 和空格。开始日期会采用管理员点击保存时的本地时、分、秒；截止日期固定保存为所选日期当天 `23:59:59`。数据库中仍统一存储为 UTC ISO 时间，旧数据格式保持兼容。

## 数据文件

实际运行目录：

```text
C:\Users\78252\Documents\Codex\2026-06-27\presentations-plugin-presentations-openai-primary-runtime\outputs\vocab-website
```

运行数据位于：

```text
data\users.sqlite3
users.txt
```

`users.txt` 先写临时文件，再使用 `os.replace` 原子替换。数据库提交成功但 TXT 同步失败时，API 会明确返回“数据库已保存但 TXT 同步失败”，不会向界面伪报成功。以上文件不在 `static` 中，也已被 `.gitignore` 排除，不能通过网站 URL 下载。

浏览器中的错题、成就、设置和会话继续保存在原有 `localStorage` / `sessionStorage` 键中。待测试词表使用账户 ID、语言和使用者名称隔离；每次重新登录、退出或注销账户时会清除待测试词表以及旧版共享词表键，避免上一次登录留下的单词再次出现。错题、成就和设置不会随之清除。

英语和日语的判卷方式、练习方式与 AI 选词选项分别保存在新增的 `gradingMode:english|japanese`、`practiceMode:english|japanese` 和 `aiSuggestSettings:english|japanese` 键中。首次升级会从旧版共享设置迁移一份初始值，之后两个项目互不串台；原有键仍保留用于向旧版本兼容。登录成功和退出登录都会清空页面中的明文密钥输入框。

明文密钥存在固有安全风险。不要公开运行目录、SQLite 文件或 `users.txt`，也不要把它们提交到 GitHub。此实现仅用于满足当前产品要求。

## 主要 API

账户接口：

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `POST /api/account/secret`
- `POST /api/account/delete`
- `POST /api/recharge/request`
- `POST /api/quiz/start`
- `POST /api/vocabulary/suggest`

管理员接口（统一验证当前数据库会话）：

- `GET /api/admin/users`
- `GET /api/admin/recharge`
- `POST /api/admin/membership`
- `POST /api/admin/secret`
- `POST /api/admin/ban`
- `POST /api/admin/logout-user`
- `POST /api/admin/delete-user`
- `POST /api/admin/recharge/process`

原有 `/api/status`、`/api/health`、`/api/rubric`、`/api/judge`、`/api/export-pdf` 保留。判卷接口需要由 `/api/quiz/start` 返回的 `quiz_session`，且服务器会再次检查会员权限。

## 手动启动

本项目**不配置开机自启动**。每次电脑重启后，需要手动双击：

```text
C:\Users\78252\Desktop\编程\背单词网站\启动WYJ网站.cmd
```

启动器会同步仓库中的 `local-backend/server.py` 和 `account_store.py`，检查并启动 Ollama、本地后端和 Cloudflare Tunnel，最后打开 `https://thewyj.uk`。它不会创建 Windows 启动文件夹快捷方式。

另外两个工具：

```text
测试WYJ网站.cmd  # 数据库、权限、API、PDF、压力、浏览器和离线测试
排错WYJ网站.cmd  # 生成诊断报告；可检查端口、DNS、Tunnel 和文件同步
```

## Cloudflare Pages

| 设置 | 值 |
| --- | --- |
| Framework preset | `None` / `Static HTML` |
| Production branch | `main` |
| Build command | `exit 0` |
| Build output directory | `/`（控制台要求相对路径时填 `.`） |

生产环境变量：

| 变量 | 值 |
| --- | --- |
| `LOCAL_API_BASE` | `https://api.thewyj.uk` |

部署步骤：

1. 将 `main` 推送到 `WYJ0904/japanese`。
2. Cloudflare Pages 连接该仓库和 `main` 分支。
3. 按上表配置构建选项和 `LOCAL_API_BASE`。
4. 重新部署 Pages。
5. 手动运行桌面启动器，保持本地后端和 Tunnel 在线。
6. 打开 `https://thewyj.uk` 验证 `/api/status` 和账户登录。

## 本地测试

后端单元与 HTTP 集成测试：

```powershell
cd local-backend
python -m py_compile account_store.py server.py test_accounts.py test_api.py
python -m unittest -v test_accounts.py test_api.py
```

前端语法检查：

```powershell
node --check app.js
node --check desktop-tools\vocab-ui-test.cjs
```

完整测试推荐直接双击桌面的 `测试WYJ网站.cmd`。测试结果会写入同目录的 `测试结果` 文件夹，包括 API/PDF 压力报告、浏览器截图和错误详情。

纯静态项目没有单独的 TypeScript 类型检查或 ESLint 配置。这里的“构建”是确认根目录静态资源、Pages Function 和 Service Worker 可直接部署；不会生成 `dist`。

## 环境变量

本地后端支持：`OLLAMA_HOST`、`OLLAMA_MODEL`、`OLLAMA_TIMEOUT_SEC`、`VOCAB_HOST`、`VOCAB_PORT`、`VOCAB_SESSION_TTL_SEC`、`VOCAB_SESSION_MAX_ITEMS`、`VOCAB_AI_MAX_CONCURRENCY`、`VOCAB_AI_QUEUE_TIMEOUT_SEC`、`VOCAB_MAX_JSON_BYTES`、`VOCAB_MAX_REJECT_DRAIN_BYTES`、`VOCAB_USERS_DB`、`VOCAB_USERS_TXT`、`VOCAB_STATIC_DIR`、`VOCAB_ADMIN_SECRET`。`VOCAB_ADMIN_SECRET` 只在创建全新管理员记录时使用，不会在重启时覆盖已有管理员密钥。

不要把 Ollama 的 `11434` 端口直接暴露到公网。公网只通过 Tunnel 访问受账户和会话保护的 Python 后端 `8765`。

# WYJ的网站

这是部署在 Cloudflare Pages 上的语言测试与在线工具箱。前端是纯 HTML/CSS/JavaScript，账户、会员、临时分享、PDF 和本地 AI 由 Python 标准库后端提供，公网通过 Cloudflare Tunnel 访问本机后端。

正式网站：<https://thewyj.uk>

## 技术栈与部署结构

- 前端：`index.html`、`styles.css`、`app.js`、`tools.js`
- PWA：`manifest.webmanifest`、`sw.js`
- Pages Functions：`functions/api/[[path]].js`，把同源 `/api/*` 请求代理到固定 Tunnel
- 后端：Python 3.8+ 标准库 `ThreadingHTTPServer`
- 数据库：SQLite
- 本地 AI：Ollama，默认模型 `qwen3:8b`
- 公网链路：Cloudflare Pages -> Pages Function -> `api.thewyj.uk` -> Cloudflare Tunnel -> 本机 `8765`
- 构建系统：无；不需要 npm、Vite、React、Vue 或 `node_modules`

网站根目录保留 `index.html`，Cloudflare Pages 可直接发布仓库根目录。

## 页面流程与路由

```text
打开或刷新
-> 全屏启动动画
-> 未登录进入 /login 或 /register
-> 已登录进入 /select
-> 选择语言测试或在线工具箱
```

主要路由：

- `/login`、`/register`：登录与注册
- `/select`：登录后的功能选择
- `/language`：语言项目选择
- `/language/english`、`/language/japanese`：固定语言测试
- `/tools`、`/tools/<tool-id>`：会员工具箱
- `/account`、`/recharge`：账户与充值
- `/admin`：超级管理员后台
- `/share/<type>/<id>`：临时分享读取页

未登录访问受保护路由会回到 `/login`。没有 `tools_access` 的用户访问 `/tools` 会回到 `/select` 并打开充值窗口。工具页每次进入都会调用服务端 `/api/tools/access`，工具偏好、临时分享和管理员 API 也独立验证服务端会话与权益。

## 会员方案

唯一价格与权益配置位于 `local-backend/membership.py`。前端方案、充值订单和后端开通逻辑读取同一份服务端配置。

| 方案代码 | 价格 | 权益 |
| --- | ---: | --- |
| `trial_single_language` | 8 CNY/月 | 英语或日语任选一种，所选语言会员功能一个月，不包含工具箱 |
| `japanese_lifetime` | 70 CNY | 仅日语会员功能，永久有效，不包含工具箱 |
| `all_access_monthly` | 30 CNY/月 | 全部语言会员功能、工具箱、批量处理、临时分享、配置保存 |
| `all_access_lifetime` | 100 CNY | 全功能永久有效 |

权益代码：

- `language_japanese_access`
- `language_all_access`
- `tools_access`
- `tools_batch_access`
- `temporary_share_access`
- `save_tool_config`
- `all_features_access`

权限按有效会员记录合并，不使用单一 `isVip`。优先级为全功能永久、全功能月度、日语单项、单语言包月体验、普通用户。月度会员到期后立即失去对应权益，但同时存在的日语永久权益仍会保留。超级管理员拥有全部权益。

### 老会员兼容

原有数据不会被覆盖：

- 旧 `trial_single_language` 保持原语言和剩余时间；新订单按 8 CNY/月销售，旧待处理订单仍保留原 5 CNY 金额
- 旧 `monthly` 迁移为 `legacy_all_monthly`，保持原双语言包月权限，不新增工具权限
- 旧 `lifetime` 迁移为 `legacy_all_lifetime`，保持原双语言永久权限，不新增工具权限
- 旧待处理充值按原价格和原权益迁移，不会被静默改成新方案

旧双语言兼容方案不可由新用户购买。旧缓存页面提交 `monthly` 或 `lifetime` 会被服务端拒绝，避免价格或权益误开。

## 充值与管理员

充值窗口显示用户名、方案、单语言订单所选语言、金额、微信号 `W2009Y94J`、订单编号和付款备注。用户点击“我已付款”只会把订单改为待管理员核对，不会自动开通会员。

管理员后台支持：

- 查看用户、有效会员、合并权益、开通与到期时间
- 查看、批准或拒绝充值申请
- 开通、续期或取消指定会员
- 降级普通用户并按需保留日语永久会员
- 单独关闭或恢复工具权益
- 重置密钥、强制退出、封禁、解封和删除测试用户
- 查看管理员审计日志与工具使用统计

所有管理员接口都在服务端验证固定超级管理员身份。会员、充值、封禁和账户操作记录管理员、对象、修改前后状态、时间与备注。封禁、改密、强制退出和删除会递增会话版本或清除会话，旧令牌不能继续使用。

## 在线工具箱

工具箱共 103 项，目录和实现位于 `tools.js`。每项工具都有简短用途说明；搜索会同时匹配名称、说明、分类、别名和工具 ID，并支持部分关键词、顺序字符和少量拼写偏差。原始文本、图片和普通文件默认只在浏览器本地处理，不上传服务器；服务端默认只保存工具 ID、使用时间、收藏和用户主动保存的配置。

### 文本处理（29）

统计、去重行、去空行、合并空格、大小写、camelCase、PascalCase、snake_case、kebab-case、前后缀、行号、查找替换、正则替换、排序、随机排序、差异对比、邮箱/URL/IP/数字日期提取、Base64、URL 编码、HTML 实体、Unicode、JSON 格式化/压缩/校验、基于本地 OpenCC 字符词典的简繁转换。

### 文件处理（17）

MD5、SHA-1、SHA-256、SHA-512、文件信息、CSV/JSON 互转、文本编码转换、TXT/CSV 分割、TXT/CSV/JSON 合并、多图转 PDF、重命名预览、ZIP 打包、批量 ZIP 下载。CSV 解析支持引号、逗号和字段内换行；合并时会检查表头与列数；转换、拆分和合并均可选择 UTF-8、GBK、Big5 或 Shift-JIS 源编码。

本地文件最多选择 50 个、总计 50 MB，避免浏览器内存失控。

### 图片与设计（30）

单张/批量压缩、PNG/JPG/WebP 转换、尺寸与百分比缩放、自由裁剪、1:1/4:3/16:9 裁剪、旋转、水平/垂直翻转、圆角、圆形头像、文字/图片/平铺水印、马赛克、模糊、黑色遮挡、转 PDF、EXIF 查看与删除、GPS 提醒、颜色提取与 HEX/RGB/HSL 转换、渐变、纯色图、Favicon、多尺寸图标 ZIP。JPEG 清除元数据时直接移除 EXIF/XMP 区块，不重新压缩像素。

### 随机生成器（22）

整数、小数、字符串、安全密码、UUID v4、抽签、分组、普通/带权转盘、日期、时间、颜色、调色板、硬币、D4/D6/D8/D10/D12/D20、自定义骰子、随机决定。随机和密码使用浏览器加密随机数。

### 临时工具（5）

- 临时文本：过期时间、访问次数、阅后即焚、密码、TXT 下载
- 临时文件：过期时间、下载次数、下载后销毁、密码和类型/大小验证
- 临时剪贴板：六位连接码、默认 10 分钟、可读取后销毁
- 临时二维码：文本、URL、可直接填写的 Wi-Fi、vCard 联系人和动态失效链接
- 临时留言房间：密码、最大消息数、自动过期、创建者清空、不公开列出

临时数据每 60 秒清理一次，也会在读取前清理。临时文件受 Pages 代理请求上限约束，当前最大 350 KB；允许 TXT、CSV、JSON、PDF、PNG、JPG、WebP、GIF 和 ZIP。服务端同时校验安全文件名、扩展名、MIME 和文件签名。

## 数据库与迁移

运行数据库默认位置：

```text
C:\Users\78252\Documents\Codex\2026-06-27\presentations-plugin-presentations-openai-primary-runtime\outputs\vocab-website\data\users.sqlite3
```

用户镜像：

```text
C:\Users\78252\Documents\Codex\2026-06-27\presentations-plugin-presentations-openai-primary-runtime\outputs\vocab-website\users.txt
```

密码使用 PBKDF2-SHA256、随机盐和 310,000 次迭代保存。`users.txt` 只写 `secret=protected`，不再写明文密码。老数据库中的明文密码会在启动时自动升级为哈希。

迁移文件：

- `local-backend/migrations/pre-001-schema.sql`：迁移前结构快照
- `local-backend/migrations/001_entitlements_up.sql`：新权益、充值、审计、工具与临时数据表
- `local-backend/migrations/001_entitlements_down.sql`：回滚新表
- `local-backend/migrations/002_single_language_orders_up.sql`：为支付订单保存英语/日语选择
- `local-backend/migrations/002_single_language_orders_down.sql`：无损重建支付表并回滚语言列

第一次对老数据库执行迁移前会使用 SQLite backup API 创建一次性备份：

```text
data\users.pre-entitlements-001.sqlite3
data\users.pre-single-language-002.sqlite3
```

迁移由 `schema_migrations` 控制并可安全重启，来源唯一索引防止重复会员记录。每个结构阶段只创建一次迁移前备份；备份可能仍含旧版明文密码，必须只保存在本机受保护目录，不能上传或提交。

新增表包括 `membership_plans`、`user_memberships`、`membership_entitlements`、`user_entitlement_overrides`、`payment_requests`、`admin_audit_logs`、`tool_favorites`、`tool_recent_usage`、`saved_tool_configs` 及五类临时数据表。原 `users`、`sessions` 和 `recharge_requests` 表保留。

回滚前必须停止服务并另外备份当前数据库。优先恢复 `users.pre-entitlements-001.sqlite3`；直接执行 down SQL 会删除改版后产生的会员、支付、工具和临时数据。

## 浏览器本地数据

旧错题、成就和登录数据结构保持兼容。主要键包括：

- `wyjAccountSession`：当前登录令牌
- `vocabProfile:v2:<accountId>`：使用者
- `wrongBook:v2:<accountId>:<scope>:<profile>`：当前/历史错题
- `achievements:v2:<accountId>:<profile>`：成就
- `studyHistory:v1:<accountId>:<profile>`：学习记录
- `studyGoal:v1:<accountId>:<profile>:<language>`：每日目标
- `vocabRuntime:v1:<accountId>:<language>`：未完成测试，仅当前浏览器会话
- `gradingMode:<language>`、`practiceMode:<language>`、`aiSuggestSettings:<language>`：语言独立设置

登录、退出和注册时会清理待测试词表，避免显示上一账户的单词；错题、成就、统计和设置不会因此被删除。

## 安全措施

- 密码和分享密码均不明文保存
- 会话令牌使用加密安全随机数，服务端每次解析时检查封禁、删除、过期和会话版本
- 登录、注册、临时创建和临时读取均有限流
- POST 校验同源 `Origin`；无 CORS 放行；前端会话通过自定义请求头发送
- SQL 全部使用参数绑定
- 分享 ID 使用不可预测随机数，六位连接码只保存 HMAC 摘要
- 用户文本通过 `textContent` 展示；动态 HTML 对用户输入做转义
- 上传文件限制大小、文件名、扩展名、MIME 和内容签名
- 静态目录与运行数据分离，路径解析后再次校验根目录
- 错误响应不返回调用栈或本机路径
- CSP、`nosniff`、禁止 iframe、严格 Referrer 和 Permissions Policy
- Ollama `11434` 不对公网开放，公网只通过 Tunnel 访问账户后端 `8765`

## 环境变量

Pages Functions：

| 变量 | 说明 |
| --- | --- |
| `LOCAL_API_BASE` | 必填，当前为 `https://api.thewyj.uk` |
| `LOCAL_API_FALLBACK` | 可选的第二后端地址 |

本地后端支持：

- `VOCAB_ADMIN_SECRET`：仅全新数据库创建固定管理员时使用，不覆盖现有密码
- `VOCAB_SHARE_HMAC_KEY`：六位临时剪贴板连接码的 HMAC 密钥；启动器会持久生成
- `VOCAB_USERS_DB`、`VOCAB_USERS_TXT`、`VOCAB_STATIC_DIR`
- `VOCAB_HOST`、`VOCAB_PORT`
- `VOCAB_MAX_JSON_BYTES`、`VOCAB_MAX_REJECT_DRAIN_BYTES`
- `VOCAB_AI_MAX_CONCURRENCY`、`VOCAB_AI_QUEUE_TIMEOUT_SEC`
- `OLLAMA_HOST`、`OLLAMA_MODEL`、`OLLAMA_TIMEOUT_SEC`

不要提交 `.env`、`data/`、SQLite、`users.txt`、日志或 Tunnel 凭据。

## 手动启动

本项目不配置开机自启动。电脑重启后手动双击：

```text
C:\Users\78252\Desktop\编程\背单词网站\启动WYJ网站.cmd
```

启动器会同步最新 Python 后端和迁移文件，启动或检查 Ollama、本地后端、Cloudflare Tunnel，验证 `api.thewyj.uk` 与 Pages 代理，然后打开正式网站。它会删除历史遗留的开机启动快捷方式，但不会创建新的自启动项。手动启动后会运行隐藏的断线守护进程，电脑关机后自然停止。

源码中对应文件：

- `desktop-tools/启动WYJ网站.cmd`
- `desktop-tools/start-wyj.ps1`
- `desktop-tools/watch-wyj.ps1`
- `local-backend/run.ps1`

也可以只启动本地后端：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\local-backend\run.ps1
```

## 测试

后端、HTTP 集成和静态结构测试：

```powershell
cd local-backend
python -m py_compile account_store.py membership.py temporary_store.py server.py test_accounts.py test_api.py test_static.py
python -m unittest discover -p "test_*.py" -v
```

JavaScript 语法检查：

```powershell
node --check app.js
node --check tools.js
node --check sw.js
node --check "functions/api/[[path]].js"
node local-backend/test_tools_js.mjs
```

当前 Python 自动化套件共 64 项，另有 16 项 JavaScript 工具自检，覆盖注册登录、会话、封禁、老会员迁移、8 CNY 单语言订单、新权益合并、过期降级、充值审批、审计日志、工具权限、收藏/历史/配置、模糊搜索目录、临时生命周期、文件签名、跨站拒绝、限流、AI 选词、日语读音、PDF 相关旧 API、并发状态请求、HTML ID、PWA 缓存、CSV 引号换行、MD5、颜色转换、JPEG 元数据清理、OpenCC 词典完整性和 103 项工具简介。

## Cloudflare Pages 配置

| 设置 | 值 |
| --- | --- |
| Framework preset | `None` / `Static HTML` |
| Production branch | `main` |
| Build command | 留空；控制台强制要求时填 `exit 0` |
| Build output directory | `.` |

部署步骤：

1. 推送 `main` 到 `WYJ0904/japanese`。
2. Cloudflare Pages 连接该仓库和 `main`。
3. 设置 `LOCAL_API_BASE=https://api.thewyj.uk`。
4. 部署后检查 `/api/status`、登录、`/select`、无权限 `/tools` 拦截和管理员审批。
5. 在提供本地后端的电脑上手动运行启动器，并保持电脑、网络和 Tunnel 在线。

Pages 发布静态根目录，不生成 `dist`。`_redirects` 把 SPA 路由回退到 `index.html`。Service Worker 缓存版本会随本次发布更新，避免持续读取旧 JS/CSS。

## 当前限制

- 网站账户、AI、会员和临时分享依赖这台电脑在线；电脑关机、休眠、断网或 Tunnel 离线时，世界其他地区也无法使用这些服务。
- 临时文件目前为 350 KB 上限，原因是 Pages Function 代理和 JSON/Base64 开销；普通本地文件工具仍支持总计 50 MB。
- 纯浏览器图片处理能力受设备内存和浏览器 Canvas 支持影响；超大图片应分批处理。
- 简繁转换使用 OpenCC 官方字符词典并在浏览器本地执行；它是字符级转换，不包含地区词汇与上下文短语消歧。
- 工具处理内容默认不上传，服务器因此无法恢复用户未主动保存的本地处理结果。

第三方二维码实现与许可证见 `THIRD_PARTY_NOTICES.md`。

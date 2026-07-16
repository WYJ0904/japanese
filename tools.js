(() => {
  "use strict";

  const CATEGORY_DEFINITIONS = [
    { id: "text", name: "文本处理工具箱", mark: "Aa", description: "清理、转换、提取、编码与 JSON 处理" },
    { id: "file", name: "文件处理中心", mark: "F", description: "哈希、转换、拆分、合并、PDF 与 ZIP" },
    { id: "image", name: "图片与设计工具", mark: "◫", description: "压缩、格式、尺寸、裁剪、水印与配色" },
    { id: "random", name: "随机生成器中心", mark: "#", description: "安全密码、抽签、分组、颜色、日期与骰子" },
    { id: "temporary", name: "临时工具", mark: "T", description: "临时文本、文件、剪贴板、二维码与留言房间" },
  ];

  const toolRows = {
    text: [
      ["text-stats", "文本统计", "统计字符、单词、行数、段落和预计阅读时间。", "字数 计数 阅读时长"],
      ["dedupe-lines", "删除重复行", "按首次出现顺序移除完全相同的行。", "去重 唯一行"],
      ["remove-empty-lines", "删除空行", "清除空白行并保留有内容的行。", "空白行 清理"],
      ["collapse-spaces", "合并多余空格", "把连续空格和制表符整理为单个空格。", "空白 压缩"],
      ["letter-case", "大小写转换", "在全大写、全小写和标题格式之间切换。", "英文 字母"],
      ["camel-case", "camelCase 转换", "把词组转换为首词小写的驼峰命名。", "驼峰 变量名"],
      ["pascal-case", "PascalCase 转换", "把词组转换为每个单词首字母大写的命名。", "大驼峰 类名"],
      ["snake-case", "snake_case 转换", "把词组转换为下划线连接的命名。", "下划线 变量名"],
      ["kebab-case", "kebab-case 转换", "把词组转换为短横线连接的命名。", "短横线 css"],
      ["line-prefix", "批量添加前缀", "在每一行开头批量加入指定内容。", "行首"],
      ["line-suffix", "批量添加后缀", "在每一行末尾批量加入指定内容。", "行尾"],
      ["line-numbers", "批量添加行号", "为每一行自动添加连续编号。", "编号 序号"],
      ["find-replace", "查找和替换", "查找普通文本并批量替换为新内容。", "替换文字"],
      ["regex-replace", "正则表达式替换", "使用正则表达式完成高级批量替换。", "regexp pattern"],
      ["sort-lines", "文本排序", "按字母、数字或倒序重新排列文本行。", "排序 行"],
      ["shuffle-lines", "文本随机排序", "随机打乱所有文本行的顺序。", "洗牌 打乱"],
      ["text-diff", "文本差异对比", "逐行标出两段文本新增、删除和相同内容。", "比较 diff"],
      ["extract-email", "提取邮箱", "从混合文本中识别并列出电子邮箱地址。", "邮件 email"],
      ["extract-url", "提取 URL", "从文本中识别并列出 HTTP 或 HTTPS 链接。", "网址 链接"],
      ["extract-ip", "提取 IP 地址", "从文本中提取格式有效的 IPv4 地址。", "ipv4 网络地址"],
      ["extract-number-date", "提取数字和日期", "提取文本中的数字及常见日期格式。", "数值 时间"],
      ["base64", "Base64 编码与解码", "在普通文本与 Base64 内容之间双向转换。", "编码 解码"],
      ["url-code", "URL 编码与解码", "编码或还原网址参数中的特殊字符。", "uri 百分号"],
      ["html-entities", "HTML 实体编码与解码", "转义或还原 HTML 中的特殊字符实体。", "网页 转义"],
      ["unicode-code", "Unicode 转换", "在可读文字与 Unicode 转义序列之间转换。", "字符 转义"],
      ["json-format", "JSON 格式化", "校验并缩进 JSON，便于阅读和排查。", "美化 pretty"],
      ["json-minify", "JSON 压缩", "移除 JSON 中不必要的空白和换行。", "紧凑 minify"],
      ["json-validate", "JSON 合法性检查", "检查 JSON 语法并定位无法解析的内容。", "校验 validate"],
      ["chinese-convert", "简繁体转换", "使用本地 OpenCC 字符词典双向转换简体与繁体。", "简体 繁体 中文"],
    ],
    file: [
      ["file-md5", "MD5 计算", "在本地计算文件的 MD5 校验值。", "哈希 hash 校验"],
      ["file-sha1", "SHA-1 计算", "在本地计算文件的 SHA-1 校验值。", "哈希 hash 校验"],
      ["file-sha256", "SHA-256 计算", "在本地计算文件的 SHA-256 校验值。", "哈希 hash 校验"],
      ["file-sha512", "SHA-512 计算", "在本地计算文件的 SHA-512 校验值。", "哈希 hash 校验"],
      ["file-info", "文件基本信息", "查看文件名、类型、大小和最后修改时间。", "属性 元数据"],
      ["csv-json", "CSV 转 JSON", "把 CSV 表格解析为结构化 JSON 数组。", "表格 数据转换"],
      ["json-csv", "JSON 转 CSV", "把对象数组转换为可下载的 CSV 表格。", "表格 数据转换"],
      ["text-encoding", "文本编码转换", "读取常见文本编码并输出 UTF-8 文件。", "utf8 字符集"],
      ["text-split", "文本文件分割", "按指定行数拆分大型文本文件。", "切分 txt"],
      ["csv-split", "CSV 文件分割", "保留表头并按数据行数拆分 CSV。", "切分 表格"],
      ["txt-merge", "TXT 文件合并", "按选择顺序合并多个 TXT 文件。", "拼接 文本"],
      ["csv-merge", "CSV 文件合并", "合并表头一致的多个 CSV 文件。", "拼接 表格"],
      ["json-array-merge", "JSON 数组合并", "把多个 JSON 数组合并为一个数组文件。", "拼接 数据"],
      ["images-pdf", "多张图片转 PDF", "按选择顺序把多张图片生成多页 PDF。", "照片 文档"],
      ["rename-preview", "批量重命名预览", "生成批量新文件名清单，不修改原文件。", "改名 文件名"],
      ["files-zip", "文件打包为 ZIP", "把选中的文件在本地打包成一个 ZIP。", "压缩包 打包"],
      ["batch-zip", "批量 ZIP 下载", "把多个文件整理打包后一次下载。", "压缩包 批量"],
    ],
    image: [
      ["image-compress", "图片压缩", "调整格式和质量以减小单张图片体积。", "压图 质量"],
      ["image-batch-compress", "批量图片压缩", "一次压缩多张图片并打包下载。", "压图 多图"],
      ["image-format", "PNG、JPG、WebP 转换", "在 PNG、JPG 和 WebP 格式之间转换。", "格式 转图"],
      ["image-resize", "图片尺寸调整", "按指定像素宽高重新生成图片。", "改尺寸 像素"],
      ["image-scale", "按百分比缩放", "按百分比等比例放大或缩小图片。", "比例 缩图"],
      ["image-crop", "图片裁剪", "按百分比坐标裁出指定矩形区域。", "剪裁 截取"],
      ["crop-square", "1:1 裁剪", "从图片中央裁出正方形区域。", "方形 头像"],
      ["crop-four-three", "4:3 裁剪", "从图片中央裁出 4:3 比例画面。", "四比三"],
      ["crop-sixteen-nine", "16:9 裁剪", "从图片中央裁出 16:9 宽屏画面。", "宽屏 十六比九"],
      ["image-rotate", "图片旋转", "把图片旋转 90、180 或 270 度。", "方向 转向"],
      ["image-flip", "图片翻转", "按水平、垂直或双向镜像翻转图片。", "镜像"],
      ["image-rounded", "图片圆角", "为图片四角添加可调透明圆角。", "圆角 半径"],
      ["image-avatar", "圆形头像", "把图片中央区域裁成透明圆形头像。", "头像 圆图"],
      ["text-watermark", "文本水印", "在图片右下角添加半透明文字水印。", "署名 版权"],
      ["image-watermark", "图片水印", "在主图右下角叠加另一张图片。", "logo 叠图"],
      ["tile-watermark", "平铺水印", "在整张图片上重复铺设文字水印。", "满屏 防盗图"],
      ["image-mosaic", "马赛克", "为指定矩形区域添加像素化马赛克。", "打码 隐私"],
      ["image-blur", "高斯模糊", "为整张图片添加可调强度模糊。", "虚化 blur"],
      ["image-redact", "黑色遮挡", "用纯黑矩形永久遮挡指定区域。", "涂黑 隐私"],
      ["image-pdf", "图片转 PDF", "把选中的图片按顺序生成 PDF 文档。", "照片 文档"],
      ["exif-view", "EXIF 信息查看", "本地查看 JPEG 的相机、时间、方向和 GPS 标签。", "元数据 相机"],
      ["exif-remove", "EXIF 信息删除", "清除图片元数据；JPEG 不重新压缩像素。", "隐私 清除"],
      ["gps-warning", "GPS 隐私提醒", "检测 JPEG 中可能泄露位置的 GPS 标签。", "定位 经纬度"],
      ["color-extract", "图片颜色提取", "从图片中提取最多八种主要颜色。", "配色 主色"],
      ["color-convert", "HEX、RGB 和 HSL 取色", "输入任一 HEX、RGB 或 HSL 颜色并互相转换。", "颜色代码"],
      ["gradient-generator", "渐变背景生成器", "生成指定尺寸、颜色和角度的渐变图片。", "背景 渐变图"],
      ["gradient-css", "CSS 渐变代码生成", "预览渐变并生成可复制的 CSS 代码。", "linear-gradient 样式"],
      ["solid-image", "纯色图片生成器", "生成指定尺寸和颜色的纯色 PNG。", "背景 色块"],
      ["favicon-generator", "Favicon 生成器", "把图片缩放为适合网页图标的 32×32 PNG。", "网站图标 ico"],
      ["multi-icon-zip", "多尺寸图标 ZIP 下载", "生成 16 到 512 像素的七种 PNG 图标。", "应用图标 icon"],
    ],
    random: [
      ["random-integer", "随机数字", "在指定最小值和最大值之间生成整数。", "整数 数字"],
      ["random-decimal", "随机小数", "在指定范围内生成随机小数。", "浮点 数字"],
      ["random-string", "随机字符串", "按指定长度和字符集生成随机文本。", "字符 token"],
      ["random-password", "安全密码生成器", "用安全随机数和可选字符类型生成高强度密码。", "口令 密钥"],
      ["random-uuid", "UUID v4 生成器", "生成符合 UUID v4 格式的随机标识符。", "guid 标识"],
      ["random-draw", "随机抽签", "从候选名单中公平抽取一个结果。", "抽奖 点名"],
      ["random-groups", "随机分组", "把名单打乱后平均分配到多个小组。", "分队 分班"],
      ["random-wheel", "随机转盘", "从多个选项中模拟转盘选出结果。", "轮盘 选择"],
      ["weighted-wheel", "带权重转盘", "按照每个选项的权重概率抽取结果。", "概率 加权"],
      ["random-date", "随机日期", "在指定起止日期之间随机选择一天。", "日历 日期"],
      ["random-time", "随机时间", "随机生成一天中的小时、分钟和秒。", "时钟"],
      ["random-color", "随机颜色", "生成一个随机 HEX 颜色值。", "取色 色值"],
      ["random-palette", "随机调色板", "一次生成多种随机颜色组成的配色表。", "色板 配色"],
      ["coin-flip", "抛硬币", "随机返回正面或反面。", "硬币 二选一"],
      ["dice-d4", "D4 骰子", "投掷一枚四面骰子。", "桌游 骰子"],
      ["dice-d6", "D6 骰子", "投掷一枚六面骰子。", "桌游 骰子"],
      ["dice-d8", "D8 骰子", "投掷一枚八面骰子。", "桌游 骰子"],
      ["dice-d10", "D10 骰子", "投掷一枚十面骰子。", "桌游 骰子"],
      ["dice-d12", "D12 骰子", "投掷一枚十二面骰子。", "桌游 骰子"],
      ["dice-d20", "D20 骰子", "投掷一枚二十面骰子。", "桌游 骰子"],
      ["custom-dice", "自定义骰子", "设置面数后投掷自定义骰子。", "随机数 面数"],
      ["random-decision", "随机决定器", "在多个方案之间随机帮你做决定。", "选择 困难"],
    ],
    temporary: [
      ["temporary-text", "临时文本分享", "创建带密码、过期和访问次数限制的文本链接。", "阅后即焚 分享"],
      ["temporary-file", "临时文件分享", "创建有期限和下载次数限制的文件链接。", "传文件 下载"],
      ["temporary-clipboard", "临时剪贴板", "用六位连接码在设备间临时传递文本。", "跨设备 复制"],
      ["temporary-qr", "临时二维码", "生成文本、网址、Wi-Fi、联系人或动态失效二维码。", "扫码 qr"],
      ["temporary-room", "临时留言房间", "创建无公开列表、可加密码的限时留言房间。", "聊天室 留言"],
    ],
  };

  const TOOLS = Object.entries(toolRows).flatMap(([category, rows]) => rows.map(([id, name, description, aliases = ""]) => ({
    id, name, description, aliases, category,
  })));
  const TOOL_MAP = new Map(TOOLS.map((tool) => [tool.id, tool]));
  const CATEGORY_MAP = new Map(CATEGORY_DEFINITIONS.map((category) => [category.id, category]));

  function normalizeSearch(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function boundedEditDistance(left, right, limit = 2) {
    if (Math.abs(left.length - right.length) > limit) return limit + 1;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
      const current = [leftIndex + 1];
      let rowMinimum = current[0];
      for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
        const cost = left[leftIndex] === right[rightIndex] ? 0 : 1;
        current.push(Math.min(
          current[rightIndex] + 1,
          previous[rightIndex + 1] + 1,
          previous[rightIndex] + cost,
        ));
        rowMinimum = Math.min(rowMinimum, current[rightIndex + 1]);
      }
      if (rowMinimum > limit) return limit + 1;
      previous = current;
    }
    return previous[right.length];
  }

  function isSubsequence(needle, haystack) {
    if (!needle) return true;
    let index = 0;
    for (const character of haystack) {
      if (character === needle[index]) index += 1;
      if (index === needle.length) return true;
    }
    return false;
  }

  function isAdjacentTransposition(left, right) {
    if (left.length !== right.length) return false;
    const differences = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) differences.push(index);
    }
    return differences.length === 2
      && differences[1] === differences[0] + 1
      && left[differences[0]] === right[differences[1]]
      && left[differences[1]] === right[differences[0]];
  }

  TOOLS.forEach((tool) => {
    const category = CATEGORY_MAP.get(tool.category);
    tool.searchTerms = [tool.name, tool.description, tool.aliases, tool.id, category?.name || ""]
      .map(normalizeSearch)
      .filter(Boolean);
    tool.searchText = tool.searchTerms.join(" ");
  });

  function fuzzyToolScore(tool, query) {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return 1;
    const queryTokens = normalizedQuery.split(" ").filter(Boolean);
    let total = tool.searchText.includes(normalizedQuery) ? 100 : 0;
    for (const token of queryTokens) {
      const compactToken = token.replace(/\s/g, "");
      let tokenScore = 0;
      for (const term of tool.searchTerms) {
        const compactTerm = term.replace(/\s/g, "");
        if (term === token) tokenScore = Math.max(tokenScore, 90);
        else if (term.startsWith(token)) tokenScore = Math.max(tokenScore, 72);
        else if (term.includes(token) || compactTerm.includes(compactToken)) tokenScore = Math.max(tokenScore, 60);
        for (const word of term.split(" ")) {
          if (compactToken.length >= 2 && word.length <= compactToken.length + 3 && isSubsequence(compactToken, word)) {
            tokenScore = Math.max(tokenScore, 38);
          }
          if (isAdjacentTransposition(compactToken, word)) tokenScore = Math.max(tokenScore, 64);
          const limit = token.length >= 6 ? 2 : 1;
          if (token.length >= 3 && boundedEditDistance(token, word, limit) <= limit) tokenScore = Math.max(tokenScore, 54);
        }
      }
      if (!tokenScore) return 0;
      total += tokenScore;
    }
    const primaryTerms = [tool.name, tool.id, tool.aliases]
      .map(normalizeSearch)
      .flatMap((term) => term.split(" "))
      .filter(Boolean);
    for (const token of queryTokens) {
      if (primaryTerms.some((term) => term.includes(token))) total += 55;
      else if (primaryTerms.some((term) => isAdjacentTransposition(token, term))) total += 72;
      else {
        const limit = token.length >= 6 ? 2 : 1;
        if (token.length >= 3 && primaryTerms.some((term) => boundedEditDistance(token, term, limit) <= limit)) {
          total += 45;
        }
      }
    }
    if (normalizeSearch(tool.name).includes(normalizedQuery)) total += 35;
    return total;
  }

  function searchTools(query = "", category = "all") {
    const candidates = TOOLS.filter((tool) => category === "all" || tool.category === category);
    if (!normalizeSearch(query)) return candidates;
    return candidates
      .map((tool) => ({ tool, score: fuzzyToolScore(tool, query) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.tool.name.localeCompare(right.tool.name, "zh-CN"))
      .map((item) => item.tool);
  }

  let bridge = null;
  let preferences = { favorites: [], recent: [], configs: [] };
  let currentCategory = "all";
  let currentTool = null;
  let currentDownload = null;

  const byId = (id) => document.getElementById(id);
  const categoryFor = (tool) => CATEGORY_MAP.get(tool.category);
  const favoriteFor = (toolId) => preferences.favorites.find((item) => item.tool_id === toolId);
  const configsFor = (toolId) => preferences.configs.filter((item) => item.tool_id === toolId);

  function setMessage(message, error = false) {
    const target = byId("toolWorkbenchMessage");
    if (!target) return;
    target.textContent = message || "";
    target.classList.toggle("success", Boolean(message) && !error);
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 ** 2).toFixed(1)} MB`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    }[char]));
  }

  function downloadBlob(name, blob) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function downloadText(name, text, type = "text/plain;charset=utf-8") {
    downloadBlob(name, new Blob([text], { type }));
  }

  async function copyText(value, button) {
    const copied = await bridge.copyText(String(value));
    const original = button.textContent;
    button.textContent = copied ? "已复制" : "复制失败";
    window.setTimeout(() => { if (button.isConnected) button.textContent = original; }, 1200);
  }

  function renderCategories() {
    const target = byId("toolCategoryList");
    if (!target) return;
    target.innerHTML = CATEGORY_DEFINITIONS.map((category) => {
      const count = TOOLS.filter((tool) => tool.category === category.id).length;
      return `<button class="tool-category-card${currentCategory === category.id ? " active" : ""}" type="button" data-tool-category="${category.id}">
        <span class="tool-category-mark" aria-hidden="true">${category.mark}</span>
        <span><strong>${category.name}</strong><small>${category.description}</small><em>${count} 个工具</em></span>
      </button>`;
    }).join("");
    target.querySelectorAll("[data-tool-category]").forEach((button) => button.addEventListener("click", () => {
      currentCategory = currentCategory === button.dataset.toolCategory ? "all" : button.dataset.toolCategory;
      renderCategories();
      renderCatalog();
    }));
  }

  function visibleTools() {
    const query = byId("toolSearchInput")?.value || "";
    return searchTools(query, currentCategory);
  }

  function toolCard(tool) {
    const favorite = favoriteFor(tool.id);
    const category = categoryFor(tool);
    return `<article class="tool-card" data-tool-card="${tool.id}">
      <button class="tool-open" type="button" data-open-tool="${tool.id}"><span>${category.mark}</span><strong>${tool.name}</strong><small>${tool.description}</small><em>${category.name}</em></button>
      <button class="tool-card-favorite${favorite ? " active" : ""}" type="button" data-toggle-favorite="${tool.id}" aria-label="${favorite ? "取消收藏" : "收藏"}">${favorite ? "★" : "☆"}</button>
    </article>`;
  }

  function bindToolButtons(root = document) {
    root.querySelectorAll("[data-open-tool]").forEach((button) => button.addEventListener("click", () => openTool(button.dataset.openTool)));
    root.querySelectorAll("[data-toggle-favorite]").forEach((button) => button.addEventListener("click", () => toggleFavorite(button.dataset.toggleFavorite)));
  }

  function renderCatalog() {
    const tools = visibleTools();
    const target = byId("toolCatalog");
    if (!target) return;
    byId("toolCatalogTitle").textContent = currentCategory === "all" ? "全部工具" : CATEGORY_MAP.get(currentCategory).name;
    byId("toolResultCount").textContent = `${tools.length} 项`;
    target.innerHTML = tools.map(toolCard).join("") || '<p class="tool-empty">没有匹配的工具</p>';
    bindToolButtons(target);
  }

  function renderShelves() {
    const favoriteTools = preferences.favorites.map((item) => TOOL_MAP.get(item.tool_id)).filter(Boolean);
    const recentTools = preferences.recent.map((item) => TOOL_MAP.get(item.tool_id)).filter(Boolean);
    const favoriteSection = byId("favoriteToolsSection");
    const recentSection = byId("recentToolsSection");
    favoriteSection?.classList.toggle("hidden", !favoriteTools.length);
    recentSection?.classList.toggle("hidden", !recentTools.length);
    if (byId("favoriteToolsList")) {
      byId("favoriteToolsList").innerHTML = favoriteTools.map((tool) => `<button type="button" data-open-tool="${tool.id}">${favoriteFor(tool.id)?.pinned ? "● " : ""}${tool.name}</button>`).join("");
      bindToolButtons(byId("favoriteToolsList"));
    }
    if (byId("recentToolsList")) {
      byId("recentToolsList").innerHTML = recentTools.map((tool) => `<button type="button" data-open-tool="${tool.id}">${tool.name}</button>`).join("");
      bindToolButtons(byId("recentToolsList"));
    }
  }

  async function loadPreferences() {
    try {
      const data = await bridge.apiGet("/api/tools/preferences");
      preferences = { favorites: data.favorites || [], recent: data.recent || [], configs: data.configs || [] };
    } catch (error) {
      if (error.code === "membership_required") throw error;
      preferences = { favorites: [], recent: [], configs: [] };
    }
    renderShelves();
    renderCatalog();
  }

  async function toggleFavorite(toolId, forcePinned = null) {
    const existing = favoriteFor(toolId);
    const favorite = forcePinned !== null ? true : !existing;
    const pinned = forcePinned !== null ? forcePinned : Boolean(existing?.pinned);
    try {
      await bridge.api("/api/tools/favorite", { tool_id: toolId, favorite, pinned });
      await loadPreferences();
      updateWorkbenchActions();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function updateWorkbenchActions() {
    if (!currentTool) return;
    const favorite = favoriteFor(currentTool.id);
    byId("favoriteToolBtn").textContent = favorite ? "取消收藏" : "收藏";
    byId("pinToolBtn").textContent = favorite?.pinned ? "取消固定" : "固定";
  }

  function renderConfigControls(toolId) {
    const configs = configsFor(toolId);
    return `<section class="tool-config-box">
      <div><input id="toolConfigName" maxlength="80" placeholder="配置名称" /><button id="saveToolConfigBtn" type="button">保存当前参数</button></div>
      <div class="saved-config-list" id="savedToolConfigList">${configs.map((item) => `<span><button type="button" data-load-config="${item.id}">${escapeHtml(item.name)}</button><button type="button" data-delete-config="${item.id}" aria-label="删除配置">×</button></span>`).join("") || "<small>暂无已保存配置</small>"}</div>
    </section>`;
  }

  function collectConfig() {
    const config = {};
    byId("toolWorkbenchBody").querySelectorAll("[data-config]").forEach((field) => {
      config[field.dataset.config] = field.type === "checkbox" ? field.checked : field.value;
    });
    return config;
  }

  function applyConfig(config) {
    Object.entries(config || {}).forEach(([key, value]) => {
      const escapedKey = window.CSS?.escape
        ? window.CSS.escape(key)
        : String(key).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char.codePointAt(0).toString(16)} `);
      const field = byId("toolWorkbenchBody").querySelector(`[data-config="${escapedKey}"]`);
      if (!field) return;
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = value;
      if (["qrKind", "qrDynamic"].includes(field.id)) field.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function bindConfigControls() {
    byId("saveToolConfigBtn")?.addEventListener("click", async () => {
      const name = byId("toolConfigName").value.trim();
      if (!name) return setMessage("请输入配置名称", true);
      try {
        await bridge.api("/api/tools/config/save", { tool_id: currentTool.id, name, config: collectConfig() });
        await loadPreferences();
        renderCurrentTool();
        setMessage("配置已保存");
      } catch (error) { setMessage(error.message, true); }
    });
    byId("savedToolConfigList")?.querySelectorAll("[data-load-config]").forEach((button) => button.addEventListener("click", () => {
      const item = preferences.configs.find((config) => config.id === button.dataset.loadConfig);
      applyConfig(item?.config || {});
      setMessage("配置已载入");
    }));
    byId("savedToolConfigList")?.querySelectorAll("[data-delete-config]").forEach((button) => button.addEventListener("click", async () => {
      try {
        await bridge.api("/api/tools/config/delete", { id: button.dataset.deleteConfig });
        await loadPreferences();
        renderCurrentTool();
        setMessage("配置已删除");
      } catch (error) {
        setMessage(error.message, true);
      }
    }));
  }

  function textWords(text) {
    return String(text || "").normalize("NFKC").trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }

  function caseWords(text) {
    return String(text || "").normalize("NFKC").replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((word) => word.toLocaleLowerCase());
  }

  function utf8ToBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
  }

  function base64ToUtf8(value) {
    const binary = atob(String(value).replace(/\s+/g, ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  const TRADITIONAL_PAIRS = [
    ["后", "後"], ["发", "發"], ["里", "裡"], ["云", "雲"], ["台", "臺"], ["万", "萬"], ["与", "與"], ["专", "專"], ["业", "業"], ["东", "東"],
    ["丝", "絲"], ["两", "兩"], ["严", "嚴"], ["丧", "喪"], ["个", "個"], ["丰", "豐"], ["临", "臨"], ["为", "為"], ["丽", "麗"], ["举", "舉"],
    ["义", "義"], ["乌", "烏"], ["乐", "樂"], ["乔", "喬"], ["习", "習"], ["乡", "鄉"], ["书", "書"], ["买", "買"], ["乱", "亂"], ["争", "爭"],
    ["于", "於"], ["亏", "虧"], ["亚", "亞"], ["产", "產"], ["亩", "畝"], ["亲", "親"], ["亿", "億"], ["仅", "僅"], ["从", "從"], ["仓", "倉"],
    ["仪", "儀"], ["们", "們"], ["优", "優"], ["会", "會"], ["伞", "傘"], ["伟", "偉"], ["传", "傳"], ["伤", "傷"], ["伦", "倫"], ["体", "體"],
    ["余", "餘"], ["佣", "傭"], ["侠", "俠"], ["侣", "侶"], ["侥", "僥"], ["侧", "側"], ["侦", "偵"], ["俭", "儉"], ["债", "債"], ["倾", "傾"],
    ["偿", "償"], ["储", "儲"], ["儿", "兒"], ["兑", "兌"], ["党", "黨"], ["兰", "蘭"], ["关", "關"], ["兴", "興"], ["养", "養"], ["兽", "獸"],
    ["内", "內"], ["冈", "岡"], ["册", "冊"], ["写", "寫"], ["军", "軍"], ["农", "農"], ["冲", "衝"], ["决", "決"], ["况", "況"], ["冻", "凍"],
    ["净", "淨"], ["凉", "涼"], ["减", "減"], ["凑", "湊"], ["凤", "鳳"], ["凭", "憑"], ["凯", "凱"], ["击", "擊"], ["划", "劃"], ["刘", "劉"],
    ["则", "則"], ["刚", "剛"], ["创", "創"], ["删", "刪"], ["别", "別"], ["刹", "剎"], ["制", "製"], ["剂", "劑"], ["剑", "劍"], ["剧", "劇"],
    ["办", "辦"], ["务", "務"], ["动", "動"], ["励", "勵"], ["劲", "勁"], ["劳", "勞"], ["势", "勢"], ["勋", "勳"], ["匀", "勻"], ["区", "區"],
    ["医", "醫"], ["华", "華"], ["协", "協"], ["单", "單"], ["卖", "賣"], ["卢", "盧"], ["卫", "衛"], ["却", "卻"], ["厅", "廳"], ["历", "歷"],
    ["压", "壓"], ["县", "縣"], ["参", "參"], ["双", "雙"], ["变", "變"], ["叙", "敘"], ["叶", "葉"], ["号", "號"], ["叹", "嘆"], ["听", "聽"],
    ["启", "啟"], ["吴", "吳"], ["员", "員"], ["呛", "嗆"], ["呜", "嗚"], ["咏", "詠"], ["咙", "嚨"], ["咸", "鹹"], ["响", "響"], ["哑", "啞"],
    ["哗", "嘩"], ["唇", "脣"], ["唤", "喚"], ["啸", "嘯"], ["喷", "噴"], ["嘱", "囑"], ["团", "團"], ["园", "園"], ["围", "圍"], ["国", "國"],
    ["图", "圖"], ["圆", "圓"], ["圣", "聖"], ["场", "場"], ["坏", "壞"], ["块", "塊"], ["坚", "堅"], ["坛", "壇"], ["坝", "壩"], ["坞", "塢"],
    ["垄", "壟"], ["垒", "壘"], ["垫", "墊"], ["埙", "塤"], ["堕", "墮"], ["墙", "牆"], ["壮", "壯"], ["声", "聲"], ["壳", "殼"], ["处", "處"],
    ["备", "備"], ["复", "復"], ["够", "夠"], ["头", "頭"], ["夹", "夾"], ["夺", "奪"], ["奋", "奮"], ["奖", "獎"], ["妇", "婦"], ["妈", "媽"],
    ["妆", "妝"], ["姗", "姍"], ["娱", "娛"], ["婴", "嬰"], ["孙", "孫"], ["学", "學"], ["宁", "寧"], ["宝", "寶"], ["实", "實"], ["宠", "寵"],
    ["审", "審"], ["宫", "宮"], ["宽", "寬"], ["宾", "賓"], ["对", "對"], ["寻", "尋"], ["导", "導"], ["寿", "壽"], ["将", "將"], ["尔", "爾"],
    ["尘", "塵"], ["尝", "嘗"], ["层", "層"], ["属", "屬"], ["岁", "歲"], ["岂", "豈"], ["岛", "島"], ["岭", "嶺"], ["岳", "嶽"], ["峡", "峽"],
    ["币", "幣"], ["帅", "帥"], ["师", "師"], ["帐", "帳"], ["帘", "簾"], ["带", "帶"], ["帮", "幫"], ["干", "幹"], ["并", "並"], ["广", "廣"],
    ["庆", "慶"], ["庐", "廬"], ["库", "庫"], ["应", "應"], ["庙", "廟"], ["废", "廢"], ["开", "開"], ["异", "異"], ["弃", "棄"], ["张", "張"],
    ["弥", "彌"], ["弯", "彎"], ["弹", "彈"], ["强", "強"], ["归", "歸"], ["录", "錄"], ["当", "當"], ["彻", "徹"], ["径", "徑"], ["忆", "憶"],
  ];

  let openCcMaps = null;
  let openCcMapsPromise = null;

  function fallbackChineseMaps() {
    return {
      traditional: new Map(TRADITIONAL_PAIRS),
      simple: new Map(TRADITIONAL_PAIRS.map(([simple, traditional]) => [traditional, simple])),
      source: "fallback",
    };
  }

  function parseOpenCcCharacterDictionary(text) {
    const map = new Map();
    String(text || "").split(/\r?\n/).forEach((line) => {
      const value = line.trim();
      if (!value || value.startsWith("#")) return;
      const [source, rawTargets] = value.split("\t", 2);
      const target = String(rawTargets || "").trim().split(/\s+/)[0];
      if (source && target) map.set(source, target);
    });
    return map;
  }

  function loadOpenCcMaps() {
    if (openCcMaps) return Promise.resolve(openCcMaps);
    if (!openCcMapsPromise) {
      openCcMapsPromise = Promise.all([
        fetch("/vendor/opencc-st-characters.txt").then((response) => response.ok ? response.text() : Promise.reject(new Error(`ST ${response.status}`))),
        fetch("/vendor/opencc-ts-characters.txt").then((response) => response.ok ? response.text() : Promise.reject(new Error(`TS ${response.status}`))),
      ]).then(([simplifiedToTraditional, traditionalToSimplified]) => {
        const maps = {
          traditional: parseOpenCcCharacterDictionary(simplifiedToTraditional),
          simple: parseOpenCcCharacterDictionary(traditionalToSimplified),
          source: "opencc",
        };
        if (maps.traditional.size < 3000 || maps.simple.size < 3000) throw new Error("OpenCC 字符词典不完整");
        openCcMaps = maps;
        return maps;
      }).catch(() => {
        openCcMaps = fallbackChineseMaps();
        return openCcMaps;
      });
    }
    return openCcMapsPromise;
  }

  function runTextOperation(toolId, input, secondary, parameter, option) {
    const lines = input.replace(/\r\n?/g, "\n").split("\n");
    if (toolId === "text-stats") {
      const words = textWords(input).length;
      const cjkCharacters = (input.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length;
      const latinWords = textWords(input).filter((word) => !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(word)).length;
      const paragraphs = input.trim() ? input.trim().split(/\n\s*\n/).filter(Boolean).length : 0;
      const readingMinutes = input.trim() ? Math.max(1, Math.ceil(latinWords / 220 + cjkCharacters / 400)) : 0;
      return `字符（含空格）：${[...input].length}\n字符（不含空格）：${[...input.replace(/\s/g, "")].length}\n单词/连续词组：${words}\n中日韩字符：${cjkCharacters}\n行：${input ? lines.length : 0}\n段落：${paragraphs}\n预计阅读：${readingMinutes} 分钟`;
    }
    if (toolId === "dedupe-lines") return [...new Set(lines)].join("\n");
    if (toolId === "remove-empty-lines") return lines.filter((line) => line.trim()).join("\n");
    if (toolId === "collapse-spaces") return lines.map((line) => line.trim().replace(/[ \t\u3000]+/g, " ")).join("\n");
    if (toolId === "letter-case") return option === "lower" ? input.toLocaleLowerCase() : option === "title" ? input.replace(/\p{L}+/gu, (word) => word[0].toLocaleUpperCase() + word.slice(1).toLocaleLowerCase()) : input.toLocaleUpperCase();
    if (["camel-case", "pascal-case", "snake-case", "kebab-case"].includes(toolId)) {
      const words = caseWords(input);
      if (toolId === "snake-case") return words.join("_");
      if (toolId === "kebab-case") return words.join("-");
      const joined = words.map((word, index) => (toolId === "camel-case" && index === 0) ? word : word[0]?.toLocaleUpperCase() + word.slice(1)).join("");
      return joined;
    }
    if (toolId === "line-prefix") return lines.map((line) => `${parameter}${line}`).join("\n");
    if (toolId === "line-suffix") return lines.map((line) => `${line}${parameter}`).join("\n");
    if (toolId === "line-numbers") return lines.map((line, index) => `${index + 1}${parameter || ". "}${line}`).join("\n");
    if (toolId === "find-replace") return input.split(parameter).join(secondary);
    if (toolId === "regex-replace") return input.replace(new RegExp(parameter, option || "g"), secondary);
    if (toolId === "sort-lines") return [...lines].sort((a, b) => option === "desc" ? b.localeCompare(a, "zh-CN", { numeric: true }) : a.localeCompare(b, "zh-CN", { numeric: true })).join("\n");
    if (toolId === "shuffle-lines") {
      const result = [...lines];
      for (let index = result.length - 1; index > 0; index -= 1) { const target = secureInt(0, index); [result[index], result[target]] = [result[target], result[index]]; }
      return result.join("\n");
    }
    if (toolId === "text-diff") {
      const right = secondary.replace(/\r\n?/g, "\n").split("\n");
      const cells = (lines.length + 1) * (right.length + 1);
      if (cells > 1_000_000) throw new Error("对比文本过长，请将两侧文本控制在约 1000 行以内");
      const width = right.length + 1;
      const matrix = new Uint16Array(cells);
      for (let leftIndex = lines.length - 1; leftIndex >= 0; leftIndex -= 1) {
        for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
          const offset = leftIndex * width + rightIndex;
          matrix[offset] = lines[leftIndex] === right[rightIndex]
            ? matrix[(leftIndex + 1) * width + rightIndex + 1] + 1
            : Math.max(matrix[(leftIndex + 1) * width + rightIndex], matrix[leftIndex * width + rightIndex + 1]);
        }
      }
      const result = [];
      let leftIndex = 0;
      let rightIndex = 0;
      while (leftIndex < lines.length || rightIndex < right.length) {
        if (leftIndex < lines.length && rightIndex < right.length && lines[leftIndex] === right[rightIndex]) {
          result.push(`  ${lines[leftIndex]}`);
          leftIndex += 1;
          rightIndex += 1;
        } else if (rightIndex < right.length && (leftIndex >= lines.length || matrix[leftIndex * width + rightIndex + 1] >= matrix[(leftIndex + 1) * width + rightIndex])) {
          result.push(`+ ${right[rightIndex]}`);
          rightIndex += 1;
        } else {
          result.push(`- ${lines[leftIndex]}`);
          leftIndex += 1;
        }
      }
      return result.join("\n");
    }
    const extractors = {
      "extract-email": /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,
      "extract-url": /https?:\/\/[^\s<>'"]+/gi,
      "extract-ip": /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
      "extract-number-date": /(?:\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b)|(?:[-+]?\d+(?:\.\d+)?)/g,
    };
    if (extractors[toolId]) return [...new Set(input.match(extractors[toolId]) || [])].join("\n");
    if (toolId === "base64") return option === "decode" ? base64ToUtf8(input) : utf8ToBase64(input);
    if (toolId === "url-code") return option === "decode" ? decodeURIComponent(input) : encodeURIComponent(input);
    if (toolId === "html-entities") {
      if (option === "decode") { const area = document.createElement("textarea"); area.innerHTML = input; return area.value; }
      return input.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }
    if (toolId === "unicode-code") {
      if (option === "decode") return input.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})/gi, (_, wide, narrow) => String.fromCodePoint(parseInt(wide || narrow, 16)));
      return [...input].map((char) => { const code = char.codePointAt(0); return code > 0xffff ? `\\u{${code.toString(16)}}` : `\\u${code.toString(16).padStart(4, "0")}`; }).join("");
    }
    if (toolId.startsWith("json-")) {
      const parsed = JSON.parse(input);
      if (toolId === "json-validate") return "JSON 合法\n根类型：" + (Array.isArray(parsed) ? "数组" : typeof parsed);
      return JSON.stringify(parsed, null, toolId === "json-format" ? 2 : 0);
    }
    if (toolId === "chinese-convert") {
      const maps = openCcMaps || fallbackChineseMaps();
      const map = option === "traditional" ? maps.traditional : maps.simple;
      return [...input].map((char) => map.get(char) || char).join("");
    }
    return input;
  }

  function textToolFields(toolId) {
    const secondaryTools = new Set(["find-replace", "regex-replace", "text-diff"]);
    const parameterLabels = {
      "line-prefix": "前缀", "line-suffix": "后缀", "line-numbers": "编号分隔符",
      "find-replace": "查找内容", "regex-replace": "正则表达式",
    };
    const options = {
      "letter-case": [["upper", "大写"], ["lower", "小写"], ["title", "标题格式"]],
      "regex-replace": [["g", "全局"], ["gi", "全局且忽略大小写"], ["gm", "全局多行"]],
      "sort-lines": [["asc", "升序"], ["desc", "降序"]],
      base64: [["encode", "编码"], ["decode", "解码"]], "url-code": [["encode", "编码"], ["decode", "解码"]],
      "html-entities": [["encode", "编码"], ["decode", "解码"]], "unicode-code": [["encode", "转义"], ["decode", "还原"]],
      "chinese-convert": [["traditional", "简体转繁体"], ["simple", "繁体转简体"]],
    };
    const optionHtml = options[toolId] ? `<label><span>模式</span><select id="textToolOption" data-config="option">${options[toolId].map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>` : "";
    const parameterHtml = parameterLabels[toolId] ? `<label><span>${parameterLabels[toolId]}</span><input id="textToolParameter" data-config="parameter" /></label>` : '<input id="textToolParameter" type="hidden" />';
    const secondaryHtml = secondaryTools.has(toolId) ? `<label class="tool-wide"><span>${toolId === "text-diff" ? "对比文本" : "替换为"}</span><textarea id="textToolSecondary" ${toolId === "text-diff" ? "" : "data-config=\"replacement\""}></textarea></label>` : '<textarea id="textToolSecondary" class="hidden"></textarea>';
    return { optionHtml, parameterHtml, secondaryHtml };
  }

  function renderTextTool(tool) {
    const { optionHtml, parameterHtml, secondaryHtml } = textToolFields(tool.id);
    byId("toolWorkbenchBody").innerHTML = `<div class="tool-form text-tool-form">
      <label class="tool-wide"><span>输入文本</span><textarea id="textToolInput" spellcheck="false"></textarea></label>
      ${secondaryHtml}<div class="tool-options">${parameterHtml}${optionHtml}</div>
      <div class="tool-command-row"><button class="primary" id="runTextToolBtn" type="button">处理</button><button id="copyTextToolBtn" type="button">复制结果</button><button id="downloadTextToolBtn" type="button">下载 TXT</button></div>
      <label class="tool-wide"><span>结果</span><textarea id="textToolOutput" readonly></textarea></label>
      ${renderConfigControls(tool.id)}
    </div>`;
    byId("runTextToolBtn").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        if (tool.id === "chinese-convert") {
          setMessage("正在加载本地简繁词典…");
          await loadOpenCcMaps();
        }
        const output = runTextOperation(tool.id, byId("textToolInput").value, byId("textToolSecondary").value, byId("textToolParameter").value, byId("textToolOption")?.value || "");
        byId("textToolOutput").value = output;
        setMessage(tool.id === "chinese-convert" && openCcMaps?.source !== "opencc" ? "官方词典不可用，已使用内置基础词典" : "处理完成");
      } catch (error) {
        setMessage(`处理失败：${error.message}`, true);
      } finally {
        button.disabled = false;
      }
    });
    byId("copyTextToolBtn").addEventListener("click", (event) => copyText(byId("textToolOutput").value, event.currentTarget));
    byId("downloadTextToolBtn").addEventListener("click", () => downloadText(`${tool.id}-${Date.now()}.txt`, byId("textToolOutput").value));
    bindConfigControls();
  }

  function randomUnit() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] / 0x100000000;
  }

  function secureInt(minimum, maximum) {
    const min = Math.ceil(Number(minimum));
    const max = Math.floor(Number(maximum));
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) throw new Error("数值范围无效");
    const range = max - min + 1;
    if (range <= 0 || range > 0x100000000) throw new Error("数值范围过大");
    const limit = Math.floor(0x100000000 / range) * range;
    const values = new Uint32Array(1);
    do { crypto.getRandomValues(values); } while (values[0] >= limit);
    return min + (values[0] % range);
  }

  function randomColor() {
    return `#${secureInt(0, 0xffffff).toString(16).padStart(6, "0")}`;
  }

  function secureUuid() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function shuffled(items) {
    const output = [...items];
    for (let index = output.length - 1; index > 0; index -= 1) { const target = secureInt(0, index); [output[index], output[target]] = [output[target], output[index]]; }
    return output;
  }

  function randomToolResult(toolId, values) {
    const minimum = Number(values.minimum || 0);
    const maximum = Number(values.maximum || 100);
    const count = Math.max(1, Math.min(1000, Number(values.count || 1)));
    const entries = String(values.entries || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
    if (toolId === "random-integer") return Array.from({ length: count }, () => secureInt(minimum, maximum)).join("\n");
    if (toolId === "random-decimal") return Array.from({ length: count }, () => (minimum + randomUnit() * (maximum - minimum)).toFixed(Math.max(0, Math.min(12, Number(values.precision || 2))))).join("\n");
    if (toolId === "random-string") {
      const alphabet = [...new Set(String(values.alphabet || "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"))].join("");
      if (!alphabet) throw new Error("字符集不能为空");
      const length = Math.max(1, Math.min(4096, Number(values.length || 16)));
      return Array.from({ length }, () => alphabet[secureInt(0, alphabet.length - 1)]).join("");
    }
    if (toolId === "random-password") {
      const sets = [
        values.passwordUpper !== false && "ABCDEFGHJKLMNPQRSTUVWXYZ",
        values.passwordLower !== false && "abcdefghijkmnopqrstuvwxyz",
        values.passwordDigits !== false && "23456789",
        values.passwordSymbols !== false && "!@#$%^&*_-+=",
      ].filter(Boolean);
      if (!sets.length) throw new Error("请至少选择一种密码字符");
      const length = Math.max(sets.length, Math.min(4096, Number(values.length || 20)));
      const alphabet = sets.join("");
      const characters = sets.map((set) => set[secureInt(0, set.length - 1)]);
      while (characters.length < length) characters.push(alphabet[secureInt(0, alphabet.length - 1)]);
      return shuffled(characters).join("");
    }
    if (toolId === "random-uuid") return Array.from({ length: count }, secureUuid).join("\n");
    if (["random-draw", "random-wheel", "random-decision"].includes(toolId)) {
      if (!entries.length) throw new Error("请至少输入一个选项");
      return entries[secureInt(0, entries.length - 1)];
    }
    if (toolId === "weighted-wheel") {
      const weighted = entries.map((line) => { const [name, rawWeight] = line.split("|"); return { name: name.trim(), weight: Math.max(0, Number(rawWeight || 1)) }; }).filter((item) => item.name && item.weight > 0);
      const total = weighted.reduce((sum, item) => sum + item.weight, 0);
      if (!total) throw new Error("请按“选项|权重”输入至少一项");
      let target = randomUnit() * total;
      return weighted.find((item) => (target -= item.weight) <= 0)?.name || weighted[weighted.length - 1].name;
    }
    if (toolId === "random-groups") {
      if (!entries.length) throw new Error("请输入分组成员");
      const groups = Array.from({ length: Math.max(1, Math.min(entries.length, Number(values.groups || 2))) }, () => []);
      shuffled(entries).forEach((entry, index) => groups[index % groups.length].push(entry));
      return groups.map((group, index) => `第 ${index + 1} 组\n${group.join("\n")}`).join("\n\n");
    }
    if (toolId === "random-date") {
      const start = new Date(values.startDate || "2000-01-01").getTime();
      const end = new Date(values.endDate || new Date().toISOString().slice(0, 10)).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error("日期范围无效");
      return new Date(start + Math.floor(randomUnit() * (end - start + 86400000))).toISOString().slice(0, 10);
    }
    if (toolId === "random-time") return `${String(secureInt(0, 23)).padStart(2, "0")}:${String(secureInt(0, 59)).padStart(2, "0")}:${String(secureInt(0, 59)).padStart(2, "0")}`;
    if (toolId === "random-color") return randomColor();
    if (toolId === "random-palette") return Array.from({ length: Math.max(2, Math.min(20, Number(values.count || 5))) }, randomColor).join("\n");
    if (toolId === "coin-flip") return secureInt(0, 1) ? "正面" : "反面";
    if (toolId.startsWith("dice-d")) return String(secureInt(1, Number(toolId.slice(6))));
    if (toolId === "custom-dice") return String(secureInt(1, Math.max(2, Math.min(1_000_000, Number(values.sides || 6)))));
    return "";
  }

  function renderRandomTool(tool) {
    const needsEntries = ["random-draw", "random-groups", "random-wheel", "weighted-wheel", "random-decision"].includes(tool.id);
    const numeric = ["random-integer", "random-decimal"].includes(tool.id);
    const strings = ["random-string", "random-password"].includes(tool.id);
    byId("toolWorkbenchBody").innerHTML = `<div class="tool-form random-tool-form">
      <div class="tool-options">
        ${numeric ? '<label><span>最小值</span><input data-config="minimum" id="randomMinimum" type="number" value="0" /></label><label><span>最大值</span><input data-config="maximum" id="randomMaximum" type="number" value="100" /></label>' : ""}
        ${tool.id === "random-decimal" ? '<label><span>小数位</span><input data-config="precision" id="randomPrecision" type="number" min="0" max="12" value="2" /></label>' : ""}
        ${numeric || tool.id === "random-uuid" || tool.id === "random-palette" ? '<label><span>数量</span><input data-config="count" id="randomCount" type="number" min="1" max="1000" value="1" /></label>' : ""}
        ${strings ? `<label><span>长度</span><input data-config="length" id="randomLength" type="number" min="1" max="4096" value="${tool.id === "random-password" ? 20 : 16}" /></label>` : ""}
        ${tool.id === "random-string" ? '<label class="tool-wide"><span>字符集</span><input data-config="alphabet" id="randomAlphabet" value="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" /></label>' : ""}
        ${tool.id === "random-password" ? '<label class="admin-checkbox"><input data-config="passwordUpper" id="passwordUpper" type="checkbox" checked /> 大写字母</label><label class="admin-checkbox"><input data-config="passwordLower" id="passwordLower" type="checkbox" checked /> 小写字母</label><label class="admin-checkbox"><input data-config="passwordDigits" id="passwordDigits" type="checkbox" checked /> 数字</label><label class="admin-checkbox"><input data-config="passwordSymbols" id="passwordSymbols" type="checkbox" checked /> 符号</label>' : ""}
        ${tool.id === "random-groups" ? '<label><span>组数</span><input data-config="groups" id="randomGroups" type="number" min="1" value="2" /></label>' : ""}
        ${tool.id === "custom-dice" ? '<label><span>骰子面数</span><input data-config="sides" id="randomSides" type="number" min="2" value="6" /></label>' : ""}
        ${tool.id === "random-date" ? '<label><span>开始日期</span><input data-config="startDate" id="randomStartDate" type="date" value="2000-01-01" /></label><label><span>结束日期</span><input data-config="endDate" id="randomEndDate" type="date" /></label>' : ""}
      </div>
      ${needsEntries ? `<label class="tool-wide"><span>${tool.id === "weighted-wheel" ? "选项（每行：名称|权重）" : "选项（每行一个）"}</span><textarea data-config="entries" id="randomEntries"></textarea></label>` : ""}
      <div class="tool-command-row"><button class="primary" id="runRandomToolBtn" type="button">生成</button><button id="copyRandomResultBtn" type="button">复制结果</button></div>
      <output class="random-result" id="randomResult">等待生成</output>
      ${renderConfigControls(tool.id)}
    </div>`;
    if (byId("randomEndDate")) byId("randomEndDate").value = new Date().toISOString().slice(0, 10);
    byId("runRandomToolBtn").addEventListener("click", () => {
      try {
        const values = {
          minimum: byId("randomMinimum")?.value, maximum: byId("randomMaximum")?.value,
          precision: byId("randomPrecision")?.value, count: byId("randomCount")?.value,
          length: byId("randomLength")?.value, alphabet: byId("randomAlphabet")?.value,
          groups: byId("randomGroups")?.value, sides: byId("randomSides")?.value,
          startDate: byId("randomStartDate")?.value, endDate: byId("randomEndDate")?.value,
          entries: byId("randomEntries")?.value,
          passwordUpper: byId("passwordUpper")?.checked, passwordLower: byId("passwordLower")?.checked,
          passwordDigits: byId("passwordDigits")?.checked, passwordSymbols: byId("passwordSymbols")?.checked,
        };
        const result = randomToolResult(tool.id, values);
        byId("randomResult").textContent = result;
        setMessage(tool.id === "random-password" ? "密码只在本机生成，未上传服务器" : "生成完成");
      } catch (error) { setMessage(error.message, true); }
    });
    byId("copyRandomResultBtn").addEventListener("click", (event) => copyText(byId("randomResult").textContent, event.currentTarget));
    bindConfigControls();
  }

  function renderCurrentTool() {
    if (!currentTool) return;
    byId("toolWorkbenchCategory").textContent = categoryFor(currentTool).name;
    byId("toolWorkbenchTitle").textContent = currentTool.name;
    byId("toolWorkbenchDescription").textContent = currentTool.description;
    setMessage("");
    if (currentTool.category === "text") renderTextTool(currentTool);
    else if (currentTool.category === "random") renderRandomTool(currentTool);
    else if (currentTool.category === "file") renderFileTool(currentTool);
    else if (currentTool.category === "image") renderImageTool(currentTool);
    else renderTemporaryTool(currentTool);
    updateWorkbenchActions();
  }

  async function openTool(toolId, pushRoute = true) {
    const tool = TOOL_MAP.get(toolId);
    if (!tool) return;
    currentTool = tool;
    byId("toolsDashboard").classList.add("hidden");
    byId("toolWorkbench").classList.remove("hidden");
    byId("toolWorkbench").setAttribute("aria-hidden", "false");
    renderCurrentTool();
    if (pushRoute) bridge.navigate(`/tools/${tool.id}`);
    bridge.api("/api/tools/recent", { tool_id: tool.id }).then(loadPreferences).catch(() => {});
  }

  function closeWorkbench(pushRoute = true) {
    currentTool = null;
    currentDownload = null;
    byId("toolWorkbench").classList.add("hidden");
    byId("toolWorkbench").setAttribute("aria-hidden", "true");
    byId("toolsDashboard").classList.remove("hidden");
    if (pushRoute) bridge.navigate("/tools");
  }

  async function show(path = "/tools") {
    const access = await bridge.apiGet("/api/tools/access");
    const summary = access.account?.membership_summary || {};
    byId("toolsMembershipStatus").textContent = summary.permanent ? `${summary.name} · 永久有效` : `${summary.name}${summary.expires_at ? ` · 到期 ${bridge.formatDate(summary.expires_at)}` : ""}`;
    byId("toolsPanel").classList.remove("hidden");
    byId("toolsPanel").setAttribute("aria-hidden", "false");
    renderCategories();
    renderCatalog();
    await loadPreferences();
    const match = path.match(/^\/tools\/([a-z0-9_-]+)$/);
    if (match && TOOL_MAP.has(match[1])) await openTool(match[1], false);
    else closeWorkbench(false);
  }

  function hide() {
    byId("toolsPanel")?.classList.add("hidden");
    byId("toolsPanel")?.setAttribute("aria-hidden", "true");
  }

  function init(context) {
    bridge = context;
    renderCategories();
    renderCatalog();
    byId("toolSearchInput")?.addEventListener("input", () => { currentCategory = "all"; renderCategories(); renderCatalog(); });
    byId("closeToolWorkbenchBtn")?.addEventListener("click", () => closeWorkbench(true));
    byId("favoriteToolBtn")?.addEventListener("click", () => currentTool && toggleFavorite(currentTool.id));
    byId("pinToolBtn")?.addEventListener("click", () => currentTool && toggleFavorite(currentTool.id, !Boolean(favoriteFor(currentTool.id)?.pinned)));
    byId("clearToolHistoryBtn")?.addEventListener("click", async () => {
      try {
        await bridge.api("/api/tools/history/clear", {});
        await loadPreferences();
        setMessage("最近使用记录已清除");
      } catch (error) {
        setMessage(error.message, true);
      }
    });
  }

  window.WYJTools = { init, show, hide, openTool, closeWorkbench, searchTools, tools: TOOLS };

  function uint32(value) {
    return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
  }

  function uint16(value) {
    return new Uint8Array([value & 255, (value >>> 8) & 255]);
  }

  function joinBytes(parts) {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    parts.forEach((part) => { output.set(part, offset); offset += part.length; });
    return output;
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }

  function zipBlob(entries) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    entries.forEach((entry) => {
      const name = encoder.encode(String(entry.name).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 180) || "file");
      const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
      const crc = crc32(data);
      const local = joinBytes([
        new Uint8Array([0x50, 0x4b, 0x03, 0x04]), uint16(20), uint16(0x0800), uint16(0), uint16(0), uint16(0),
        uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), name, data,
      ]);
      localParts.push(local);
      centralParts.push(joinBytes([
        new Uint8Array([0x50, 0x4b, 0x01, 0x02]), uint16(20), uint16(20), uint16(0x0800), uint16(0), uint16(0), uint16(0),
        uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name,
      ]));
      offset += local.length;
    });
    const central = joinBytes(centralParts);
    const end = joinBytes([
      new Uint8Array([0x50, 0x4b, 0x05, 0x06]), uint16(0), uint16(0), uint16(entries.length), uint16(entries.length),
      uint32(central.length), uint32(offset), uint16(0),
    ]);
    return new Blob([...localParts, central, end], { type: "application/zip" });
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    const source = String(text || "").replace(/^\ufeff/, "");
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"' && !field) quoted = true;
      else if (char === ",") { row.push(field); field = ""; }
      else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
      else field += char;
    }
    row.push(field.replace(/\r$/, ""));
    if (row.some((item) => item !== "") || rows.length === 0) rows.push(row);
    return rows;
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function csvString(rows) {
    return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  }

  async function decodeLocalText(file, encoding = "utf-8") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      return new TextDecoder(encoding || "utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      if (error instanceof RangeError) throw new Error(`当前浏览器不支持 ${encoding} 编码`);
      throw new Error(`${file.name} 不是有效的 ${String(encoding || "utf-8").toUpperCase()} 文本，请选择正确的源编码`);
    }
  }

  function validateCsvTable(rows, fileName = "CSV 文件") {
    if (!rows.length || (rows.length === 1 && rows[0].every((cell) => !cell))) throw new Error(`${fileName} 没有可处理的数据`);
    const width = rows[0].length;
    if (!width || rows[0].every((cell) => !String(cell).trim())) throw new Error(`${fileName} 缺少表头`);
    const invalidRow = rows.findIndex((row) => row.length !== width);
    if (invalidRow >= 0) throw new Error(`${fileName} 第 ${invalidRow + 1} 行列数与表头不一致`);
    return rows;
  }

  function md5Bytes(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const length = bytes.length;
    const paddedLength = (((length + 8) >>> 6) + 1) * 64;
    const buffer = new Uint8Array(paddedLength);
    buffer.set(bytes);
    buffer[length] = 0x80;
    const bitLength = length * 8;
    for (let index = 0; index < 8; index += 1) buffer[paddedLength - 8 + index] = Math.floor(bitLength / (2 ** (8 * index))) & 255;
    const view = new DataView(buffer.buffer);
    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    const shifts = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0);
    const rotate = (value, amount) => ((value << amount) | (value >>> (32 - amount))) >>> 0;
    for (let offset = 0; offset < paddedLength; offset += 64) {
      const words = Array.from({ length: 16 }, (_, index) => view.getUint32(offset + index * 4, true));
      let a = a0; let b = b0; let c = c0; let d = d0;
      for (let index = 0; index < 64; index += 1) {
        let f; let g;
        if (index < 16) { f = (b & c) | (~b & d); g = index; }
        else if (index < 32) { f = (d & b) | (~d & c); g = (5 * index + 1) % 16; }
        else if (index < 48) { f = b ^ c ^ d; g = (3 * index + 5) % 16; }
        else { f = c ^ (b | ~d); g = (7 * index) % 16; }
        const nextD = c;
        c = b;
        b = (b + rotate((a + f + constants[index] + words[g]) >>> 0, shifts[index])) >>> 0;
        a = d;
        d = nextD;
      }
      a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
    }
    return [a0, b0, c0, d0].map((value) => [0, 8, 16, 24].map((shift) => ((value >>> shift) & 255).toString(16).padStart(2, "0")).join("")).join("");
  }

  async function digestFile(file, algorithm) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (algorithm === "MD5") return md5Bytes(bytes);
    const digest = new Uint8Array(await crypto.subtle.digest(algorithm, bytes));
    return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function pdfBytesFromJpegs(images) {
    const encoder = new TextEncoder();
    const objectCount = 2 + images.length * 3;
    const pageIds = images.map((_, index) => 3 + index * 3);
    const objects = new Map();
    objects.set(1, encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"));
    objects.set(2, encoder.encode(`<< /Type /Pages /Count ${images.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`));
    images.forEach((image, index) => {
      const pageId = 3 + index * 3;
      const imageId = pageId + 1;
      const contentId = pageId + 2;
      const pageWidth = 595;
      const pageHeight = 842;
      const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
      const width = Math.round(image.width * scale * 100) / 100;
      const height = Math.round(image.height * scale * 100) / 100;
      const x = Math.round((pageWidth - width) / 2 * 100) / 100;
      const y = Math.round((pageHeight - height) / 2 * 100) / 100;
      const commands = encoder.encode(`q ${width} 0 0 ${height} ${x} ${y} cm /Im${index + 1} Do Q`);
      objects.set(pageId, encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
      objects.set(imageId, joinBytes([encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`), image.bytes, encoder.encode("\nendstream")]));
      objects.set(contentId, joinBytes([encoder.encode(`<< /Length ${commands.length} >>\nstream\n`), commands, encoder.encode("\nendstream")]));
    });
    const parts = [encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
    const offsets = [0];
    let offset = parts[0].length;
    for (let id = 1; id <= objectCount; id += 1) {
      offsets[id] = offset;
      const part = joinBytes([encoder.encode(`${id} 0 obj\n`), objects.get(id), encoder.encode("\nendobj\n")]);
      parts.push(part);
      offset += part.length;
    }
    const xrefOffset = offset;
    let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= objectCount; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    parts.push(encoder.encode(xref));
    return joinBytes(parts);
  }

  async function fileToJpeg(file) {
    const bitmap = await bitmapFromFile(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    releaseBitmap(bitmap);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("图片转换失败")), "image/jpeg", 0.9));
    return { width: canvas.width, height: canvas.height, bytes: new Uint8Array(await blob.arrayBuffer()) };
  }

  async function readLocalFiles(input, maximumFiles = 50, maximumBytes = 50 * 1024 * 1024) {
    const files = [...(input.files || [])];
    if (!files.length) throw new Error("请选择文件");
    if (files.length > maximumFiles) throw new Error(`每次最多处理 ${maximumFiles} 个文件`);
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > maximumBytes) throw new Error(`文件总大小不能超过 ${formatBytes(maximumBytes)}`);
    return files;
  }

  async function processFileTool(tool, files, parameter, encoding) {
    if (tool.id.startsWith("file-sha") || tool.id === "file-md5") {
      const algorithm = { "file-md5": "MD5", "file-sha1": "SHA-1", "file-sha256": "SHA-256", "file-sha512": "SHA-512" }[tool.id];
      return { text: (await Promise.all(files.map(async (file) => `${await digestFile(file, algorithm)}  ${file.name}`))).join("\n") };
    }
    if (tool.id === "file-info") return { text: files.map((file) => `${file.name}\n类型：${file.type || "未知"}\n大小：${formatBytes(file.size)}\n最后修改：${new Date(file.lastModified).toLocaleString("zh-CN")}`).join("\n\n") };
    if (tool.id === "images-pdf") {
      const images = await Promise.all(files.map(fileToJpeg));
      return { blob: new Blob([pdfBytesFromJpegs(images)], { type: "application/pdf" }), name: `images-${Date.now()}.pdf`, text: `已生成 ${images.length} 页 PDF` };
    }
    if (["files-zip", "batch-zip"].includes(tool.id)) {
      const entries = await Promise.all(files.map(async (file) => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) })));
      return { blob: zipBlob(entries), name: `files-${Date.now()}.zip`, text: `已打包 ${files.length} 个文件` };
    }
    if (tool.id === "rename-preview") {
      const prefix = parameter || "file";
      return { text: files.map((file, index) => `${file.name}  →  ${prefix}-${String(index + 1).padStart(3, "0")}${file.name.includes(".") ? `.${file.name.split(".").pop()}` : ""}`).join("\n") };
    }
    if (["txt-merge", "csv-merge", "json-array-merge"].includes(tool.id)) {
      const texts = await Promise.all(files.map((file) => decodeLocalText(file, encoding)));
      if (tool.id === "txt-merge") return { text: texts.join("\n"), blob: new Blob([texts.join("\n")], { type: "text/plain;charset=utf-8" }), name: `merged-${Date.now()}.txt` };
      if (tool.id === "csv-merge") {
        const tables = texts.map((text, index) => validateCsvTable(parseCsv(text), files[index].name));
        const header = tables[0][0].map((cell) => String(cell).trim());
        const mismatch = tables.findIndex((table) => table[0].length !== header.length || table[0].some((cell, index) => String(cell).trim() !== header[index]));
        if (mismatch >= 0) throw new Error(`${files[mismatch].name} 的表头与第一个 CSV 文件不一致`);
        const merged = [tables[0][0], ...tables.flatMap((table) => table.slice(1))];
        const output = csvString(merged);
        return { text: output, blob: new Blob(["\ufeff", output], { type: "text/csv;charset=utf-8" }), name: `merged-${Date.now()}.csv` };
      }
      const output = JSON.stringify(texts.flatMap((text) => { const value = JSON.parse(text); if (!Array.isArray(value)) throw new Error("每个 JSON 文件根节点必须是数组"); return value; }), null, 2);
      return { text: output, blob: new Blob([output], { type: "application/json" }), name: `merged-${Date.now()}.json` };
    }
    const file = files[0];
    const text = await decodeLocalText(file, encoding);
    if (tool.id === "csv-json") {
      const rows = validateCsvTable(parseCsv(text), file.name); const headers = rows.shift() || [];
      const names = headers.map((header, index) => String(header).trim() || `column_${index + 1}`);
      if (new Set(names).size !== names.length) throw new Error("CSV 表头存在重复字段，请先重命名后再转换");
      const output = JSON.stringify(rows.map((row) => Object.fromEntries(names.map((header, index) => [header, row[index] ?? ""]))), null, 2);
      return { text: output, blob: new Blob([output], { type: "application/json" }), name: `${file.name.replace(/\.[^.]+$/, "")}.json` };
    }
    if (tool.id === "json-csv") {
      const parsed = JSON.parse(text); if (!Array.isArray(parsed)) throw new Error("JSON 根节点必须是数组");
      if (parsed.some((item) => !item || typeof item !== "object" || Array.isArray(item))) throw new Error("JSON 数组中的每一项都必须是对象");
      const headers = [...new Set(parsed.flatMap((item) => Object.keys(item)))];
      if (parsed.length && !headers.length) throw new Error("JSON 对象没有可转换的字段");
      const output = csvString([headers, ...parsed.map((item) => headers.map((header) => item?.[header] ?? ""))]);
      return { text: output, blob: new Blob(["\ufeff", output], { type: "text/csv;charset=utf-8" }), name: `${file.name.replace(/\.[^.]+$/, "")}.csv` };
    }
    if (tool.id === "text-encoding") return { text, blob: new Blob([text], { type: "text/plain;charset=utf-8" }), name: `${file.name.replace(/\.[^.]+$/, "")}-utf8.txt` };
    if (["text-split", "csv-split"].includes(tool.id)) {
      const size = Math.max(1, Math.min(100000, Number(parameter || 1000)));
      const entries = [];
      if (tool.id === "csv-split") {
        const rows = validateCsvTable(parseCsv(text), file.name);
        const header = rows.shift();
        for (let index = 0; index < rows.length; index += size) {
          const output = csvString([header, ...rows.slice(index, index + size)]);
          entries.push({ name: `part-${String(entries.length + 1).padStart(3, "0")}.csv`, data: new TextEncoder().encode(`\ufeff${output}`) });
        }
      } else {
        const lines = text.replace(/\r\n?/g, "\n").split("\n");
        for (let index = 0; index < lines.length; index += size) {
          entries.push({ name: `part-${String(entries.length + 1).padStart(3, "0")}.txt`, data: new TextEncoder().encode(lines.slice(index, index + size).join("\n")) });
        }
      }
      if (!entries.length) throw new Error("没有可拆分的数据行");
      return { text: `已拆分为 ${entries.length} 个文件`, blob: zipBlob(entries), name: `split-${Date.now()}.zip` };
    }
    throw new Error("暂不支持该文件操作");
  }

  function renderFileTool(tool) {
    const multiple = !["csv-json", "json-csv", "text-encoding", "text-split", "csv-split"].includes(tool.id);
    const acceptsImages = tool.id === "images-pdf";
    const parameterLabel = ["text-split", "csv-split"].includes(tool.id) ? "每份数据行数" : tool.id === "rename-preview" ? "新文件名前缀" : "参数";
    byId("toolWorkbenchBody").innerHTML = `<div class="tool-form file-tool-form">
      <label class="file-drop"><span>选择${multiple ? "一个或多个" : "一个"}文件</span><input id="fileToolInput" type="file" ${multiple ? "multiple" : ""} ${acceptsImages ? 'accept="image/*"' : ""} /></label>
      <p class="local-processing-note">文件默认只在本地浏览器中处理，不会上传服务器。单次最多 50 个文件、总计 50 MB。</p>
      <div class="tool-options">
        ${["text-split", "csv-split", "rename-preview"].includes(tool.id) ? `<label><span>${parameterLabel}</span><input id="fileToolParameter" data-config="parameter" value="${tool.id === "rename-preview" ? "file" : "1000"}" /></label>` : '<input id="fileToolParameter" type="hidden" />'}
        ${["csv-json", "json-csv", "text-encoding", "text-split", "csv-split", "txt-merge", "csv-merge", "json-array-merge"].includes(tool.id) ? '<label><span>源文本编码</span><select id="fileToolEncoding" data-config="encoding"><option value="utf-8">UTF-8</option><option value="gbk">GBK</option><option value="big5">Big5</option><option value="shift_jis">Shift-JIS</option></select></label>' : '<select id="fileToolEncoding" class="hidden"><option value="utf-8"></option></select>'}
      </div>
      <div class="tool-command-row"><button class="primary" id="runFileToolBtn" type="button">开始处理</button><button id="downloadFileToolBtn" type="button" disabled>下载结果</button><button id="copyFileToolBtn" type="button">复制文本结果</button></div>
      <pre class="file-result" id="fileToolResult">等待处理</pre>
      ${renderConfigControls(tool.id)}
    </div>`;
    currentDownload = null;
    byId("runFileToolBtn").addEventListener("click", async () => {
      const button = byId("runFileToolBtn"); button.disabled = true; setMessage("正在处理…");
      try {
        const files = await readLocalFiles(byId("fileToolInput"));
        const result = await processFileTool(tool, files, byId("fileToolParameter").value, byId("fileToolEncoding").value);
        byId("fileToolResult").textContent = result.text || "处理完成";
        currentDownload = result.blob ? { blob: result.blob, name: result.name } : null;
        byId("downloadFileToolBtn").disabled = !currentDownload;
        setMessage("本地处理完成");
      } catch (error) { setMessage(error.message, true); }
      finally { button.disabled = false; }
    });
    byId("downloadFileToolBtn").addEventListener("click", () => currentDownload && downloadBlob(currentDownload.name, currentDownload.blob));
    byId("copyFileToolBtn").addEventListener("click", (event) => copyText(byId("fileToolResult").textContent, event.currentTarget));
    bindConfigControls();
  }

  function canvasBlob(canvas, type = "image/png", quality = 0.88) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("浏览器无法生成该图片格式")), type, quality));
  }

  function releaseBitmap(bitmap) {
    if (bitmap && typeof bitmap.close === "function") bitmap.close();
  }

  async function bitmapFromFile(file) {
    if (!file.type.startsWith("image/")) throw new Error(`${file.name} 不是受支持的图片`);
    if (typeof createImageBitmap === "function") {
      try { return await createImageBitmap(file); } catch (_error) { /* Use the image element fallback below. */ }
    }
    return new Promise((resolve, reject) => {
      const source = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(source); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(source); reject(new Error(`${file.name} 无法解码`)); };
      image.src = source;
    });
  }

  function roundedPath(context, x, y, width, height, radius) {
    const safe = Math.max(0, Math.min(radius, width / 2, height / 2));
    context.beginPath();
    context.moveTo(x + safe, y);
    context.arcTo(x + width, y, x + width, y + height, safe);
    context.arcTo(x + width, y + height, x, y + height, safe);
    context.arcTo(x, y + height, x, y, safe);
    context.arcTo(x, y, x + width, y, safe);
    context.closePath();
  }

  function imageControlValues() {
    const value = (id, fallback = "") => byId(id)?.value ?? fallback;
    return {
      width: Number(value("imageWidth", 0)), height: Number(value("imageHeight", 0)), scale: Number(value("imageScale", 100)),
      quality: Number(value("imageQuality", 85)) / 100, format: value("imageFormat", "image/png"), angle: Number(value("imageAngle", 90)),
      flip: value("imageFlip", "horizontal"),
      radius: Number(value("imageRadius", 32)), text: value("imageWatermarkText", "WYJ"), color: value("imageColorText", value("imageColor", "#7ed8ff")),
      background: value("imageBackground", "#07111f"), x: Number(value("imageRegionX", 25)), y: Number(value("imageRegionY", 25)),
      regionWidth: Number(value("imageRegionWidth", 50)), regionHeight: Number(value("imageRegionHeight", 30)), blur: Number(value("imageBlur", 8)),
      gradientEnd: value("imageGradientEnd", "#246da8"), gradientAngle: Number(value("imageGradientAngle", 135)),
    };
  }

  function colorRgb(hex) {
    const normalized = String(hex || "").trim().replace(/^#/, "");
    if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(normalized)) throw new Error("请输入有效的 HEX 颜色");
    const full = normalized.length === 3 ? [...normalized].map((char) => char + char).join("") : normalized;
    return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16));
  }

  function hslToRgb(hue, saturation, light) {
    const h = ((Number(hue) % 360) + 360) % 360;
    const s = Math.max(0, Math.min(100, Number(saturation))) / 100;
    const l = Math.max(0, Math.min(100, Number(light))) / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const section = h / 60;
    const second = chroma * (1 - Math.abs((section % 2) - 1));
    const [red, green, blue] = section < 1 ? [chroma, second, 0] : section < 2 ? [second, chroma, 0] : section < 3 ? [0, chroma, second] : section < 4 ? [0, second, chroma] : section < 5 ? [second, 0, chroma] : [chroma, 0, second];
    const match = l - chroma / 2;
    return [red, green, blue].map((value) => Math.round((value + match) * 255));
  }

  function parseColorValue(value) {
    const input = String(value || "").trim();
    if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(input)) return colorRgb(input);
    const rgb = input.match(/^rgba?\(\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i);
    if (rgb) {
      const percent = /%/.test(input);
      return rgb.slice(1, 4).map((item) => Math.round(Math.max(0, Math.min(percent ? 100 : 255, Number(item))) * (percent ? 2.55 : 1)));
    }
    const hsl = input.match(/^hsla?\(\s*([-\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i);
    if (hsl) return hslToRgb(hsl[1], hsl[2], hsl[3]);
    throw new Error("请输入 HEX、RGB 或 HSL 颜色，例如 #246da8、rgb(36,109,168) 或 hsl(204,65%,40%)");
  }

  function rgbToHex(red, green, blue) {
    return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
  }

  function rgbToHsl(red, green, blue) {
    const values = [red, green, blue].map((value) => value / 255);
    const max = Math.max(...values); const min = Math.min(...values);
    const light = (max + min) / 2;
    if (max === min) return [0, 0, Math.round(light * 100)];
    const delta = max - min;
    const saturation = delta / (1 - Math.abs(2 * light - 1));
    let hue = max === values[0] ? ((values[1] - values[2]) / delta) % 6 : max === values[1] ? (values[2] - values[0]) / delta + 2 : (values[0] - values[1]) / delta + 4;
    hue = Math.round(hue * 60); if (hue < 0) hue += 360;
    return [hue, Math.round(saturation * 100), Math.round(light * 100)];
  }

  async function imageCanvas(toolId, bitmap, values, overlayBitmap = null) {
    let sourceX = 0; let sourceY = 0; let sourceWidth = bitmap.width; let sourceHeight = bitmap.height;
    let width = bitmap.width; let height = bitmap.height;
    const ratioMap = { "crop-square": 1, "crop-four-three": 4 / 3, "crop-sixteen-nine": 16 / 9 };
    if (toolId === "image-resize") { width = Math.max(1, Math.round(values.width || bitmap.width)); height = Math.max(1, Math.round(values.height || bitmap.height)); }
    if (toolId === "image-scale") { width = Math.max(1, Math.round(bitmap.width * values.scale / 100)); height = Math.max(1, Math.round(bitmap.height * values.scale / 100)); }
    if (ratioMap[toolId]) {
      const ratio = ratioMap[toolId];
      if (bitmap.width / bitmap.height > ratio) { sourceWidth = bitmap.height * ratio; sourceX = (bitmap.width - sourceWidth) / 2; }
      else { sourceHeight = bitmap.width / ratio; sourceY = (bitmap.height - sourceHeight) / 2; }
      width = Math.round(sourceWidth); height = Math.round(sourceHeight);
    }
    if (toolId === "image-crop") {
      sourceX = bitmap.width * values.x / 100; sourceY = bitmap.height * values.y / 100;
      sourceWidth = bitmap.width * values.regionWidth / 100; sourceHeight = bitmap.height * values.regionHeight / 100;
      width = Math.max(1, Math.round(sourceWidth)); height = Math.max(1, Math.round(sourceHeight));
    }
    const rotation = toolId === "image-rotate" ? ((values.angle % 360) + 360) % 360 : 0;
    if (rotation === 90 || rotation === 270) [width, height] = [height, width];
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d"); context.imageSmoothingQuality = "high";
    if (["image-format", "image-compress"].includes(toolId) && values.format === "image/jpeg") { context.fillStyle = values.background; context.fillRect(0, 0, width, height); }
    context.save();
    if (rotation) { context.translate(width / 2, height / 2); context.rotate(rotation * Math.PI / 180); context.translate(-(rotation === 90 || rotation === 270 ? height : width) / 2, -(rotation === 90 || rotation === 270 ? width : height) / 2); }
    if (toolId === "image-flip") {
      if (values.flip === "vertical") { context.translate(0, height); context.scale(1, -1); }
      else if (values.flip === "both") { context.translate(width, height); context.scale(-1, -1); }
      else { context.translate(width, 0); context.scale(-1, 1); }
    }
    if (toolId === "image-rounded") { roundedPath(context, 0, 0, width, height, values.radius); context.clip(); }
    if (toolId === "image-avatar") { context.beginPath(); context.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2); context.clip(); }
    if (toolId === "image-blur") context.filter = `blur(${Math.max(0, Math.min(40, values.blur))}px)`;
    const drawWidth = rotation === 90 || rotation === 270 ? height : width;
    const drawHeight = rotation === 90 || rotation === 270 ? width : height;
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, drawWidth, drawHeight);
    context.restore();
    if (["text-watermark", "tile-watermark"].includes(toolId)) {
      context.save(); context.fillStyle = values.color; context.globalAlpha = 0.55; context.font = `600 ${Math.max(16, Math.round(Math.min(width, height) / 18))}px sans-serif`;
      if (toolId === "tile-watermark") {
        context.rotate(-20 * Math.PI / 180);
        for (let y = -height; y < height * 2; y += 120) for (let x = -width; x < width * 2; x += 220) context.fillText(values.text, x, y);
      } else { context.textAlign = "right"; context.textBaseline = "bottom"; context.fillText(values.text, width - 24, height - 20); }
      context.restore();
    }
    if (toolId === "image-watermark" && overlayBitmap) {
      const targetWidth = width * 0.24; const targetHeight = overlayBitmap.height * targetWidth / overlayBitmap.width;
      context.save(); context.globalAlpha = 0.75; context.drawImage(overlayBitmap, width - targetWidth - 20, height - targetHeight - 20, targetWidth, targetHeight); context.restore();
    }
    if (["image-mosaic", "image-redact"].includes(toolId)) {
      const x = Math.round(width * values.x / 100); const y = Math.round(height * values.y / 100);
      const regionWidth = Math.max(1, Math.round(width * values.regionWidth / 100)); const regionHeight = Math.max(1, Math.round(height * values.regionHeight / 100));
      if (toolId === "image-redact") { context.fillStyle = "#000"; context.fillRect(x, y, regionWidth, regionHeight); }
      else {
        const small = document.createElement("canvas"); small.width = Math.max(1, Math.round(regionWidth / 14)); small.height = Math.max(1, Math.round(regionHeight / 14));
        small.getContext("2d").drawImage(canvas, x, y, regionWidth, regionHeight, 0, 0, small.width, small.height);
        context.imageSmoothingEnabled = false; context.drawImage(small, 0, 0, small.width, small.height, x, y, regionWidth, regionHeight); context.imageSmoothingEnabled = true;
      }
    }
    return canvas;
  }

  function extractColors(canvas, count = 8) {
    const context = canvas.getContext("2d");
    const sample = document.createElement("canvas"); sample.width = 80; sample.height = 80;
    sample.getContext("2d").drawImage(canvas, 0, 0, 80, 80);
    const data = sample.getContext("2d").getImageData(0, 0, 80, 80).data;
    const colors = new Map();
    for (let index = 0; index < data.length; index += 16) {
      if (data[index + 3] < 128) continue;
      const rgb = [data[index], data[index + 1], data[index + 2]].map((value) => Math.round(value / 32) * 32).map((value) => Math.min(255, value));
      const key = rgb.join(","); colors.set(key, (colors.get(key) || 0) + 1);
    }
    return [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, count).map(([key]) => `#${key.split(",").map((value) => Number(value).toString(16).padStart(2, "0")).join("")}`);
  }

  function readExifField(bytes, view, tiffStart, entryOffset, littleEndian) {
    if (entryOffset + 12 > bytes.length) return null;
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const unitSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] || 0;
    const byteLength = count * unitSize;
    if (!unitSize || !Number.isSafeInteger(byteLength) || byteLength > bytes.length) return null;
    const dataOffset = byteLength <= 4 ? entryOffset + 8 : tiffStart + view.getUint32(entryOffset + 8, littleEndian);
    if (dataOffset < 0 || dataOffset + byteLength > bytes.length) return null;
    if (type === 2) return new TextDecoder("ascii").decode(bytes.slice(dataOffset, dataOffset + byteLength)).replace(/\0+$/, "").trim();
    if (type === 3) return view.getUint16(dataOffset, littleEndian);
    if (type === 4) return view.getUint32(dataOffset, littleEndian);
    return null;
  }

  function parseExifIfd(bytes, view, tiffStart, relativeOffset, littleEndian) {
    const start = tiffStart + Number(relativeOffset || 0);
    if (start < 0 || start + 2 > bytes.length) return new Map();
    const count = view.getUint16(start, littleEndian);
    if (count > 512 || start + 2 + count * 12 > bytes.length) return new Map();
    const fields = new Map();
    for (let index = 0; index < count; index += 1) {
      const entry = start + 2 + index * 12;
      const tag = view.getUint16(entry, littleEndian);
      const value = readExifField(bytes, view, tiffStart, entry, littleEndian);
      if (value !== null && value !== "") fields.set(tag, value);
    }
    return fields;
  }

  function exifSummary(bytes) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return "不是 JPEG 文件；当前查看器只解析 JPEG EXIF，图片仍然只在本机读取。";
    let offset = 2;
    let app1 = 0;
    let fields = new Map();
    let exifFields = new Map();
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
      const segmentEnd = offset + 2 + length;
      if (length < 2 || segmentEnd > bytes.length) break;
      const payload = offset + 4;
      if (marker === 0xe1) {
        app1 += 1;
        const exifHeader = bytes[payload] === 0x45 && bytes[payload + 1] === 0x78 && bytes[payload + 2] === 0x69 && bytes[payload + 3] === 0x66 && bytes[payload + 4] === 0 && bytes[payload + 5] === 0;
        if (exifHeader) {
          const tiffStart = payload + 6;
          if (tiffStart + 8 <= segmentEnd) {
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const littleEndian = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
            const bigEndian = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
            if ((littleEndian || bigEndian) && view.getUint16(tiffStart + 2, littleEndian) === 42) {
              fields = parseExifIfd(bytes, view, tiffStart, view.getUint32(tiffStart + 4, littleEndian), littleEndian);
              if (fields.has(0x8769)) exifFields = parseExifIfd(bytes, view, tiffStart, fields.get(0x8769), littleEndian);
            }
          }
        }
      }
      offset = segmentEnd;
    }
    const orientationNames = { 1: "正常", 2: "水平镜像", 3: "旋转 180°", 4: "垂直镜像", 5: "镜像并旋转 90°", 6: "旋转 90°", 7: "镜像并旋转 270°", 8: "旋转 270°" };
    const details = [
      `JPEG APP1 区块：${app1}`,
      `相机厂商：${fields.get(0x010f) || "未记录"}`,
      `相机型号：${fields.get(0x0110) || "未记录"}`,
      `拍摄时间：${exifFields.get(0x9003) || fields.get(0x0132) || "未记录"}`,
      `镜头型号：${exifFields.get(0xa434) || "未记录"}`,
      `方向：${orientationNames[fields.get(0x0112)] || fields.get(0x0112) || "未记录"}`,
      `图像尺寸：${exifFields.get(0xa002) && exifFields.get(0xa003) ? `${exifFields.get(0xa002)} × ${exifFields.get(0xa003)}` : "未记录"}`,
      `GPS 标签：${fields.has(0x8825) ? "检测到，分享前建议移除" : "未检测到"}`,
      "说明：仅在浏览器本地读取，不显示具体定位坐标。",
    ];
    return details.join("\n");
  }

  function stripJpegMetadata(bytes) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
    const parts = [bytes.slice(0, 2)];
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff || offset + 1 >= bytes.length) { parts.push(bytes.slice(offset)); break; }
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) { parts.push(bytes.slice(offset)); break; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { parts.push(bytes.slice(offset, offset + 2)); offset += 2; continue; }
      if (offset + 4 > bytes.length) break;
      const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
      const segmentEnd = offset + 2 + length;
      if (length < 2 || segmentEnd > bytes.length) { parts.push(bytes.slice(offset)); break; }
      if (marker !== 0xe1 && marker !== 0xfe) parts.push(bytes.slice(offset, segmentEnd));
      offset = segmentEnd;
    }
    return joinBytes(parts);
  }

  function imageFields(toolId) {
    const fields = [];
    if (toolId === "image-resize") fields.push('<label><span>宽度</span><input id="imageWidth" data-config="width" type="number" min="1" value="1200" /></label><label><span>高度</span><input id="imageHeight" data-config="height" type="number" min="1" value="800" /></label>');
    if (toolId === "image-scale") fields.push('<label><span>缩放百分比</span><input id="imageScale" data-config="scale" type="number" min="1" max="1000" value="50" /></label>');
    if (["image-compress", "image-batch-compress", "image-format"].includes(toolId)) fields.push('<label><span>格式</span><select id="imageFormat" data-config="format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label><label><span>质量</span><input id="imageQuality" data-config="quality" type="number" min="10" max="100" value="85" /></label>');
    if (toolId === "image-rotate") fields.push('<label><span>旋转角度</span><select id="imageAngle" data-config="angle"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>');
    if (toolId === "image-flip") fields.push('<label><span>翻转方向</span><select id="imageFlip" data-config="flip"><option value="horizontal">水平翻转</option><option value="vertical">垂直翻转</option><option value="both">水平并垂直</option></select></label>');
    if (toolId === "image-rounded") fields.push('<label><span>圆角半径</span><input id="imageRadius" data-config="radius" type="number" min="0" value="32" /></label>');
    if (["text-watermark", "tile-watermark"].includes(toolId)) fields.push('<label><span>水印文字</span><input id="imageWatermarkText" data-config="text" value="WYJ" /></label><label><span>水印颜色</span><input id="imageColor" data-config="color" type="color" value="#7ed8ff" /></label>');
    if (["image-crop", "image-mosaic", "image-redact"].includes(toolId)) fields.push('<label><span>左侧 %</span><input id="imageRegionX" data-config="x" type="number" min="0" max="100" value="25" /></label><label><span>顶部 %</span><input id="imageRegionY" data-config="y" type="number" min="0" max="100" value="25" /></label><label><span>宽度 %</span><input id="imageRegionWidth" data-config="regionWidth" type="number" min="1" max="100" value="50" /></label><label><span>高度 %</span><input id="imageRegionHeight" data-config="regionHeight" type="number" min="1" max="100" value="30" /></label>');
    if (toolId === "image-blur") fields.push('<label><span>模糊半径</span><input id="imageBlur" data-config="blur" type="number" min="0" max="40" value="8" /></label>');
    if (["gradient-generator", "gradient-css"].includes(toolId)) fields.push('<label><span>起始色</span><input id="imageColor" data-config="color" type="color" value="#07111f" /></label><label><span>结束色</span><input id="imageGradientEnd" data-config="gradientEnd" type="color" value="#246da8" /></label><label><span>角度</span><input id="imageGradientAngle" data-config="gradientAngle" type="number" value="135" /></label>');
    if (toolId === "color-convert") fields.push('<label class="tool-wide"><span>HEX、RGB 或 HSL</span><input id="imageColorText" data-config="color" value="#246da8" placeholder="#246da8 / rgb(36,109,168) / hsl(204,65%,40%)" /></label>');
    if (toolId === "solid-image") fields.push('<label><span>颜色</span><input id="imageColor" data-config="color" type="color" value="#246da8" /></label>');
    if (["solid-image", "gradient-generator"].includes(toolId)) fields.push('<label><span>宽度</span><input id="imageWidth" data-config="width" type="number" min="1" value="1200" /></label><label><span>高度</span><input id="imageHeight" data-config="height" type="number" min="1" value="630" /></label>');
    return fields.join("");
  }

  async function processImageTool(tool, files, overlayFile) {
    const values = imageControlValues();
    if (tool.id === "color-convert") {
      const [red, green, blue] = parseColorValue(values.color); const [hue, saturation, light] = rgbToHsl(red, green, blue);
      const hex = rgbToHex(red, green, blue).toUpperCase();
      const canvas = document.createElement("canvas"); canvas.width = 480; canvas.height = 180;
      const context = canvas.getContext("2d"); context.fillStyle = hex; context.fillRect(0, 0, canvas.width, canvas.height);
      return { text: `${hex}\nRGB(${red}, ${green}, ${blue})\nHSL(${hue}, ${saturation}%, ${light}%)`, canvas };
    }
    if (["gradient-generator", "gradient-css", "solid-image"].includes(tool.id)) {
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.min(4096, values.width || 1200)); canvas.height = Math.max(1, Math.min(4096, values.height || 630));
      const context = canvas.getContext("2d");
      if (tool.id === "solid-image") context.fillStyle = values.color;
      else {
        const angle = values.gradientAngle * Math.PI / 180; const x = Math.cos(angle); const y = Math.sin(angle);
        const gradient = context.createLinearGradient(canvas.width * (0.5 - x / 2), canvas.height * (0.5 - y / 2), canvas.width * (0.5 + x / 2), canvas.height * (0.5 + y / 2));
        gradient.addColorStop(0, values.color); gradient.addColorStop(1, values.gradientEnd); context.fillStyle = gradient;
      }
      context.fillRect(0, 0, canvas.width, canvas.height);
      const code = tool.id === "solid-image" ? `background: ${values.color};` : `background: linear-gradient(${values.gradientAngle}deg, ${values.color}, ${values.gradientEnd});`;
      if (tool.id === "gradient-css") return { text: code, canvas };
      return { text: code, canvas, blob: await canvasBlob(canvas), name: `${tool.id}-${Date.now()}.png` };
    }
    if (!files.length) throw new Error("请选择图片");
    if (tool.id === "image-pdf") {
      const images = await Promise.all(files.map(fileToJpeg));
      return { text: `已生成 ${images.length} 页 PDF`, blob: new Blob([pdfBytesFromJpegs(images)], { type: "application/pdf" }), name: `image-${Date.now()}.pdf` };
    }
    if (["exif-view", "gps-warning"].includes(tool.id)) return { text: exifSummary(new Uint8Array(await files[0].arrayBuffer())) };
    const batch = ["image-batch-compress"].includes(tool.id);
    const sourceFiles = batch ? files : [files[0]];
    const overlay = overlayFile ? await bitmapFromFile(overlayFile) : null;
    const outputs = [];
    let previewCanvas = null;
    for (const file of sourceFiles) {
      const bitmap = await bitmapFromFile(file);
      const effectiveTool = tool.id === "image-batch-compress" ? "image-compress" : ["exif-remove", "favicon-generator", "multi-icon-zip", "color-extract"].includes(tool.id) ? "image-format" : tool.id;
      let canvas = await imageCanvas(effectiveTool, bitmap, values, overlay);
      if (tool.id === "favicon-generator") {
        const resized = document.createElement("canvas"); resized.width = 32; resized.height = 32; resized.getContext("2d").drawImage(canvas, 0, 0, 32, 32); canvas = resized;
      }
      previewCanvas = canvas;
      if (tool.id === "color-extract") { releaseBitmap(bitmap); releaseBitmap(overlay); return { text: extractColors(canvas).join("\n"), canvas }; }
      if (tool.id === "exif-remove" && file.type === "image/jpeg") {
        const cleanBytes = stripJpegMetadata(new Uint8Array(await file.arrayBuffer()));
        const blob = new Blob([cleanBytes], { type: "image/jpeg" });
        outputs.push({ name: `${file.name.replace(/\.[^.]+$/, "")}-metadata-removed.jpg`, data: cleanBytes, blob });
        releaseBitmap(bitmap);
        continue;
      }
      if (tool.id === "multi-icon-zip") {
        const entries = [];
        for (const size of [16, 32, 48, 64, 128, 192, 512]) {
          const icon = document.createElement("canvas"); icon.width = size; icon.height = size; icon.getContext("2d").drawImage(canvas, 0, 0, size, size);
          entries.push({ name: `icon-${size}.png`, data: new Uint8Array(await (await canvasBlob(icon)).arrayBuffer()) });
        }
        releaseBitmap(bitmap); releaseBitmap(overlay);
        return { text: "已生成 7 种尺寸图标", canvas, blob: zipBlob(entries), name: `icons-${Date.now()}.zip` };
      }
      const format = tool.id === "image-format" || tool.id.includes("compress")
        ? values.format
        : tool.id === "exif-remove" && file.type === "image/webp" ? "image/webp" : "image/png";
      const blob = await canvasBlob(canvas, format, values.quality);
      const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
      outputs.push({ name: `${file.name.replace(/\.[^.]+$/, "")}-${tool.id}.${extension}`, data: new Uint8Array(await blob.arrayBuffer()), blob });
      releaseBitmap(bitmap);
    }
    releaseBitmap(overlay);
    if (outputs.length > 1) return { text: `已处理 ${outputs.length} 张图片`, canvas: previewCanvas, blob: zipBlob(outputs), name: `images-${Date.now()}.zip` };
    return { text: `输出大小：${formatBytes(outputs[0].blob.size)}`, canvas: previewCanvas, blob: outputs[0].blob, name: outputs[0].name };
  }

  function renderImageTool(tool) {
    const standalone = ["color-convert", "gradient-generator", "gradient-css", "solid-image"].includes(tool.id);
    const multiple = ["image-batch-compress", "image-pdf"].includes(tool.id);
    byId("toolWorkbenchBody").innerHTML = `<div class="tool-form image-tool-form">
      ${standalone ? "" : `<label class="file-drop"><span>选择${multiple ? "一组" : "一张"}图片</span><input id="imageToolInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" ${multiple ? "multiple" : ""} /></label>`}
      ${tool.id === "image-watermark" ? '<label class="file-drop"><span>选择水印图片</span><input id="imageOverlayInput" type="file" accept="image/*" /></label>' : ""}
      <p class="local-processing-note">图片在本地浏览器中处理。批量操作最多 20 张、总计 50 MB。</p>
      <div class="tool-options">${imageFields(tool.id)}</div>
      <div class="tool-command-row"><button class="primary" id="runImageToolBtn" type="button">开始处理</button><button id="downloadImageToolBtn" type="button" disabled>下载结果</button><button id="copyImageTextBtn" type="button">复制结果信息</button></div>
      <pre class="file-result" id="imageToolResult">等待处理</pre><div class="image-preview" id="imageToolPreview"></div>
      ${renderConfigControls(tool.id)}
    </div>`;
    currentDownload = null;
    byId("runImageToolBtn").addEventListener("click", async () => {
      const button = byId("runImageToolBtn"); button.disabled = true; setMessage("正在本地处理…");
      try {
        const files = standalone ? [] : await readLocalFiles(byId("imageToolInput"), 20, 50 * 1024 * 1024);
        const result = await processImageTool(tool, files, byId("imageOverlayInput")?.files?.[0]);
        byId("imageToolResult").textContent = result.text || "处理完成";
        const preview = byId("imageToolPreview"); preview.innerHTML = "";
        if (result.canvas) { const shown = document.createElement("canvas"); const scale = Math.min(1, 720 / result.canvas.width, 460 / result.canvas.height); shown.width = Math.max(1, Math.round(result.canvas.width * scale)); shown.height = Math.max(1, Math.round(result.canvas.height * scale)); shown.getContext("2d").drawImage(result.canvas, 0, 0, shown.width, shown.height); preview.appendChild(shown); }
        currentDownload = result.blob ? { blob: result.blob, name: result.name } : null;
        byId("downloadImageToolBtn").disabled = !currentDownload;
        setMessage("本地处理完成");
      } catch (error) { setMessage(error.message, true); }
      finally { button.disabled = false; }
    });
    byId("downloadImageToolBtn").addEventListener("click", () => currentDownload && downloadBlob(currentDownload.name, currentDownload.blob));
    byId("copyImageTextBtn").addEventListener("click", (event) => copyText(byId("imageToolResult").textContent, event.currentTarget));
    bindConfigControls();
  }
  function shareUrl(type, id) {
    return `${location.origin}/share/${type}/${encodeURIComponent(id)}`;
  }

  function showQrCode(target, value) {
    target.innerHTML = "";
    if (typeof window.qrcode !== "function") {
      const fallback = document.createElement("p"); fallback.textContent = "二维码组件未加载，请复制链接"; target.appendChild(fallback); return;
    }
    try {
      const qr = window.qrcode(0, "M"); qr.addData(String(value)); qr.make();
      const image = document.createElement("img"); image.src = qr.createDataURL(6, 12); image.alt = "分享二维码"; target.appendChild(image);
      const download = document.createElement("a"); download.href = image.src; download.download = `qr-${Date.now()}.gif`; download.textContent = "下载二维码"; target.appendChild(download);
    } catch (error) {
      const fallback = document.createElement("p"); fallback.textContent = `内容过长，无法生成二维码：${error.message}`; target.appendChild(fallback);
    }
  }

  function temporaryCommonFields(defaultMinutes = 60) {
    return `<div class="tool-options">
      <label><span>有效分钟</span><input id="tempMinutes" data-config="minutes" type="number" min="1" max="10080" value="${defaultMinutes}" /></label>
      <label><span>访问密码（可空）</span><input id="tempPassword" type="password" maxlength="128" autocomplete="new-password" /></label>
      <label class="admin-checkbox"><input id="tempDestroy" data-config="destroy" type="checkbox" /> 首次读取后销毁</label>
    </div>`;
  }

  function renderTemporaryResult(container, label, value, qrValue = "") {
    container.innerHTML = "";
    const title = document.createElement("strong"); title.textContent = label;
    const code = document.createElement("code"); code.textContent = value;
    const copy = document.createElement("button"); copy.type = "button"; copy.textContent = "复制"; copy.addEventListener("click", () => copyText(value, copy));
    container.append(title, code, copy);
    if (qrValue) { const qr = document.createElement("div"); qr.className = "temporary-qr-output"; container.appendChild(qr); showQrCode(qr, qrValue); }
  }

  function renderTemporaryText(tool) {
    byId("toolWorkbenchBody").innerHTML = `<div class="tool-form temporary-tool-form">
      <label class="tool-wide"><span>临时文本</span><textarea id="tempContent" maxlength="102400"></textarea></label>
      ${temporaryCommonFields(60)}
      <label><span>最大访问次数</span><input id="tempMaxViews" data-config="maxViews" type="number" min="1" max="1000" value="10" /></label>
      <div class="tool-command-row"><button class="primary" id="createTempBtn" type="button">生成分享链接</button></div>
      <div class="temporary-result" id="temporaryResult"></div>${renderConfigControls(tool.id)}
    </div>`;
    byId("createTempBtn").addEventListener("click", async () => {
      try {
        const data = await bridge.api("/api/temporary/text", {
          content: byId("tempContent").value, password: byId("tempPassword").value,
          minutes: byId("tempMinutes").value, max_views: byId("tempMaxViews").value,
          destroy_after_read: byId("tempDestroy").checked,
        });
        const url = shareUrl("text", data.share.id); renderTemporaryResult(byId("temporaryResult"), "分享链接", url, url); setMessage(`有效至 ${bridge.formatDate(data.share.expires_at)}`);
      } catch (error) { setMessage(error.message, true); }
    });
    bindConfigControls();
  }

  function renderTemporaryFile(tool) {
    byId("toolWorkbenchBody").innerHTML = `<div class="tool-form temporary-tool-form">
      <label class="file-drop"><span>选择临时文件（最大 350 KB）</span><input id="tempFileInput" type="file" accept=".txt,.csv,.json,.pdf,.png,.jpg,.jpeg,.webp,.gif,.zip" /></label>
      ${temporaryCommonFields(60)}
      <label><span>最大下载次数</span><input id="tempMaxDownloads" data-config="maxDownloads" type="number" min="1" max="100" value="5" /></label>
      <div class="tool-command-row"><button class="primary" id="createTempBtn" type="button">上传并生成链接</button></div>
      <div class="temporary-result" id="temporaryResult"></div>${renderConfigControls(tool.id)}
    </div>`;
    byId("createTempBtn").addEventListener("click", async () => {
      try {
        const file = byId("tempFileInput").files?.[0]; if (!file) throw new Error("请选择文件"); if (file.size > 350 * 1024) throw new Error("临时文件不能超过 350 KB");
        const bytes = new Uint8Array(await file.arrayBuffer()); let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        const data = await bridge.api("/api/temporary/file", {
          file_name: file.name, mime_type: file.type || "application/octet-stream", base64: btoa(binary),
          password: byId("tempPassword").value, minutes: byId("tempMinutes").value,
          max_downloads: byId("tempMaxDownloads").value, destroy_after_download: byId("tempDestroy").checked,
        });
        const url = shareUrl("file", data.file.id); renderTemporaryResult(byId("temporaryResult"), "下载链接", url, url); setMessage(`已安全保存，${formatBytes(data.file.size_bytes)}，有效至 ${bridge.formatDate(data.file.expires_at)}`);
      } catch (error) { setMessage(error.message, true); }
    });
    bindConfigControls();
  }

  function renderTemporaryClipboard(tool) {
    byId("toolWorkbenchBody").innerHTML = `<div class="tool-form temporary-tool-form">
      <label class="tool-wide"><span>要发送的文本</span><textarea id="tempContent" maxlength="102400"></textarea></label>
      <div class="tool-options"><label><span>有效分钟</span><input id="tempMinutes" data-config="minutes" type="number" min="1" max="10080" value="10" /></label><label class="admin-checkbox"><input id="tempDestroy" data-config="destroy" type="checkbox" checked /> 首次读取后销毁</label></div>
      <div class="tool-command-row"><button class="primary" id="createTempBtn" type="button">生成六位连接码</button></div>
      <div class="temporary-result" id="temporaryResult"></div>
      <hr /><div class="tool-options"><label><span>读取连接码</span><input id="clipboardReadCode" inputmode="numeric" maxlength="6" /></label><button id="readClipboardBtn" type="button">读取</button></div><pre class="share-output" id="clipboardReadOutput"></pre>
      ${renderConfigControls(tool.id)}
    </div>`;
    byId("createTempBtn").addEventListener("click", async () => {
      try {
        const data = await bridge.api("/api/temporary/clipboard", { content: byId("tempContent").value, minutes: byId("tempMinutes").value, destroy_after_read: byId("tempDestroy").checked });
        const url = shareUrl("clipboard", data.clipboard.code); renderTemporaryResult(byId("temporaryResult"), "六位连接码", data.clipboard.code, url); setMessage(`有效至 ${bridge.formatDate(data.clipboard.expires_at)}`);
      } catch (error) { setMessage(error.message, true); }
    });
    byId("readClipboardBtn").addEventListener("click", async () => {
      try { const data = await bridge.publicApi("/api/share/clipboard/read", { code: byId("clipboardReadCode").value }); byId("clipboardReadOutput").textContent = data.clipboard.content; setMessage(data.clipboard.destroyed ? "已读取并销毁" : "读取成功"); }
      catch (error) { setMessage(error.message, true); }
    });
    bindConfigControls();
  }

  function qrStructuredFields(kind) {
    if (kind === "url") return '<label class="tool-wide"><span>网址</span><input id="qrUrl" data-config="url" inputmode="url" placeholder="https://example.com" /></label>';
    if (kind === "wifi") return `<div class="tool-options tool-wide">
      <label><span>网络名称（SSID）</span><input id="qrWifiName" data-config="wifiName" maxlength="128" /></label>
      <label><span>安全类型</span><select id="qrWifiSecurity" data-config="wifiSecurity"><option value="WPA">WPA/WPA2/WPA3</option><option value="WEP">WEP</option><option value="nopass">无密码</option></select></label>
      <label><span>Wi-Fi 密码</span><input id="qrWifiPassword" data-config="wifiPassword" type="password" maxlength="128" autocomplete="new-password" /></label>
      <label class="admin-checkbox"><input id="qrWifiHidden" data-config="wifiHidden" type="checkbox" /> 隐藏网络</label>
    </div>`;
    if (kind === "contact") return `<div class="tool-options tool-wide">
      <label><span>姓名</span><input id="qrContactName" data-config="contactName" maxlength="100" /></label>
      <label><span>电话</span><input id="qrContactPhone" data-config="contactPhone" inputmode="tel" maxlength="50" /></label>
      <label><span>邮箱</span><input id="qrContactEmail" data-config="contactEmail" inputmode="email" maxlength="254" /></label>
      <label><span>组织</span><input id="qrContactOrg" data-config="contactOrg" maxlength="100" /></label>
      <label class="tool-wide"><span>网址（可空）</span><input id="qrContactUrl" data-config="contactUrl" inputmode="url" maxlength="500" /></label>
    </div>`;
    return '<label class="tool-wide"><span>文本内容</span><textarea id="qrText" data-config="text" maxlength="3000"></textarea></label>';
  }

  function escapeWifiValue(value) {
    return String(value || "").replace(/([\\;,:"])/g, "\\$1");
  }

  function escapeVcardValue(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([;,])/g, "\\$1");
  }

  function temporaryQrContent(kind) {
    if (kind === "url") {
      const value = byId("qrUrl").value.trim();
      let url;
      try { url = new URL(value); } catch (_error) { throw new Error("请输入完整网址，例如 https://example.com"); }
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("网址只支持 http 或 https");
      return url.href;
    }
    if (kind === "wifi") {
      const name = byId("qrWifiName").value.trim(); if (!name) throw new Error("请输入 Wi-Fi 网络名称");
      const security = byId("qrWifiSecurity").value;
      const password = byId("qrWifiPassword").value;
      if (security !== "nopass" && !password) throw new Error("请输入 Wi-Fi 密码，或将安全类型改为无密码");
      return `WIFI:T:${security};S:${escapeWifiValue(name)};P:${escapeWifiValue(password)};H:${byId("qrWifiHidden").checked ? "true" : "false"};;`;
    }
    if (kind === "contact") {
      const name = byId("qrContactName").value.trim();
      const phone = byId("qrContactPhone").value.trim();
      const email = byId("qrContactEmail").value.trim();
      const organization = byId("qrContactOrg").value.trim();
      const website = byId("qrContactUrl").value.trim();
      if (![name, phone, email, organization, website].some(Boolean)) throw new Error("请至少填写一项联系人信息");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("联系人邮箱格式不正确");
      if (website) { try { new URL(website); } catch (_error) { throw new Error("联系人网址格式不正确"); } }
      return ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVcardValue(name || organization || phone || email)}`, phone && `TEL:${escapeVcardValue(phone)}`, email && `EMAIL:${escapeVcardValue(email)}`, organization && `ORG:${escapeVcardValue(organization)}`, website && `URL:${website}`, "END:VCARD"].filter(Boolean).join("\r\n");
    }
    const value = byId("qrText").value.trim(); if (!value) throw new Error("请输入二维码文本");
    return value;
  }

  function renderTemporaryQr(tool) {
    byId("toolWorkbenchBody").innerHTML = `<div class="tool-form temporary-tool-form">
      <label><span>二维码类型</span><select id="qrKind" data-config="kind"><option value="text">文本</option><option value="url">URL</option><option value="wifi">Wi-Fi</option><option value="contact">联系信息</option></select></label>
      <div class="tool-wide" id="qrStructuredFields"></div>
      <label class="admin-checkbox"><input id="qrDynamic" data-config="dynamic" type="checkbox" /> 生成会自动失效的临时链接</label>
      <div class="tool-wide hidden" id="qrDynamicOptions">${temporaryCommonFields(60)}
        <label><span>最大访问次数</span><input id="tempMaxViews" data-config="maxViews" type="number" min="1" max="1000" value="10" /></label>
      </div>
      <div class="tool-command-row"><button class="primary" id="createTempBtn" type="button">生成二维码</button></div>
      <div class="temporary-result" id="temporaryResult"></div>${renderConfigControls(tool.id)}
    </div>`;
    const updateFields = () => { byId("qrStructuredFields").innerHTML = qrStructuredFields(byId("qrKind").value); };
    const updateDynamic = () => byId("qrDynamicOptions").classList.toggle("hidden", !byId("qrDynamic").checked);
    byId("qrKind").addEventListener("change", updateFields);
    byId("qrDynamic").addEventListener("change", updateDynamic);
    updateFields();
    updateDynamic();
    byId("createTempBtn").addEventListener("click", async () => {
      try {
        const kind = byId("qrKind").value;
        const content = temporaryQrContent(kind);
        if (byId("qrDynamic").checked) {
          const data = await bridge.api("/api/temporary/qr", { content, kind, password: byId("tempPassword").value, minutes: byId("tempMinutes").value, max_views: byId("tempMaxViews").value, destroy_after_read: byId("tempDestroy").checked });
          const url = shareUrl("qr", data.share.id); renderTemporaryResult(byId("temporaryResult"), "动态二维码链接", url, url); setMessage(`动态内容有效至 ${bridge.formatDate(data.share.expires_at)}`);
        } else {
          renderTemporaryResult(byId("temporaryResult"), "二维码内容", content, content); setMessage("静态二维码只在本机生成");
        }
      } catch (error) { setMessage(error.message, true); }
    });
    bindConfigControls();
  }

  function renderRoomMessages(room) {
    const target = byId("roomMessages"); if (!target) return; target.innerHTML = "";
    (room.messages || []).forEach((message) => { const article = document.createElement("article"); const strong = document.createElement("strong"); strong.textContent = message.author; const time = document.createElement("time"); time.textContent = bridge.formatDate(message.created_at); const paragraph = document.createElement("p"); paragraph.textContent = message.message; article.append(strong, time, paragraph); target.appendChild(article); });
  }

  function renderTemporaryRoom(tool) {
    byId("toolWorkbenchBody").innerHTML = `<div class="tool-form temporary-tool-form">
      ${temporaryCommonFields(60)}<label><span>最大消息数</span><input id="roomMaxMessages" data-config="maxMessages" type="number" min="1" max="200" value="50" /></label>
      <div class="tool-command-row"><button class="primary" id="createTempBtn" type="button">创建私密房间</button></div><div class="temporary-result" id="temporaryResult"></div>
      <hr /><div class="tool-options"><label><span>房间 ID</span><input id="roomId" /></label><label><span>房间密码</span><input id="roomPassword" type="password" /></label><button id="openRoomBtn" type="button">打开房间</button></div>
      <div class="room-messages" id="roomMessages"></div><div class="tool-options"><label><span>显示名称</span><input id="roomAuthor" maxlength="30" value="访客" /></label><label class="tool-wide"><span>留言</span><textarea id="roomMessage" maxlength="4000"></textarea></label><button id="postRoomBtn" type="button">发送留言</button><button id="clearRoomBtn" type="button">清空我的房间</button></div>
      ${renderConfigControls(tool.id)}
    </div>`;
    byId("createTempBtn").addEventListener("click", async () => {
      try {
        const data = await bridge.api("/api/temporary/room", { password: byId("tempPassword").value, minutes: byId("tempMinutes").value, max_messages: byId("roomMaxMessages").value });
        byId("roomId").value = data.room.id; byId("roomPassword").value = byId("tempPassword").value;
        const url = shareUrl("room", data.room.id); renderTemporaryResult(byId("temporaryResult"), "房间链接", url, url); setMessage(`有效至 ${bridge.formatDate(data.room.expires_at)}`);
      } catch (error) { setMessage(error.message, true); }
    });
    const refreshRoom = async () => { const data = await bridge.publicApi("/api/share/room/read", { id: byId("roomId").value, password: byId("roomPassword").value }); renderRoomMessages(data.room); return data; };
    byId("openRoomBtn").addEventListener("click", () => refreshRoom().then(() => setMessage("房间已打开")).catch((error) => setMessage(error.message, true)));
    byId("postRoomBtn").addEventListener("click", async () => { try { const data = await bridge.publicApi("/api/share/room/post", { id: byId("roomId").value, password: byId("roomPassword").value, author: byId("roomAuthor").value, message: byId("roomMessage").value }); byId("roomMessage").value = ""; renderRoomMessages(data.room); setMessage("留言已发送"); } catch (error) { setMessage(error.message, true); } });
    byId("clearRoomBtn").addEventListener("click", async () => { try { await bridge.api("/api/temporary/room/clear", { id: byId("roomId").value }); await refreshRoom(); setMessage("房间已清空"); } catch (error) { setMessage(error.message, true); } });
    bindConfigControls();
  }

  function renderTemporaryTool(tool) {
    if (tool.id === "temporary-text") renderTemporaryText(tool);
    else if (tool.id === "temporary-file") renderTemporaryFile(tool);
    else if (tool.id === "temporary-clipboard") renderTemporaryClipboard(tool);
    else if (tool.id === "temporary-qr") renderTemporaryQr(tool);
    else renderTemporaryRoom(tool);
  }

  function bytesFromBase64(value) {
    const binary = atob(value); return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  function showShareViewer(path) {
    const match = path.match(/^\/share\/(text|file|clipboard|qr|room)\/([^/?#]+)/);
    if (!match) return false;
    const [, type, rawId] = match; const id = decodeURIComponent(rawId);
    const titleMap = { text: "临时文本", file: "临时文件", clipboard: "临时剪贴板", qr: "临时二维码", room: "临时留言房间" };
    byId("shareViewerTitle").textContent = titleMap[type]; byId("shareViewerMeta").textContent = "内容可能在读取后立即销毁，请确认后再打开。";
    byId("shareViewerOutput").classList.add("hidden"); byId("shareViewerOutput").textContent = ""; byId("shareViewerMessage").textContent = "";
    byId("sharePasswordField").classList.toggle("hidden", type === "clipboard");
    byId("shareViewerExtra").innerHTML = type === "room" ? '<label class="field-label"><span>显示名称</span><input id="shareRoomAuthor" maxlength="30" value="访客" /></label><label class="field-label"><span>留言</span><textarea id="shareRoomMessage" maxlength="4000"></textarea></label>' : "";
    byId("shareViewer").classList.remove("hidden"); byId("shareViewer").setAttribute("aria-hidden", "false");
    byId("openShareBtn").onclick = async () => {
      const message = byId("shareViewerMessage"); message.textContent = "正在打开…";
      try {
        if (type === "clipboard") {
          const data = await bridge.publicApi("/api/share/clipboard/read", { code: id }); byId("shareViewerOutput").textContent = data.clipboard.content;
        } else if (type === "file") {
          const data = await bridge.publicApi("/api/share/file/read", { id, password: byId("sharePasswordInput").value }); const bytes = bytesFromBase64(data.file.base64); downloadBlob(data.file.file_name, new Blob([bytes], { type: data.file.mime_type })); byId("shareViewerOutput").textContent = `文件 ${data.file.file_name} 已开始下载`;
        } else if (type === "room") {
          if (byId("shareRoomMessage")?.value.trim()) await bridge.publicApi("/api/share/room/post", { id, password: byId("sharePasswordInput").value, author: byId("shareRoomAuthor").value, message: byId("shareRoomMessage").value });
          const data = await bridge.publicApi("/api/share/room/read", { id, password: byId("sharePasswordInput").value }); byId("shareViewerOutput").textContent = data.room.messages.map((item) => `${item.author} · ${bridge.formatDate(item.created_at)}\n${item.message}`).join("\n\n") || "房间暂无留言";
        } else {
          const data = await bridge.publicApi("/api/share/text/read", { id, password: byId("sharePasswordInput").value }); byId("shareViewerOutput").textContent = data.share.content;
          if (type === "qr") { const qr = document.createElement("div"); qr.className = "temporary-qr-output"; byId("shareViewerExtra").innerHTML = ""; byId("shareViewerExtra").appendChild(qr); showQrCode(qr, data.share.content); }
        }
        byId("shareViewerOutput").classList.remove("hidden"); message.textContent = "打开成功";
      } catch (error) { message.textContent = error.message; }
    };
    return true;
  }

  window.WYJTools.showShareViewer = showShareViewer;
})();

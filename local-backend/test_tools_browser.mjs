import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE_URL = process.env.WYJ_TEST_BASE || "http://127.0.0.1:8892";
const CDP_URL = process.env.WYJ_CDP_URL || "http://127.0.0.1:9223";
const ADMIN_SECRET = process.env.WYJ_TEST_ADMIN_SECRET || "ToolMatrix-Admin-2026!";
const TEST_ROOT = path.join(ROOT, ".tool-e2e");
const RUN_ID = Date.now().toString(36);
const DOWNLOAD_ROOT = path.join(TEST_ROOT, `downloads-${RUN_ID}`);
const USERNAME = `toolmatrix${RUN_ID}`.slice(0, 32);
const USER_SECRET = "Tool-Matrix-User-2026!";

fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true });

const sample = (name) => path.join(TEST_ROOT, name);
const samples = {
  abc: sample("abc.txt"),
  text: sample("sample.txt"),
  text2: sample("sample2.txt"),
  csv: sample("data.csv"),
  csv2: sample("data2.csv"),
  objects: sample("objects.json"),
  array1: sample("array1.json"),
  array2: sample("array2.json"),
  png: sample("sample.png"),
  png2: sample("sample2.png"),
  jpeg: sample("sample.jpg"),
};

for (const [name, filePath] of Object.entries(samples)) {
  assert.ok(fs.existsSync(filePath), `missing ${name} sample: ${filePath}`);
}

async function api(pathname, payload = null, token = "", expected = [200]) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: payload === null ? "GET" : "POST",
    headers: {
      ...(payload === null ? {} : { "Content-Type": "application/json" }),
      ...(token ? { "X-Session-Token": token } : {}),
    },
    body: payload === null ? undefined : JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  assert.ok(expected.includes(response.status), `${pathname}: HTTP ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function createMember() {
  await api("/api/register", { username: USERNAME, secret: USER_SECRET, confirm_secret: USER_SECRET }, "", [201]);
  const login = await api("/api/login", { username: USERNAME, secret: USER_SECRET });
  const admin = await api("/api/login", { username: "wyj", secret: ADMIN_SECRET });
  await api("/api/admin/membership/manage", {
    user_id: login.account.id,
    action: "grant",
    plan_code: "all_access_lifetime",
    note: "exhaustive browser matrix",
  }, admin.session);
  const refreshed = await api("/api/me", null, login.session);
  assert.equal(refreshed.account.tools_access, true);
  return { session: login.session, account: refreshed.account };
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Set();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP websocket timeout")), 10_000);
      this.socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener("error", (event) => { clearTimeout(timer); reject(event.error || new Error("CDP websocket error")); }, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
        else request.resolve(message.result || {});
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  send(method, params = {}, sessionId = "") {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() {
    this.socket?.close();
  }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function connectBrowser() {
  const version = await fetch(`${CDP_URL}/json/version`).then((response) => response.json());
  const client = new CdpClient(version.webSocketDebuggerUrl);
  await client.connect();
  const target = await client.send("Target.createTarget", { url: "about:blank" });
  const attached = await client.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const send = (method, params = {}) => client.send(method, params, sessionId);
  await Promise.all([
    send("Page.enable"),
    send("DOM.enable"),
    send("Runtime.enable"),
    send("Log.enable"),
  ]);
  await client.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DOWNLOAD_ROOT,
    eventsEnabled: true,
  });
  return { client, targetId: target.targetId, sessionId, send };
}

async function main() {
  const member = await createMember();
  const browser = await connectBrowser();
  const { client, send, targetId } = browser;
  const runtimeErrors = [];
  client.listeners.add((message) => {
    if (message.sessionId && message.sessionId !== browser.sessionId) return;
    if (message.method === "Runtime.exceptionThrown") runtimeErrors.push(message.params?.exceptionDetails?.text || "runtime exception");
    if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params?.entry?.level)) {
      runtimeErrors.push(message.params.entry.text);
    }
  });

  const evaluate = async (expression, returnByValue = true) => {
    const response = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description || response.exceptionDetails.text;
      throw new Error(detail || "browser evaluation failed");
    }
    return returnByValue ? response.result?.value : response.result;
  };

  const waitFor = async (condition, timeout = 15_000, description = condition) => {
    const deadline = Date.now() + timeout;
    let lastError = "";
    while (Date.now() < deadline) {
      try {
        if (await evaluate(`Boolean(${condition})`)) return;
      } catch (error) {
        lastError = error.message;
      }
      await delay(80);
    }
    throw new Error(`timeout waiting for ${description}${lastError ? `: ${lastError}` : ""}`);
  };

  const setFields = async (fields) => evaluate(`(() => {
    const fields = ${JSON.stringify(fields)};
    for (const [selector, value] of Object.entries(fields)) {
      const element = document.querySelector(selector);
      if (!element) throw new Error('missing field ' + selector);
      if (element.type === 'checkbox') element.checked = Boolean(value);
      else element.value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  })()`);

  const click = async (selector) => evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('missing button ${selector}');
    if (element.disabled) throw new Error('disabled button ${selector}');
    element.click();
    return true;
  })()`);

  const setFiles = async (selector, files) => {
    const result = await evaluate(`document.querySelector(${JSON.stringify(selector)})`, false);
    assert.ok(result?.objectId, `missing file input ${selector}`);
    await send("DOM.setFileInputFiles", { objectId: result.objectId, files });
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new Event('change', { bubbles: true }))`);
  };

  const openTool = async (id) => {
    await evaluate(`window.WYJTools.openTool(${JSON.stringify(id)}, false)`);
    await waitFor(`document.querySelector('#toolWorkbenchTitle')?.textContent === window.WYJTools.tools.find(item => item.id === ${JSON.stringify(id)})?.name`, 5_000, `tool ${id}`);
    const description = await evaluate("document.querySelector('#toolWorkbenchDescription')?.textContent || ''");
    assert.ok(description.trim(), `${id} has no visible description`);
  };

  const readState = () => evaluate(`({
    message: document.querySelector('#toolWorkbenchMessage')?.textContent || '',
    textOutput: document.querySelector('#textToolOutput')?.value || '',
    randomOutput: document.querySelector('#randomResult')?.textContent || '',
    fileOutput: document.querySelector('#fileToolResult')?.textContent || '',
    imageOutput: document.querySelector('#imageToolResult')?.textContent || '',
    temporaryCode: document.querySelector('#temporaryResult code')?.textContent || '',
    fileDownloadEnabled: document.querySelector('#downloadFileToolBtn') ? !document.querySelector('#downloadFileToolBtn').disabled : false,
    imageDownloadEnabled: document.querySelector('#downloadImageToolBtn') ? !document.querySelector('#downloadImageToolBtn').disabled : false,
    previewCanvases: document.querySelectorAll('#imageToolPreview canvas').length,
  })`);

  const waitForOperation = async (buttonSelector, timeout = 20_000) => {
    await waitFor(`!document.querySelector(${JSON.stringify(buttonSelector)})?.disabled`, timeout, `${buttonSelector} completion`);
    const state = await readState();
    assert.ok(state.message && !/失败|错误|请选择|不支持|不能为空|无效/.test(state.message), `operation failed: ${state.message}`);
    return state;
  };

  const downloadedFiles = () => new Set(fs.readdirSync(DOWNLOAD_ROOT));
  const verifyDownload = async (selector) => {
    const before = downloadedFiles();
    await click(selector);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const after = downloadedFiles();
      if ([...after].some((name) => !before.has(name) && !name.endsWith(".crdownload"))) return;
      await delay(100);
    }
    throw new Error(`download did not finish for ${selector}`);
  };

  const results = [];
  const record = async (category, id, action) => {
    try {
      await action();
      results.push({ category, id, status: "passed" });
    } catch (error) {
      results.push({ category, id, status: "failed", error: error.message });
    }
  };

  try {
    await send("Page.navigate", { url: `${BASE_URL}/login?tool-matrix=1` });
    await waitFor("document.querySelector('#usernameInput')", 12_000, "login page");
    await evaluate(`localStorage.setItem('wyjAccountSession', ${JSON.stringify(member.session)}); location.href = '/tools?tool-matrix=1'; true`);
    await waitFor("window.WYJTools?.tools?.length === 103 && !document.querySelector('#toolsPanel')?.classList.contains('hidden')", 15_000, "toolbox dashboard");

    const catalog = await evaluate("window.WYJTools.tools.map(({id,name,description,category}) => ({id,name,description,category}))");
    assert.equal(catalog.length, 103);
    assert.equal(new Set(catalog.map((tool) => tool.id)).size, 103);
    assert.ok(catalog.every((tool) => tool.name && tool.description));

    const searchResult = await evaluate("window.WYJTools.searchTools('jso 格').map(tool => tool.id)");
    assert.ok(searchResult.includes("json-format"));
    assert.ok(searchResult.includes("csv-json") || searchResult.includes("json-csv"));

    const textCases = {
      "text-stats": { input: "Hello 世界\n\nNext", check: (value) => value.includes("段落：2") && value.includes("预计阅读：1 分钟") },
      "dedupe-lines": { input: "a\na\nb", expected: "a\nb" },
      "remove-empty-lines": { input: "a\n\n  \nb", expected: "a\nb" },
      "collapse-spaces": { input: " a   b\tc ", expected: "a b c" },
      "letter-case": { input: "Ab C", option: "lower", expected: "ab c" },
      "camel-case": { input: "hello world-test", expected: "helloWorldTest" },
      "pascal-case": { input: "hello world-test", expected: "HelloWorldTest" },
      "snake-case": { input: "hello world-test", expected: "hello_world_test" },
      "kebab-case": { input: "hello world_test", expected: "hello-world-test" },
      "line-prefix": { input: "a\nb", parameter: ">", expected: ">a\n>b" },
      "line-suffix": { input: "a\nb", parameter: "!", expected: "a!\nb!" },
      "line-numbers": { input: "a\nb", parameter: ". ", expected: "1. a\n2. b" },
      "find-replace": { input: "cat cat", parameter: "cat", secondary: "dog", expected: "dog dog" },
      "regex-replace": { input: "aaa b aa", parameter: "a+", secondary: "X", option: "g", expected: "X b X" },
      "sort-lines": { input: "10\n2\n1", option: "asc", expected: "1\n2\n10" },
      "shuffle-lines": { input: "a\nb\nc", check: (value) => value.split("\n").sort().join("") === "abc" },
      "text-diff": { input: "a\nb", secondary: "a\nc", check: (value) => value.includes("  a") && value.includes("- b") && value.includes("+ c") },
      "extract-email": { input: "a@example.com bad a@example.com", expected: "a@example.com" },
      "extract-url": { input: "go https://example.com/a?q=1 now", expected: "https://example.com/a?q=1" },
      "extract-ip": { input: "127.0.0.1 999.1.1.1", expected: "127.0.0.1" },
      "extract-number-date": { input: "2026/07/16 value -2.5", check: (value) => value.includes("2026/07/16") && value.includes("-2.5") },
      base64: { input: "你好 WYJ", option: "encode", check: (value) => value.length > 8 && !value.includes("你好") },
      "url-code": { input: "a b/中", option: "encode", check: (value) => value.includes("%20") && value.includes("%E4%B8%AD") },
      "html-entities": { input: "<b>&</b>", option: "encode", expected: "&lt;b&gt;&amp;&lt;/b&gt;" },
      "unicode-code": { input: "A中😀", option: "encode", expected: "\\u0041\\u4e2d\\u{1f600}" },
      "json-format": { input: "{\"a\":1}", check: (value) => value.includes("\n  \"a\": 1\n") },
      "json-minify": { input: "{ \"a\": 1 }", expected: "{\"a\":1}" },
      "json-validate": { input: "[1,2]", check: (value) => value.includes("JSON 合法") && value.includes("数组") },
      "chinese-convert": { input: "学习网站", option: "traditional", expected: "學習網站" },
    };

    assert.deepEqual(
      Object.keys(textCases).sort(),
      catalog.filter((tool) => tool.category === "text").map((tool) => tool.id).sort(),
      "text test matrix does not match catalog",
    );

    for (const tool of catalog.filter((item) => item.category === "text")) {
      await record("text", tool.id, async () => {
        const test = textCases[tool.id];
        await openTool(tool.id);
        const fields = { "#textToolInput": test.input };
        if (test.secondary !== undefined) fields["#textToolSecondary"] = test.secondary;
        if (test.parameter !== undefined) fields["#textToolParameter"] = test.parameter;
        if (test.option !== undefined) fields["#textToolOption"] = test.option;
        await setFields(fields);
        await click("#runTextToolBtn");
        await waitFor("!document.querySelector('#runTextToolBtn')?.disabled && (document.querySelector('#textToolOutput')?.value || document.querySelector('#toolWorkbenchMessage')?.classList.contains('is-error'))", 20_000, `${tool.id} result`);
        const state = await readState();
        assert.ok(!state.message.includes("失败"), state.message);
        if (test.expected !== undefined) assert.equal(state.textOutput, test.expected);
        else assert.ok(test.check(state.textOutput), `${tool.id}: ${state.textOutput}`);
      });
    }

    const randomCases = {
      "random-integer": { fields: { "#randomMinimum": 5, "#randomMaximum": 5, "#randomCount": 3 }, check: (value) => value === "5\n5\n5" },
      "random-decimal": { fields: { "#randomMinimum": 1, "#randomMaximum": 1, "#randomPrecision": 3, "#randomCount": 2 }, check: (value) => value === "1.000\n1.000" },
      "random-string": { fields: { "#randomLength": 12, "#randomAlphabet": "A" }, check: (value) => value === "A".repeat(12) },
      "random-password": { fields: { "#randomLength": 20 }, check: (value) => value.length === 20 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value) },
      "random-uuid": { fields: { "#randomCount": 2 }, check: (value) => value.split("\n").every((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item)) },
      "random-draw": { fields: { "#randomEntries": "Only" }, check: (value) => value === "Only" },
      "random-groups": { fields: { "#randomEntries": "A\nB\nC\nD", "#randomGroups": 2 }, check: (value) => ["A","B","C","D"].every((item) => value.includes(item)) && value.includes("第 2 组") },
      "random-wheel": { fields: { "#randomEntries": "Only" }, check: (value) => value === "Only" },
      "weighted-wheel": { fields: { "#randomEntries": "Only|1" }, check: (value) => value === "Only" },
      "random-date": { fields: { "#randomStartDate": "2026-07-16", "#randomEndDate": "2026-07-16" }, check: (value) => value === "2026-07-16" },
      "random-time": { fields: {}, check: (value) => /^\d{2}:\d{2}:\d{2}$/.test(value) },
      "random-color": { fields: {}, check: (value) => /^#[0-9a-f]{6}$/.test(value) },
      "random-palette": { fields: { "#randomCount": 3 }, check: (value) => value.split("\n").length === 3 && value.split("\n").every((item) => /^#[0-9a-f]{6}$/.test(item)) },
      "coin-flip": { fields: {}, check: (value) => ["正面", "反面"].includes(value) },
      "dice-d4": { fields: {}, check: (value) => Number(value) >= 1 && Number(value) <= 4 },
      "dice-d6": { fields: {}, check: (value) => Number(value) >= 1 && Number(value) <= 6 },
      "dice-d8": { fields: {}, check: (value) => Number(value) >= 1 && Number(value) <= 8 },
      "dice-d10": { fields: {}, check: (value) => Number(value) >= 1 && Number(value) <= 10 },
      "dice-d12": { fields: {}, check: (value) => Number(value) >= 1 && Number(value) <= 12 },
      "dice-d20": { fields: {}, check: (value) => Number(value) >= 1 && Number(value) <= 20 },
      "custom-dice": { fields: { "#randomSides": 7 }, check: (value) => Number(value) >= 1 && Number(value) <= 7 },
      "random-decision": { fields: { "#randomEntries": "Only" }, check: (value) => value === "Only" },
    };

    assert.deepEqual(
      Object.keys(randomCases).sort(),
      catalog.filter((tool) => tool.category === "random").map((tool) => tool.id).sort(),
      "random test matrix does not match catalog",
    );

    for (const tool of catalog.filter((item) => item.category === "random")) {
      await record("random", tool.id, async () => {
        const test = randomCases[tool.id];
        await openTool(tool.id);
        if (Object.keys(test.fields).length) await setFields(test.fields);
        await click("#runRandomToolBtn");
        const state = await readState();
        assert.ok(test.check(state.randomOutput), `${tool.id}: ${state.randomOutput}`);
      });
    }

    const fileInputs = {
      "file-md5": [samples.abc], "file-sha1": [samples.abc], "file-sha256": [samples.abc], "file-sha512": [samples.abc],
      "file-info": [samples.text], "csv-json": [samples.csv], "json-csv": [samples.objects], "text-encoding": [samples.text],
      "text-split": [samples.text], "csv-split": [samples.csv], "txt-merge": [samples.text, samples.text2],
      "csv-merge": [samples.csv, samples.csv2], "json-array-merge": [samples.array1, samples.array2],
      "images-pdf": [samples.png, samples.png2], "rename-preview": [samples.text, samples.csv],
      "files-zip": [samples.text, samples.csv], "batch-zip": [samples.text, samples.csv],
    };
    const fileDownloads = new Set(["csv-json", "json-csv", "text-encoding", "text-split", "csv-split", "txt-merge", "csv-merge", "json-array-merge", "images-pdf", "files-zip", "batch-zip"]);
    assert.deepEqual(Object.keys(fileInputs).sort(), catalog.filter((tool) => tool.category === "file").map((tool) => tool.id).sort(), "file test matrix does not match catalog");

    for (const tool of catalog.filter((item) => item.category === "file")) {
      await record("file", tool.id, async () => {
        await openTool(tool.id);
        if (tool.id === "text-split" || tool.id === "csv-split") await setFields({ "#fileToolParameter": 1 });
        if (tool.id === "rename-preview") await setFields({ "#fileToolParameter": "renamed" });
        await setFiles("#fileToolInput", fileInputs[tool.id]);
        await click("#runFileToolBtn");
        const state = await waitForOperation("#runFileToolBtn", 25_000);
        assert.ok(state.fileOutput && state.fileOutput !== "等待处理", `${tool.id} produced no result`);
        if (tool.id === "file-md5") assert.ok(state.fileOutput.startsWith("900150983cd24fb0d6963f7d28e17f72"));
        if (tool.id === "file-sha1") assert.ok(state.fileOutput.startsWith("a9993e364706816aba3e25717850c26c9cd0d89d"));
        if (tool.id === "file-sha256") assert.ok(state.fileOutput.startsWith("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
        if (tool.id === "csv-json") assert.ok(state.fileOutput.includes('"Alice"'));
        if (tool.id === "json-csv") assert.ok(state.fileOutput.includes("name,age"));
        if (tool.id === "json-array-merge") assert.ok(state.fileOutput.includes("3"));
        if (tool.id === "rename-preview") assert.ok(state.fileOutput.includes("renamed-001.txt"));
        assert.equal(state.fileDownloadEnabled, fileDownloads.has(tool.id), `${tool.id} download state`);
        if (state.fileDownloadEnabled) await verifyDownload("#downloadFileToolBtn");
      });
    }

    const imageNoFile = new Set(["color-convert", "gradient-generator", "gradient-css", "solid-image"]);
    const imageNoDownload = new Set(["color-convert", "gradient-css", "exif-view", "gps-warning", "color-extract"]);
    const imageNoPreview = new Set(["image-pdf", "exif-view", "gps-warning"]);
    for (const tool of catalog.filter((item) => item.category === "image")) {
      await record("image", tool.id, async () => {
        await openTool(tool.id);
        if (!imageNoFile.has(tool.id)) {
          const source = ["exif-view", "exif-remove", "gps-warning"].includes(tool.id) ? samples.jpeg : samples.png;
          const files = ["image-batch-compress", "image-pdf"].includes(tool.id) ? [samples.png, samples.png2] : [source];
          await setFiles("#imageToolInput", files);
        }
        if (tool.id === "image-watermark") await setFiles("#imageOverlayInput", [samples.png2]);
        if (tool.id === "image-resize") await setFields({ "#imageWidth": 40, "#imageHeight": 30 });
        if (tool.id === "image-scale") await setFields({ "#imageScale": 50 });
        await click("#runImageToolBtn");
        const state = await waitForOperation("#runImageToolBtn", 35_000);
        assert.ok(state.imageOutput && state.imageOutput !== "等待处理", `${tool.id} produced no result`);
        assert.equal(state.imageDownloadEnabled, !imageNoDownload.has(tool.id), `${tool.id} download state`);
        if (!imageNoPreview.has(tool.id)) assert.ok(state.previewCanvases > 0, `${tool.id} has no preview`);
        if (state.imageDownloadEnabled) await verifyDownload("#downloadImageToolBtn");
      });
    }

    await record("temporary", "temporary-text", async () => {
      await openTool("temporary-text");
      await setFields({ "#tempContent": "temporary matrix text", "#tempMaxViews": 2 });
      await click("#createTempBtn");
      await waitFor("document.querySelector('#temporaryResult code')?.textContent.includes('/share/text/')", 10_000, "temporary text link");
      const state = await readState();
      const id = state.temporaryCode.split("/").pop();
      const opened = await api("/api/share/text/read", { id, password: "" });
      assert.equal(opened.share.content, "temporary matrix text");
    });

    await record("temporary", "temporary-file", async () => {
      await openTool("temporary-file");
      await setFiles("#tempFileInput", [samples.text]);
      await click("#createTempBtn");
      await waitFor("document.querySelector('#temporaryResult code')?.textContent.includes('/share/file/')", 10_000, "temporary file link");
      const state = await readState();
      const id = state.temporaryCode.split("/").pop();
      const opened = await api("/api/share/file/read", { id, password: "" });
      assert.equal(opened.file.file_name, "sample.txt");
      assert.ok(opened.file.base64);
    });

    await record("temporary", "temporary-clipboard", async () => {
      await openTool("temporary-clipboard");
      await setFields({ "#tempContent": "clipboard matrix" });
      await click("#createTempBtn");
      await waitFor("/^\\d{6}$/.test(document.querySelector('#temporaryResult code')?.textContent || '')", 10_000, "clipboard code");
      const state = await readState();
      await setFields({ "#clipboardReadCode": state.temporaryCode });
      await click("#readClipboardBtn");
      await waitFor("document.querySelector('#clipboardReadOutput')?.textContent === 'clipboard matrix'", 10_000, "clipboard read");
    });

    await record("temporary", "temporary-qr", async () => {
      await openTool("temporary-qr");
      await setFields({ "#qrText": "matrix qr" });
      await click("#createTempBtn");
      await waitFor("document.querySelector('#temporaryResult code')?.textContent === 'matrix qr'", 5_000, "text QR");
      await setFields({ "#qrKind": "url", "#qrUrl": "https://example.com/test" });
      await click("#createTempBtn");
      await waitFor("document.querySelector('#temporaryResult code')?.textContent.includes('https://example.com/test')", 5_000, "URL QR");
      await setFields({ "#qrKind": "wifi", "#qrWifiName": "WYJ-WIFI", "#qrWifiPassword": "password123" });
      await click("#createTempBtn");
      await waitFor("document.querySelector('#temporaryResult code')?.textContent.startsWith('WIFI:')", 5_000, "Wi-Fi QR");
      await setFields({ "#qrKind": "contact", "#qrContactName": "WYJ", "#qrContactEmail": "wyj@example.com" });
      await click("#createTempBtn");
      await waitFor("document.querySelector('#temporaryResult code')?.textContent.includes('BEGIN:VCARD')", 5_000, "contact QR");
      await setFields({ "#qrKind": "text", "#qrText": "dynamic qr", "#qrDynamic": true });
      await click("#createTempBtn");
      await waitFor("document.querySelector('#temporaryResult code')?.textContent.includes('/share/qr/')", 10_000, "dynamic QR");
      const state = await readState();
      const id = state.temporaryCode.split("/").pop();
      const opened = await api("/api/share/text/read", { id, password: "" });
      assert.equal(opened.share.content, "dynamic qr");
    });

    await record("temporary", "temporary-room", async () => {
      await openTool("temporary-room");
      await click("#createTempBtn");
      await waitFor("document.querySelector('#roomId')?.value", 10_000, "temporary room creation");
      await setFields({ "#roomAuthor": "Matrix", "#roomMessage": "hello room" });
      await click("#postRoomBtn");
      await waitFor("document.querySelector('#roomMessages')?.textContent.includes('hello room')", 10_000, "room post");
      await click("#openRoomBtn");
      await waitFor("document.querySelector('#toolWorkbenchMessage')?.textContent === '房间已打开'", 10_000, "room open");
      await click("#clearRoomBtn");
      await waitFor("document.querySelector('#toolWorkbenchMessage')?.textContent === '房间已清空'", 10_000, "room clear");
      assert.equal(await evaluate("document.querySelectorAll('#roomMessages article').length"), 0);
    });

    await openTool("json-format");
    await click("#favoriteToolBtn");
    await waitFor("document.querySelector('#favoriteToolBtn')?.textContent === '取消收藏'", 10_000, "favorite save");
    await click("#pinToolBtn");
    await waitFor("document.querySelector('#pinToolBtn')?.textContent === '取消固定'", 10_000, "favorite pin");

    await openTool("random-groups");
    await setFields({ "#randomEntries": "A\nB", "#randomGroups": 2, "#toolConfigName": "matrix config" });
    await click("#saveToolConfigBtn");
    await waitFor("document.querySelector('[data-load-config]')", 10_000, "saved config");
    await setFields({ "#randomGroups": 1 });
    await click("[data-load-config]");
    assert.equal(await evaluate("document.querySelector('#randomGroups').value"), "2");
    await click("[data-delete-config]");
    await waitFor("!document.querySelector('[data-load-config]')", 10_000, "config deletion");

    const testedIds = new Set(results.map((result) => result.id));
    assert.deepEqual([...testedIds].sort(), catalog.map((tool) => tool.id).sort(), "not every catalog tool was exercised");
    const failures = results.filter((result) => result.status === "failed");
    const summary = Object.fromEntries(["text", "file", "image", "random", "temporary"].map((category) => {
      const categoryResults = results.filter((result) => result.category === category);
      return [category, { total: categoryResults.length, passed: categoryResults.filter((result) => result.status === "passed").length }];
    }));

    console.log(JSON.stringify({
      account: member.account.username,
      catalog: catalog.length,
      summary,
      failures,
      runtimeErrors,
      downloads: fs.readdirSync(DOWNLOAD_ROOT).filter((name) => !name.endsWith(".crdownload")).length,
    }, null, 2));

    assert.deepEqual(failures, [], "tool matrix failures");
    assert.deepEqual(runtimeErrors, [], "browser runtime errors");
  } finally {
    await client.send("Target.closeTarget", { targetId }).catch(() => {});
    client.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

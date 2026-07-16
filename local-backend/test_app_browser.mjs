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
const DOWNLOAD_ROOT = path.join(TEST_ROOT, `app-downloads-${RUN_ID}`);
const USERNAME = `appmatrix${RUN_ID}`.slice(0, 32);
const USER_SECRET = "App-Matrix-User-2026!";
const USER_SECRET_NEW = "App-Matrix-New-2026!";

fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true });
const wordsFile = path.join(TEST_ROOT, `app-words-${RUN_ID}.txt`);
const wrongFile = path.join(TEST_ROOT, `app-wrong-${RUN_ID}.json`);
fs.writeFileSync(wordsFile, "hello\nworld\nstudy\n", "utf8");
fs.writeFileSync(wrongFile, JSON.stringify({
  type: "vocab-wrong-book",
  version: 1,
  language: "english",
  currentWrongBook: {
    hello: { last_answer: "hi", correct_answer: "你好", accepted: ["您好"], wrong_count: 1 },
  },
  historyWrongBook: {
    hello: { last_answer: "hi", correct_answer: "你好", accepted: ["您好"], wrong_count: 2 },
  },
}, null, 2), "utf8");

async function request(pathname, payload = null, token = "") {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: payload === null ? "GET" : "POST",
    headers: {
      ...(payload === null ? {} : { "Content-Type": "application/json" }),
      ...(token ? { "X-Session-Token": token } : {}),
    },
    body: payload === null ? undefined : JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, headers: response.headers };
}

async function api(pathname, payload = null, token = "", expected = [200]) {
  const result = await request(pathname, payload, token);
  assert.ok(expected.includes(result.status), `${pathname}: HTTP ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
}

async function createUser(prefix, secret = USER_SECRET) {
  const username = `${prefix}${RUN_ID}`.slice(0, 32);
  await api("/api/register", { username, secret, confirm_secret: secret }, "", [201]);
  const login = await api("/api/login", { username, secret });
  return { username, secret, ...login };
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
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result || {});
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
  await Promise.all([send("Page.enable"), send("DOM.enable"), send("Runtime.enable"), send("Log.enable"), send("Network.enable")]);
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Network.setBypassServiceWorker", { bypass: true });
  await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOAD_ROOT, eventsEnabled: true });
  return { client, targetId: target.targetId, sessionId, send };
}

async function main() {
  const browser = await connectBrowser();
  const { client, send, targetId } = browser;
  const runtimeErrors = [];
  const networkHttpErrors = [];
  const dialogs = [];
  const checks = [];
  const admin = await api("/api/login", { username: "wyj", secret: ADMIN_SECRET });
  await send("Storage.clearDataForOrigin", { origin: BASE_URL, storageTypes: "all" });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expression, returnByValue = true) => {
    const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue, userGesture: true });
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description || response.exceptionDetails.text;
      throw new Error(detail || "browser evaluation failed");
    }
    return returnByValue ? response.result?.value : response.result;
  };

  client.listeners.add((message) => {
    if (message.sessionId && message.sessionId !== browser.sessionId) return;
    if (message.method === "Runtime.exceptionThrown") runtimeErrors.push(message.params?.exceptionDetails?.text || "runtime exception");
    if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params?.entry?.level)) {
      const value = message.params.entry.text || "browser log error";
      if (!/^Failed to load resource: the server responded with a status of \d+/.test(value)) runtimeErrors.push(value);
    }
    if (message.method === "Network.responseReceived" && Number(message.params?.response?.status) >= 400) {
      networkHttpErrors.push({
        status: Number(message.params.response.status),
        url: message.params.response.url,
      });
    }
    if (message.method === "Page.javascriptDialogOpening") {
      dialogs.push(message.params.message || "");
      send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    }
  });

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

  const downloadedFiles = () => new Set(fs.readdirSync(DOWNLOAD_ROOT));
  const verifyDownload = async (selector, timeout = 60_000) => {
    const before = downloadedFiles();
    await click(selector);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const after = downloadedFiles();
      const added = [...after].find((name) => !before.has(name) && !name.endsWith(".crdownload"));
      if (added) return added;
      await delay(100);
    }
    throw new Error(`download did not finish for ${selector}`);
  };

  const navigate = async (pathname) => {
    await send("Page.navigate", { url: `${BASE_URL}${pathname}` });
    await waitFor("document.readyState !== 'loading' && document.querySelector('#appShell')", 15_000, pathname);
  };

  const useSession = async (session, pathname) => {
    await evaluate(`localStorage.setItem('wyjAccountSession', ${JSON.stringify(session)}); location.href = ${JSON.stringify(pathname)}; true`);
    await waitFor("!document.querySelector('#entryScreen') && !document.querySelector('#appShell')?.classList.contains('app-shell-pending')", 12_000, `${pathname} after splash`);
  };

  const check = async (name, action) => {
    const started = Date.now();
    await action();
    checks.push({ name, status: "passed", milliseconds: Date.now() - started });
  };

  try {
    await check("startup, splash doors and unauthenticated route", async () => {
      await navigate(`/?app-matrix=${RUN_ID}`);
      await waitFor("document.querySelector('#entryScreen')", 3_000, "initial splash");
      const initial = await evaluate(`(() => {
        const entry = document.querySelector('#entryScreen');
        const shell = document.querySelector('#appShell');
        const scenes = [...document.querySelectorAll('.splash-door-scene')].map(node => node.getBoundingClientRect());
        const image = document.querySelector('.splash-art');
        const imageStyle = getComputedStyle(image);
        return {
          entryVisible: getComputedStyle(entry).display !== 'none',
          shellHidden: shell.getAttribute('aria-hidden') === 'true' && shell.classList.contains('app-shell-pending'),
          viewportWidth: document.documentElement.clientWidth,
          scenes: scenes.map(rect => ({ x: Math.round(rect.x), width: Math.round(rect.width) })),
          imageReady: image.complete && image.naturalWidth > 0,
          objectFit: imageStyle.objectFit,
          mask: imageStyle.webkitMaskImage || imageStyle.maskImage,
        };
      })()`);
      assert.equal(initial.entryVisible, true);
      assert.equal(initial.shellHidden, true);
      assert.equal(initial.imageReady, true);
      assert.equal(initial.objectFit, "contain");
      assert.ok(initial.mask.includes("radial-gradient"));
      assert.equal(initial.scenes.length, 2);
      assert.ok(initial.scenes.every((scene) => scene.x === 0 && scene.width >= initial.viewportWidth), JSON.stringify(initial));
      await waitFor("!document.querySelector('#entryScreen')", 6_000, "splash removal");
      await waitFor("location.pathname === '/login' && !document.querySelector('#authPanel')?.classList.contains('hidden')", 8_000, "login route");
      assert.equal(await evaluate("document.querySelector('#accountBar').classList.contains('hidden')"), true);
      const pwa = await evaluate(`(async () => {
        const registration = await navigator.serviceWorker.ready;
        const cacheNames = await caches.keys();
        const cachedLogo = await caches.match('/assets/logo.png');
        const cachedSplash = await caches.match('/assets/splash-screen.png');
        return { active: Boolean(registration.active), cacheNames, cachedLogo: Boolean(cachedLogo), cachedSplash: Boolean(cachedSplash) };
      })()`);
      assert.equal(pwa.active, true);
      assert.equal(pwa.cachedLogo, true);
      assert.equal(pwa.cachedSplash, true);
      const desktopShot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
      fs.writeFileSync(path.join(TEST_ROOT, `desktop-app-${RUN_ID}.png`), Buffer.from(desktopShot.data, "base64"));
    });

    await check("registration and login UI", async () => {
      await click("#showRegisterBtn");
      await setFields({
        "#registerUsernameInput": USERNAME,
        "#registerSecretInput": USER_SECRET,
        "#registerConfirmInput": USER_SECRET,
      });
      await click("#registerSubmitBtn");
      await waitFor("document.querySelector('#loginError')?.textContent.includes('注册成功')", 12_000, "registration success");
      assert.equal(await evaluate("location.pathname"), "/login");
      assert.equal(await evaluate("document.querySelector('#usernameInput').value"), USERNAME);
      await click("#loginSubmitBtn");
      await waitFor("location.pathname === '/select' && !document.querySelector('#modulePicker')?.classList.contains('hidden')", 12_000, "module picker");
      assert.ok((await evaluate("localStorage.getItem('wyjAccountSession') || ''")).length > 20);
    });

    const userSession = await evaluate("localStorage.getItem('wyjAccountSession')");
    const userMe = await api("/api/me", null, userSession);

    await check("locked toolbox, direct-route guard and membership plans", async () => {
      await click('[data-module="tools"]');
      await waitFor("!document.querySelector('#membershipModal')?.classList.contains('hidden')", 12_000, "membership modal");
      assert.equal(await evaluate("location.pathname"), "/select");
      const plans = await evaluate(`[...document.querySelectorAll('#membershipPlanList [data-plan]')].map(node => ({ code: node.dataset.plan, text: node.textContent }))`);
      assert.deepEqual(plans.map((item) => item.code), ["trial_single_language", "dual_language_monthly", "tools_monthly", "japanese_lifetime", "all_access_monthly", "all_access_lifetime"]);
      assert.ok(plans.find((item) => item.code === "trial_single_language").text.includes("8"));
      assert.ok(plans.find((item) => item.code === "dual_language_monthly").text.includes("20"));
      assert.ok(plans.find((item) => item.code === "tools_monthly").text.includes("20"));
      assert.ok(plans.find((item) => item.code === "japanese_lifetime").text.includes("70"));
      assert.ok(plans.find((item) => item.code === "all_access_monthly").text.includes("30"));
      assert.ok(plans.find((item) => item.code === "all_access_lifetime").text.includes("100"));
      await click('[data-plan="trial_single_language"]');
      assert.equal(await evaluate("document.querySelector('#trialLanguageField').classList.contains('hidden')"), false);
      await click('[data-plan="all_access_monthly"]');
      assert.ok((await evaluate("document.querySelector('#purchaseSummary').textContent")).includes("30 CNY"));
      await click("#submitRechargeBtn");
      await waitFor("!document.querySelector('#paymentOrderBox')?.classList.contains('hidden')", 12_000, "payment order");
      assert.ok((await evaluate("document.querySelector('#paymentAmount').textContent")).includes("30.00 CNY"));
      assert.ok((await evaluate("document.querySelector('#paymentNote').textContent")).includes(USERNAME));
      await click("#confirmPaymentBtn");
      await waitFor("document.querySelector('#paymentStatus')?.textContent.includes('等待确认')", 12_000, "payment confirmation");
      await click('[data-close-modal="membershipModal"]');
      await evaluate("location.href = '/tools'; true");
      await waitFor("location.pathname === '/select' && !document.querySelector('#membershipModal')?.classList.contains('hidden')", 12_000, "direct tools guard");
      await click('[data-close-modal="membershipModal"]');
    });

    await check("word import, export, shuffle and clear", async () => {
      await click('[data-module="language"]');
      await waitFor("location.pathname === '/language'", 4_000, "language picker");
      await click('[data-project="english"]');
      try {
        await waitFor("location.pathname === '/language/english' && !document.querySelector('#workspace')?.classList.contains('hidden')", 8_000, "English workspace");
      } catch (error) {
        const state = await evaluate(`({
          path: location.pathname,
          moduleHidden: document.querySelector('#modulePicker')?.classList.contains('hidden'),
          pickerHidden: document.querySelector('#projectPicker')?.classList.contains('hidden'),
          projectHidden: document.querySelector('#projectApp')?.classList.contains('hidden'),
          workspaceHidden: document.querySelector('#workspace')?.classList.contains('hidden'),
          authHidden: document.querySelector('#authPanel')?.classList.contains('hidden'),
          loginError: document.querySelector('#loginError')?.textContent || '',
          badge: document.querySelector('#accountBadge')?.textContent || '',
          pendingScreen,
          currentProject,
          backendAvailable,
          sessionLength: state.session?.length || 0,
          hasAccount: Boolean(state.account),
        })`);
        throw new Error(`${error.message}: ${JSON.stringify(state)}`);
      }
      await setFiles("#wordFileInput", [wordsFile]);
      await waitFor("document.querySelector('#wordInput')?.value.includes('hello')", 5_000, "word import");
      const before = (await evaluate("document.querySelector('#wordInput').value.split(/\\n/).sort()"));
      const exported = await verifyDownload("#exportWordsBtn", 10_000);
      assert.ok(exported.endsWith(".txt"));
      await click("#shuffleBtn");
      const after = await evaluate("document.querySelector('#wordInput').value.split(/\\n/).sort()");
      assert.deepEqual(after, before);
      await click("#clearBtn");
      await waitFor("!document.querySelector('#confirmModal')?.classList.contains('hidden')", 3_000, "clear confirmation");
      await click("#acceptConfirmBtn");
      await waitFor("document.querySelector('#wordInput').value === ''", 3_000, "words cleared");
    });

    await check("free limit, empty answer and skipped wrong-book flow", async () => {
      const freeLimitWords = ["apple", "book", "cat", "dog", "earth", "flower", "green", "house", "idea", "juice", "kite", "light", "music", "night", "orange", "paper"];
      await setFields({ "#wordInput": freeLimitWords.join("\n") });
      await delay(300);
      assert.ok((await evaluate("document.querySelector('#wordLimitHint').textContent")).includes("最多测试 15"));
      if (!await evaluate("document.querySelector('#membershipModal')?.classList.contains('hidden')")) {
        await click('[data-close-modal="membershipModal"]');
      }
      await click("#startBtn");
      await waitFor("!document.querySelector('#membershipModal')?.classList.contains('hidden') && /15|上限|会员/.test(document.querySelector('#rechargeMessage')?.textContent || '')", 12_000, "server limit prompt");
      assert.ok((await evaluate("document.querySelector('#rechargeMessage').textContent")).match(/15|上限|会员/));
      await click('[data-close-modal="membershipModal"]');
      assert.equal(await evaluate("document.querySelector('#setupView').classList.contains('active')"), true);
      await setFields({ "#wordInput": "hello\nworld", "#practiceModeSelect": "meaning", "#gradingModeSelect": "normal" });
      await click("#startBtn");
      await waitFor("document.querySelector('#quizView').classList.contains('active') && document.querySelector('#progressLabel').textContent === '1/2'", 20_000, "quiz start");
      const word = await evaluate("document.querySelector('#wordLabel').textContent");
      await click("#submitBtn");
      await waitFor("!document.querySelector('#answerValidation')?.classList.contains('hidden')", 3_000, "empty answer validation");
      assert.ok((await evaluate("document.querySelector('#answerValidation').textContent")).includes("请输入中文意思"));
      assert.equal(await evaluate("document.querySelector('#wordLabel').textContent"), word);
      assert.equal(await evaluate("document.querySelector('#statWrong').textContent"), "0");
      await click("#skipBtn");
      await waitFor("document.querySelector('#resultTitle')?.textContent.includes('跳过') && !document.querySelector('#nextNowBtn')?.disabled", 4_000, "first skip");
      assert.equal(await evaluate("document.querySelector('#statWrong').textContent"), "1");
      await click("#nextNowBtn");
      await waitFor("document.querySelector('#progressLabel').textContent === '2/2'", 4_000, "second question");
      await click("#skipBtn");
      await waitFor("!document.querySelector('#nextNowBtn')?.disabled", 4_000, "second skip");
      await click("#nextNowBtn");
      await waitFor("!document.querySelector('#roundSummaryModal')?.classList.contains('hidden')", 5_000, "round summary");
      assert.equal(await evaluate("document.querySelector('#roundSkippedCount').textContent"), "2");
      assert.equal(await evaluate("document.querySelector('#roundWrongCount').textContent"), "0");
      await click("#roundWrongBtn");
      await waitFor("document.querySelector('#wrongView').classList.contains('active') && document.querySelectorAll('#wrongList .wrong-item').length === 2", 4_000, "wrong book");
    });

    await check("wrong search, JSON/PDF export, import and offline review", async () => {
      await setFields({ "#wrongSearchInput": "hello" });
      assert.equal(await evaluate("document.querySelectorAll('#wrongList .wrong-item').length"), 1);
      await setFields({ "#wrongSearchInput": "" });
      const pdfName = await verifyDownload("#exportBtn", 80_000);
      assert.ok(pdfName.endsWith(".pdf"));
      const pdfBytes = fs.readFileSync(path.join(DOWNLOAD_ROOT, pdfName));
      assert.equal(pdfBytes.subarray(0, 4).toString("ascii"), "%PDF");
      const jsonName = await verifyDownload("#exportWrongDataBtn", 10_000);
      assert.ok(jsonName.endsWith(".json"));
      await click("#clearWrongBtn");
      await click("#acceptConfirmBtn");
      await waitFor("document.querySelectorAll('#wrongList .wrong-item').length === 0", 4_000, "wrong book clear");
      await setFiles("#wrongDataFileInput", [wrongFile]);
      await waitFor("document.querySelectorAll('#wrongList .wrong-item').length === 1", 6_000, "wrong data import");
      await click("#reviewBtn");
      await waitFor("document.querySelector('#quizView').classList.contains('active')", 8_000, "offline review start");
      await setFields({ "#answerInput": "你好" });
      await click("#submitBtn");
      await waitFor("document.querySelector('#resultTitle')?.classList.contains('ok') && !document.querySelector('#nextNowBtn')?.disabled", 5_000, "offline review answer");
      await click("#nextNowBtn");
      await waitFor("!document.querySelector('#roundSummaryModal')?.classList.contains('hidden')", 4_000, "review summary");
      assert.equal(await evaluate("document.querySelector('#roundCorrectCount').textContent"), "1");
      await click("#roundSetupBtn");
    });

    await check("English dictation, speech, achievements and study statistics", async () => {
      await setFields({ "#practiceModeSelect": "dictation", "#wordInput": "hello" });
      await click("#startBtn");
      await waitFor("document.querySelector('#quizView').classList.contains('active')", 8_000, "dictation start");
      await click("#speakBtn");
      await setFields({ "#answerInput": "HELLO" });
      await click("#submitBtn");
      await waitFor("document.querySelector('#resultTitle')?.classList.contains('ok') && !document.querySelector('#nextNowBtn')?.disabled", 5_000, "dictation result");
      await click("#nextNowBtn");
      await waitFor("!document.querySelector('#roundSummaryModal')?.classList.contains('hidden')", 4_000, "dictation summary");
      assert.equal(await evaluate("document.querySelector('#roundAccuracy').textContent"), "正确率 100%");
      await click("#roundSetupBtn");
      await click('[data-view="achievementsView"]');
      await waitFor("document.querySelectorAll('#achievementList .achievement-item').length === 25", 4_000, "achievement catalog");
      assert.ok(Number(await evaluate("document.querySelector('#achievementUnlockedCount').textContent")) >= 4);
      await click('[data-achievement-filter="unlocked"]');
      assert.ok(Number(await evaluate("document.querySelectorAll('#achievementList .achievement-item').length")) >= 1);
      await click('[data-achievement-filter="progress"]');
      assert.ok(Number(await evaluate("document.querySelectorAll('#achievementList .achievement-item').length")) >= 1);
      await click('[data-achievement-filter="all"]');
      await click('[data-view="studyView"]');
      assert.ok(Number(await evaluate("document.querySelector('#studyTotalRounds').textContent")) >= 2);
      await setFields({ "#studyGoalInput": 25 });
      assert.equal(await evaluate("document.querySelector('#studyGoalBar').max"), 25);
      const statsName = await verifyDownload("#exportStudyBtn", 10_000);
      assert.ok(statsName.endsWith(".json"));
      await click("#clearStudyBtn");
      await click("#acceptConfirmBtn");
      await waitFor("document.querySelector('#studyTotalRounds').textContent === '0'", 4_000, "study data clear");
    });

    await check("Japanese kanji/kana resolution and both-form dictation", async () => {
      await click("#backProjectBtn");
      await waitFor("location.pathname === '/language'", 4_000, "project picker return");
      await click('[data-project="japanese"]');
      await waitFor("location.pathname === '/language/japanese' && !document.querySelector('#workspace')?.classList.contains('hidden')", 8_000, "Japanese workspace");
      await setFields({ "#practiceModeSelect": "meaning", "#wordInput": "電話" });
      await click("#startBtn");
      await waitFor("document.querySelector('#quizView').classList.contains('active') && document.querySelector('#wordReading')?.textContent.length > 0", 180_000, "Japanese reading annotation");
      assert.equal(await evaluate("document.querySelector('#wordText').textContent"), "電話");
      assert.equal(await evaluate("document.querySelector('#wordReading').textContent"), "でんわ");
      assert.ok((await evaluate("document.querySelector('#wordLabel').getAttribute('aria-label')")).includes("でんわ"));
      const readingShot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
      fs.writeFileSync(path.join(TEST_ROOT, `japanese-reading-${RUN_ID}.png`), Buffer.from(readingShot.data, "base64"));
      await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      const mobileReading = await evaluate(`(() => {
        const label = document.querySelector('#wordLabel').getBoundingClientRect();
        const reading = document.querySelector('#wordReading').getBoundingClientRect();
        return { scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth, labelRight: label.right, readingRight: reading.right };
      })()`);
      assert.ok(mobileReading.scrollWidth <= mobileReading.viewport + 1, JSON.stringify(mobileReading));
      assert.ok(mobileReading.labelRight <= mobileReading.viewport + 1, JSON.stringify(mobileReading));
      assert.ok(mobileReading.readingRight <= mobileReading.viewport + 1, JSON.stringify(mobileReading));
      const mobileReadingShot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
      fs.writeFileSync(path.join(TEST_ROOT, `japanese-reading-mobile-${RUN_ID}.png`), Buffer.from(mobileReadingShot.data, "base64"));
      await send("Emulation.clearDeviceMetricsOverride");
      await click("#skipBtn");
      await waitFor("!document.querySelector('#nextNowBtn')?.disabled", 5_000, "reading annotation skip");
      await click("#nextNowBtn");
      await waitFor("!document.querySelector('#roundSummaryModal')?.classList.contains('hidden')", 4_000, "reading annotation summary");
      await click("#roundSetupBtn");
      await setFields({ "#practiceModeSelect": "meaning", "#wordInput": "でんわ" });
      await click("#startBtn");
      await waitFor("document.querySelector('#quizView').classList.contains('active')", 8_000, "kana-only meaning start");
      assert.equal(await evaluate("document.querySelector('#wordText').textContent"), "でんわ");
      assert.equal(await evaluate("document.querySelector('#wordReading').classList.contains('hidden')"), true);
      await click("#skipBtn");
      await waitFor("!document.querySelector('#nextNowBtn')?.disabled", 5_000, "kana-only meaning skip");
      await click("#nextNowBtn");
      await waitFor("!document.querySelector('#roundSummaryModal')?.classList.contains('hidden')", 4_000, "kana-only meaning summary");
      await click("#roundSetupBtn");
      const authorization = await api("/api/quiz/start", { language: "japanese", words: ["花", "みず"] }, userSession);
      const resolved = await api("/api/japanese/readings", { words: ["花", "みず"], quiz_session: authorization.quiz_session }, userSession);
      assert.ok(resolved.readings?.["花"]);
      assert.ok(resolved.readings?.["みず"]);
      assert.ok(resolved.written_forms?.["みず"]);
      await evaluate(`rememberJapaneseVocabularyData(${JSON.stringify(resolved.readings)}, ${JSON.stringify(resolved.written_forms)}); true`);
      await setFields({ "#practiceModeSelect": "dictation", "#wordInput": "花" });
      await click("#startBtn");
      await waitFor("document.querySelector('#quizView').classList.contains('active')", 8_000, "Japanese dictation start");
      await setFields({ "#answerInput": "花" });
      await click("#submitBtn");
      await waitFor("document.querySelector('#resultTitle')?.classList.contains('bad') && !document.querySelector('#nextNowBtn')?.disabled", 5_000, "missing kana rejected");
      assert.ok((await evaluate("document.querySelector('#acceptedChips').textContent")).includes("同时填写"));
      await click("#nextNowBtn");
      await waitFor("!document.querySelector('#roundSummaryModal')?.classList.contains('hidden')", 4_000, "Japanese failed summary");
      await click("#roundSetupBtn");
      await setFields({ "#wordInput": "みず" });
      await click("#startBtn");
      await waitFor("document.querySelector('#quizView').classList.contains('active')", 8_000, "kana-only input start");
      const written = resolved.written_forms["みず"];
      await setFields({ "#answerInput": `${written} / ${resolved.readings["みず"]}` });
      await click("#submitBtn");
      try {
        await waitFor("document.querySelector('#resultTitle')?.classList.contains('ok') && !document.querySelector('#nextNowBtn')?.disabled", 5_000, "kanji and kana accepted");
      } catch (error) {
        const detail = await evaluate(`({
          word: state.words[state.index],
          reading: japaneseReadingFor(state.words[state.index]),
          written: japaneseWrittenFormFor(state.words[state.index]),
          expected: formatJapaneseDictationAnswer(state.words[state.index]),
          answer: document.querySelector('#answerInput')?.value || '',
          title: document.querySelector('#resultTitle')?.textContent || '',
          titleClass: document.querySelector('#resultTitle')?.className || '',
          gloss: document.querySelector('#resultGloss')?.textContent || '',
          chips: document.querySelector('#acceptedChips')?.textContent || '',
          nextDisabled: document.querySelector('#nextNowBtn')?.disabled,
        })`);
        throw new Error(`${error.message}: API=${JSON.stringify(resolved)} UI=${JSON.stringify(detail)}`);
      }
      await click("#nextNowBtn");
      await waitFor("!document.querySelector('#roundSummaryModal')?.classList.contains('hidden')", 4_000, "Japanese success summary");
      assert.equal(await evaluate("document.querySelector('#roundAccuracy').textContent"), "正确率 100%");
      await click("#roundSetupBtn");
    });

    await check("administrator recharge approval, membership editor and entitlement override", async () => {
      await useSession(admin.session, "/admin");
      await waitFor("!document.querySelector('#adminPanel')?.classList.contains('hidden') && document.querySelector('#adminPanel').getAttribute('aria-busy') === 'false'", 15_000, "admin panel");
      await click('[data-admin-view="adminRechargeView"]');
      const requestSelector = `#adminRechargeList [data-request-id]`;
      await waitFor(`[...document.querySelectorAll(${JSON.stringify(requestSelector)})].some(node => node.textContent.includes(${JSON.stringify(USERNAME)}))`, 8_000, "user recharge request");
      await evaluate(`(() => { const card=[...document.querySelectorAll(${JSON.stringify(requestSelector)})].find(node => node.textContent.includes(${JSON.stringify(USERNAME)})); card.querySelector('[data-recharge-approve]').click(); return true; })()`);
      await click("#acceptConfirmBtn");
      await waitFor(`![...document.querySelectorAll(${JSON.stringify(requestSelector)})].find(node => node.textContent.includes(${JSON.stringify(USERNAME)}))?.querySelector('[data-recharge-approve]')`, 12_000, "recharge approved");
      await click('[data-admin-view="adminUsersView"]');
      await setFields({ "#adminUserSearch": USERNAME });
      await waitFor("document.querySelectorAll('#adminUserList .admin-user-card').length === 1", 5_000, "admin user search");
      await click("#adminUserList [data-admin-edit]");
      await waitFor("!document.querySelector('#adminEditModal')?.classList.contains('hidden')", 3_000, "admin editor");
      assert.deepEqual(
        await evaluate("[...document.querySelector('#adminMembershipSelect').options].map(option => option.value).filter(Boolean)"),
        ["trial_single_language", "dual_language_monthly", "tools_monthly", "japanese_lifetime", "all_access_monthly", "all_access_lifetime"],
      );
      assert.ok((await evaluate("document.querySelector('#adminCurrentMemberships').textContent")).includes("全功能月度会员"));
      await setFields({ "#adminMembershipAction": "grant", "#adminMembershipSelect": "japanese_lifetime", "#adminMembershipStart": "2026.07.16", "#adminMembershipNote": "browser matrix" });
      await click("#saveAdminMembershipBtn");
      await click("#acceptConfirmBtn");
      await waitFor("document.querySelector('#adminEditMessage')?.textContent.includes('立即生效')", 12_000, "membership grant");
      assert.ok((await evaluate("document.querySelector('#adminCurrentMemberships').textContent")).includes("日语单项永久会员"));
      await click("#adminDisableToolsBtn");
      await click("#acceptConfirmBtn");
      await waitFor("document.querySelector('#adminEditMessage')?.textContent.includes('取消工具权限')", 10_000, "tools override off");
      let refreshed = await api("/api/me", null, userSession);
      assert.equal(refreshed.account.tools_access, false);
      await click("#adminEnableToolsBtn");
      await click("#acceptConfirmBtn");
      await waitFor("document.querySelector('#adminEditMessage')?.textContent.includes('恢复按会员方案')", 10_000, "tools override restore");
      refreshed = await api("/api/me", null, userSession);
      assert.equal(refreshed.account.tools_access, true);
      await api("/api/tools/recent", { tool_id: "text-stats" }, userSession);
      await click('[data-close-modal="adminEditModal"]');
      await waitFor("document.querySelector('#adminEditModal')?.classList.contains('hidden')", 3_000, "membership editor closed");
      await click("#refreshAdminBtn");
      await waitFor("!document.querySelector('#refreshAdminBtn')?.disabled", 12_000, "admin stats refresh");
      await click('[data-admin-view="adminAuditView"]');
      assert.ok(Number(await evaluate("document.querySelectorAll('#adminAuditList .admin-log-card').length")) >= 3);
      await click('[data-admin-view="adminLoginView"]');
      assert.ok(Number(await evaluate("document.querySelectorAll('#adminLoginList .admin-login-card').length")) >= 1);
      assert.ok((await evaluate("document.querySelector('#adminLoginList').textContent")).includes("IP"));
      await click('[data-admin-view="adminToolStatsView"]');
      assert.ok(Number(await evaluate("document.querySelectorAll('#adminToolStatsList .admin-log-card').length")) >= 1);
    });

    await check("administrator ban, force logout, secret reset and delete", async () => {
      const banUser = await createUser("banmatrix");
      const logoutUser = await createUser("logoutmatrix");
      const secretUser = await createUser("secretmatrix");
      const deleteUser = await createUser("deletematrix");
      await click("#refreshAdminBtn");
      await waitFor("!document.querySelector('#refreshAdminBtn')?.disabled", 12_000, "new admin users refresh");
      await evaluate("document.querySelector('[data-admin-view=\"adminUsersView\"]').click(); true");

      const openEditor = async (username) => {
        await setFields({ "#adminUserSearch": username });
        await waitFor("document.querySelectorAll('#adminUserList .admin-user-card').length === 1", 5_000, username);
        await click("#adminUserList [data-admin-edit]");
        await waitFor("!document.querySelector('#adminEditModal')?.classList.contains('hidden')", 3_000, `${username} editor`);
      };

      await openEditor(banUser.username);
      await click("#adminToggleBanBtn");
      await click("#acceptConfirmBtn");
      await waitFor("document.querySelector('#adminEditModal')?.classList.contains('hidden')", 8_000, "ban complete");
      assert.equal((await request("/api/login", { username: banUser.username, secret: banUser.secret })).status, 403);
      await openEditor(banUser.username);
      await click("#adminToggleBanBtn");
      await click("#acceptConfirmBtn");
      await waitFor("document.querySelector('#adminEditModal')?.classList.contains('hidden')", 8_000, "unban complete");
      assert.equal((await request("/api/login", { username: banUser.username, secret: banUser.secret })).status, 200);

      await openEditor(logoutUser.username);
      await click("#adminForceLogoutBtn");
      await click("#acceptConfirmBtn");
      await waitFor("document.querySelector('#adminEditModal')?.classList.contains('hidden')", 8_000, "force logout");
      assert.equal((await request("/api/me", null, logoutUser.session)).status, 401);

      await openEditor(secretUser.username);
      await click("#generateAdminSecretBtn");
      const generatedSecret = await evaluate("document.querySelector('#adminNewSecretInput').value");
      assert.equal(generatedSecret.length, 24);
      assert.match(generatedSecret, /[A-Z]/);
      assert.match(generatedSecret, /[a-z]/);
      assert.match(generatedSecret, /[2-9]/);
      assert.match(generatedSecret, /[!@#$%*\-_=+?]/);
      assert.equal(await evaluate("document.querySelector('#adminNewSecretInput').type"), "text");
      await click("#toggleAdminSecretBtn");
      assert.equal(await evaluate("document.querySelector('#adminNewSecretInput').type"), "password");
      await setFields({ "#adminNewSecretInput": USER_SECRET_NEW });
      await click("#saveAdminSecretBtn");
      await click("#acceptConfirmBtn");
      await waitFor("!document.querySelector('#adminSecretResult')?.classList.contains('hidden') && document.querySelector('#adminSecretResultValue')?.textContent.length > 0", 8_000, "secret reset");
      assert.equal(await evaluate("document.querySelector('#adminNewSecretInput').value"), "");
      assert.equal(await evaluate("document.querySelector('#adminNewSecretInput').type"), "password");
      assert.equal(await evaluate("document.querySelector('#adminSecretResultValue').textContent"), USER_SECRET_NEW);
      assert.equal(await evaluate("document.querySelector('#adminSecretResult').classList.contains('hidden')"), false);
      assert.equal((await request("/api/login", { username: secretUser.username, secret: secretUser.secret })).status, 403);
      assert.equal((await request("/api/login", { username: secretUser.username, secret: USER_SECRET_NEW })).status, 200);
      await click('[data-close-modal="adminEditModal"]');
      await waitFor("document.querySelector('#adminEditModal')?.classList.contains('hidden')", 3_000, "secret editor closed");
      assert.equal(await evaluate("document.querySelector('#adminSecretResultValue').textContent"), "");
      assert.equal(await evaluate("document.querySelector('#adminSecretResult').classList.contains('hidden')"), true);

      await openEditor(deleteUser.username);
      await click("#adminDeleteUserBtn");
      await click("#acceptConfirmBtn");
      await waitFor("document.querySelector('#adminEditModal')?.classList.contains('hidden')", 8_000, "delete complete");
      assert.equal((await request("/api/login", { username: deleteUser.username, secret: deleteUser.secret })).status, 403);
    });

    await check("full member toolbox, AI vocabulary and account secret/logout draft cleanup", async () => {
      await useSession(userSession, "/select");
      await waitFor("!document.querySelector('#modulePicker')?.classList.contains('hidden')", 8_000, "member module picker");
      assert.ok((await evaluate("document.querySelector('#moduleMembershipStatus').textContent")).includes("全功能月度会员"));
      await click('[data-module="tools"]');
      await waitFor("location.pathname === '/tools' && !document.querySelector('#toolsPanel')?.classList.contains('hidden')", 12_000, "member tools access");
      await click("#leaveToolsBtn");
      await click('[data-module="language"]');
      await click('[data-project="english"]');
      await waitFor("location.pathname === '/language/english'", 6_000, "member English project");
      await setFields({ "#aiSuggestCount": 3, "#aiSuggestMode": "replace", "#aiLevelSelect": "primary_3" });
      await click("#aiSuggestBtn");
      await waitFor("!document.querySelector('#aiSuggestBtn')?.disabled", 240_000, "AI vocabulary generation");
      assert.ok(Number(await evaluate("document.querySelector('#wordInput').value.split(/\\n/).filter(Boolean).length")) >= 3);
      assert.ok((await evaluate("document.querySelector('#aiSuggestMessage').textContent")).includes("3"));
      await setFields({ "#wordInput": "draft_should_clear" });
      await click("#homeBtn");
      await click("#logoutBtn");
      await waitFor("location.pathname === '/login' && !document.querySelector('#authPanel')?.classList.contains('hidden')", 10_000, "logout");
      await setFields({ "#usernameInput": USERNAME, "#secretInput": USER_SECRET });
      await click("#loginSubmitBtn");
      await waitFor("location.pathname === '/select'", 10_000, "relogin");
      await click('[data-module="language"]');
      await click('[data-project="english"]');
      await waitFor("location.pathname === '/language/english'", 6_000, "English after relogin");
      assert.equal(await evaluate("document.querySelector('#wordInput').value"), "");
      await click("#accountBtn");
      await waitFor("!document.querySelector('#accountModal')?.classList.contains('hidden')", 3_000, "account modal");
      assert.ok((await evaluate("document.querySelector('#accountDetails').textContent")).includes(USERNAME));
      await setFields({ "#currentSecretInput": USER_SECRET, "#newSecretInput": USER_SECRET_NEW, "#newSecretConfirmInput": USER_SECRET_NEW });
      await click("#changeSecretForm button[type=submit]");
      await waitFor("document.querySelector('#accountMessage')?.textContent.includes('密钥已修改')", 10_000, "own secret change");
      await waitFor("location.pathname === '/login'", 5_000, "logout after secret change");
      assert.equal((await request("/api/login", { username: USERNAME, secret: USER_SECRET })).status, 403);
      assert.equal((await request("/api/login", { username: USERNAME, secret: USER_SECRET_NEW })).status, 200);
    });

    await check("self-service account deletion", async () => {
      const disposable = await createUser("selfdelete");
      await useSession(disposable.session, "/select");
      await click("#accountBtn");
      await click("#openDeleteAccountBtn");
      await waitFor("!document.querySelector('#deleteAccountModal')?.classList.contains('hidden')", 3_000, "delete confirmation");
      await setFields({ "#deleteSecretInput": disposable.secret });
      await click("#confirmDeleteAccountBtn");
      await waitFor("location.pathname === '/login'", 10_000, "self deletion");
      assert.equal((await request("/api/login", { username: disposable.username, secret: disposable.secret })).status, 403);
    });

    await check("mobile layout and reduced-motion startup", async () => {
      await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await navigate(`/login?mobile-matrix=${RUN_ID}`);
      const started = Date.now();
      await waitFor("!document.querySelector('#entryScreen')", 2_500, "reduced-motion splash");
      assert.ok(Date.now() - started < 2_000);
      const mobile = await evaluate(`({
        viewport: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        inputWidth: document.querySelector('#usernameInput').getBoundingClientRect().width,
      })`);
      assert.ok(mobile.scrollWidth <= mobile.viewport + 1, JSON.stringify(mobile));
      assert.ok(mobile.bodyScrollWidth <= mobile.viewport + 1, JSON.stringify(mobile));
      assert.ok(mobile.inputWidth > 250, JSON.stringify(mobile));
      const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
      fs.writeFileSync(path.join(TEST_ROOT, `mobile-app-${RUN_ID}.png`), Buffer.from(shot.data, "base64"));
      await send("Emulation.clearDeviceMetricsOverride");
      await send("Emulation.setEmulatedMedia", { features: [] });
    });

    const expectedDeniedPaths = new Set(["/api/tools/access", "/api/quiz/start"]);
    const unexpectedHttpErrors = networkHttpErrors.filter((item) => {
      const pathname = new URL(item.url).pathname;
      return item.status !== 403 || !expectedDeniedPaths.has(pathname);
    });
    assert.deepEqual(unexpectedHttpErrors, [], `unexpected browser HTTP errors: ${JSON.stringify(networkHttpErrors)}`);
    assert.deepEqual(runtimeErrors, [], `browser runtime errors: ${JSON.stringify(runtimeErrors)}`);
    const result = {
      account: USERNAME,
      checks: checks.length,
      passed: checks.length,
      downloads: fs.readdirSync(DOWNLOAD_ROOT).filter((name) => !name.endsWith(".crdownload")).length,
      dialogs,
      runtimeErrors,
      expectedHttpDenials: networkHttpErrors,
      details: checks,
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.send("Target.closeTarget", { targetId }).catch(() => {});
    client.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

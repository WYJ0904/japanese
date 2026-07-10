const APP_VERSION = "2026-07-10-2300";
const NORMAL_RESULT_VISIBLE_MS = 3000;
const AI_RESULT_VISIBLE_MS = 3000;
const API_TIMEOUT_MS = 100000;
const STATUS_TIMEOUT_MS = 8000;
const PDF_TIMEOUT_MS = 120000;
const MAX_WRONG_BOOK_ITEMS = 250;
const MAX_ACCEPTED_ANSWERS = 14;
const MAX_RUBRIC_CACHE_ITEMS = 500;
const WRONG_BOOK_EXPORT_TYPE = "vocab-wrong-book";
const WRONG_BOOK_EXPORT_VERSION = 1;
const DEFAULT_PROFILE = "我";
const LANGUAGE_LABELS = {
  english: "英语",
  japanese: "日语",
};
const PRACTICE_LABELS = {
  meaning: "释义",
  dictation: "听写",
};
const SKIPPED_ANSWER = "（跳过）";
const EMPTY_ANSWER = "（空白）";
const ACHIEVEMENTS = [
  { id: "firstQuiz", title: "开测", desc: "完成一次词表测试。" },
  { id: "firstDictation", title: "听写启动", desc: "完成一次听写练习。" },
  { id: "firstCorrect", title: "第一题正确", desc: "答对任意一道题。" },
  { id: "skipSaved", title: "跳过也记录", desc: "跳过的词已进入错题本。" },
  { id: "wrongTen", title: "错题收藏家", desc: "历史错题达到 10 个。" },
  { id: "perfectRound", title: "满分一轮", desc: "整轮测试全部答对。" },
  { id: "firstPdf", title: "练习册生成", desc: "导出一次 PDF 错题本。" },
  { id: "longRound", title: "长跑", desc: "完成 20 题以上的一轮测试。" },
];

const $ = (id) => document.getElementById(id);

let resultHideTimer = null;
let nextTimer = null;
let judgeController = null;
let backendAvailable = false;
let aiAvailable = false;
let pendingScreen = "auth";
let pendingAuthMessage = "";
let currentProject = "";
let projectRuntimeNeedsRestore = false;
const projectRuntime = {
  english: null,
  japanese: null,
};
const BACKEND_OFFLINE_MESSAGE = "未连接本地后端，请先运行本地服务并配置 Cloudflare Pages 的 LOCAL_API_BASE。";

const restoredSession = sessionStorage.getItem("vocabSession") || localStorage.getItem("vocabSession") || "";
if (restoredSession) sessionStorage.setItem("vocabSession", restoredSession);
localStorage.removeItem("vocabSession");

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (_) {
    return fallback;
  }
}

function limitText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeAccepted(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const result = [];
  values.slice(0, MAX_ACCEPTED_ANSWERS).forEach((item) => {
    const value = limitText(item);
    const key = normalizeMeaning(value);
    if (value && key && !seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  });
  return result;
}

function sanitizeWrongBook(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const cleaned = {};
  Object.entries(value)
    .slice(0, MAX_WRONG_BOOK_ITEMS)
    .forEach(([word, info]) => {
      if (!info || typeof info !== "object" || Array.isArray(info)) return;
      const key = limitText(word, 240);
      if (!key) return;
      const count = Number.parseInt(info.wrong_count, 10);
      cleaned[key] = {
        wrong_count: Number.isFinite(count) ? Math.max(0, Math.min(9999, count)) : 0,
        last_answer: limitText(info.last_answer),
        correct_answer: limitText(info.correct_answer),
        accepted: sanitizeAccepted(info.accepted),
        skipped: Boolean(info.skipped),
        last_time: limitText(info.last_time, 80),
      };
    });
  return cleaned;
}

function mergeWrongBooks(current, incoming) {
  const merged = { ...sanitizeWrongBook(current) };
  Object.entries(sanitizeWrongBook(incoming)).forEach(([word, info]) => {
    const previous = merged[word] || {};
    merged[word] = {
      ...previous,
      ...info,
      wrong_count: Math.max(previous.wrong_count || 0, info.wrong_count || 0),
      correct_answer: info.correct_answer || previous.correct_answer || "",
      accepted: info.accepted.length ? info.accepted : previous.accepted || [],
    };
  });
  return sanitizeWrongBook(merged);
}

function trimRubricCache(cache) {
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) return {};
  return Object.fromEntries(Object.entries(cache).slice(-MAX_RUBRIC_CACHE_ITEMS));
}

function sanitizeProfile(value) {
  const cleaned = String(value || "").trim().slice(0, 30);
  return cleaned || DEFAULT_PROFILE;
}

function profileStorageName(profile) {
  return encodeURIComponent(sanitizeProfile(profile));
}

function normalizeQuizLanguage(value) {
  if (value === "english" || value === "japanese") return value;
  return "";
}

function quizLanguageLabel(language) {
  return LANGUAGE_LABELS[language] || "未选语言";
}

function normalizePracticeMode(value) {
  if (value === "dictation") return "dictation";
  return "meaning";
}

function practiceModeLabel(mode) {
  return PRACTICE_LABELS[mode] || "释义";
}

function wordMatchesLanguage(word, language) {
  const value = String(word || "").trim();
  if (!value) return false;
  if (language === "english") return /^[A-Za-z][A-Za-z'-]*$/.test(value);
  if (language === "japanese") return /[\u3040-\u30ff\u3400-\u9fff々〆ヶ]/u.test(value);
  return true;
}

function filterWordsByLanguage(words, language) {
  return words.filter((word) => wordMatchesLanguage(word, language));
}

function filterWrongBookByLanguage(book, language = state.quizLanguage) {
  if (!language) return {};
  return Object.fromEntries(Object.entries(book || {}).filter(([word]) => wordMatchesLanguage(word, language)));
}

function removeLanguageFromWrongBook(book, language = state.quizLanguage) {
  return Object.fromEntries(Object.entries(book || {}).filter(([word]) => !wordMatchesLanguage(word, language)));
}

const state = {
  session: restoredSession,
  profile: sanitizeProfile(localStorage.getItem("vocabProfile") || DEFAULT_PROFILE),
  gradingMode: localStorage.getItem("gradingMode") || "normal",
  practiceMode: normalizePracticeMode(localStorage.getItem("practiceMode")),
  quizLanguage: "",
  words: [],
  index: 0,
  score: 0,
  mode: "normal",
  busy: false,
  wrongScope: "current",
  rubricCache: loadJson("rubricCache", {}),
  currentWrongBook: {},
  historyWrongBook: {},
  achievements: {},
};

function wrongBookKey(scope) {
  return `wrongBook:${scope}:${profileStorageName(state.profile)}`;
}

function achievementKey() {
  return `achievements:${profileStorageName(state.profile)}`;
}

function migrateLegacyWrongBook() {
  const flag = `wrongBookMigrated:${profileStorageName(state.profile)}`;
  const legacy = loadJson("wrongBook", {});
  if (localStorage.getItem(flag) || !Object.keys(legacy).length) return;

  state.historyWrongBook = { ...legacy, ...state.historyWrongBook };
  localStorage.setItem(flag, "1");
  localStorage.removeItem("wrongBook");
}

function loadWrongBooks() {
  state.currentWrongBook = sanitizeWrongBook(loadJson(wrongBookKey("current"), {}));
  state.historyWrongBook = sanitizeWrongBook(loadJson(wrongBookKey("history"), {}));
  migrateLegacyWrongBook();
}

function saveWrongBooks() {
  localStorage.setItem(wrongBookKey("current"), JSON.stringify(state.currentWrongBook));
  localStorage.setItem(wrongBookKey("history"), JSON.stringify(state.historyWrongBook));
}

function loadAchievements() {
  state.achievements = loadJson(achievementKey(), {});
}

function saveAchievements() {
  localStorage.setItem(achievementKey(), JSON.stringify(state.achievements));
}

function saveState() {
  localStorage.setItem("vocabAppVersion", APP_VERSION);
  localStorage.setItem("vocabProfile", state.profile);
  localStorage.setItem("gradingMode", state.gradingMode);
  localStorage.setItem("practiceMode", state.practiceMode);
  localStorage.setItem("quizLanguage", state.quizLanguage);
  state.rubricCache = trimRubricCache(state.rubricCache);
  localStorage.setItem("rubricCache", JSON.stringify(state.rubricCache));
  saveWrongBooks();
  saveAchievements();
}

function activeWrongBook(scope = state.wrongScope) {
  const source = scope === "history" ? state.historyWrongBook : state.currentWrongBook;
  return filterWrongBookByLanguage(source);
}

function hasLocalReviewData() {
  return Object.keys(activeWrongBook("current")).length > 0 || Object.keys(activeWrongBook("history")).length > 0;
}

function setActiveWrongBook(scope, book) {
  if (scope === "history") state.historyWrongBook = book;
  else state.currentWrongBook = book;
}

function clearSession() {
  state.session = "";
  sessionStorage.removeItem("vocabSession");
  localStorage.removeItem("vocabSession");
}

function wordDraftKey(language = state.quizLanguage, profile = state.profile) {
  return `vocabWords:${language}:${profileStorageName(profile)}`;
}

function saveCurrentWordDraft() {
  const input = $("wordInput");
  if (!input || !currentProject) return;
  localStorage.setItem(wordDraftKey(currentProject), input.value);
}

function loadCurrentWordDraft() {
  const input = $("wordInput");
  if (!input || !currentProject) return;
  input.value = localStorage.getItem(wordDraftKey(currentProject)) || "";
}

function saveProjectRuntime() {
  if (!currentProject) return;
  projectRuntime[currentProject] = {
    words: [...state.words],
    index: state.index,
    score: state.score,
    mode: state.mode,
    view: document.querySelector(".view.active")?.id || "setupView",
  };
}

function restoreProjectRuntime() {
  if (!currentProject || !projectRuntimeNeedsRestore) return;
  projectRuntimeNeedsRestore = false;
  const runtime = projectRuntime[currentProject];
  if (!runtime) {
    state.words = [];
    state.index = 0;
    state.score = 0;
    state.mode = "normal";
    setView("setupView");
    updateStats();
    return;
  }
  state.words = [...runtime.words];
  state.index = Math.min(runtime.index, Math.max(0, state.words.length - 1));
  state.score = runtime.score;
  state.mode = runtime.mode;
  const view = runtime.view === "quizView" && !state.words.length ? "setupView" : runtime.view;
  setView(view);
  if (view === "quizView" && state.words.length) showWord();
  updateStats();
}

function runSplashSequence() {
  const screen = $("entryScreen");
  const media = $("splashMedia");
  const image = $("splashImage");
  if (!screen) return Promise.resolve();

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const visibleMs = reducedMotion ? 360 : 2180;
  const fadeMs = reducedMotion ? 200 : 620;

  const markImageFailed = () => {
    media?.classList.add("image-failed");
    $("splashFallback")?.setAttribute("aria-hidden", "false");
  };
  image?.addEventListener("error", markImageFailed, { once: true });
  if (image?.complete && !image.naturalWidth) markImageFailed();

  return new Promise((resolve) => {
    window.setTimeout(() => {
      screen.classList.add("is-leaving");
      window.setTimeout(() => {
        screen.classList.add("is-hidden");
        screen.setAttribute("aria-hidden", "true");
        resolve();
      }, fadeMs);
    }, visibleMs);
  });
}

function showLanguageGate() {
  showProjectPicker();
}

function showProjectPicker() {
  if (currentProject) {
    saveCurrentWordDraft();
    saveProjectRuntime();
  }
  if (judgeController) judgeController.abort();
  clearNextTimer();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  currentProject = "";
  state.quizLanguage = "";
  $("projectApp").classList.add("hidden");
  $("projectApp").setAttribute("aria-hidden", "true");
  $("topbar").classList.add("hidden");
  $("authPanel").classList.add("hidden");
  $("workspace").classList.add("hidden");
  $("projectPicker").classList.remove("hidden");
  $("projectPicker").setAttribute("aria-hidden", "false");
  document.body.classList.add("project-picker-active");
}

function showMainShell() {
  if (!currentProject) return;
  $("languagePanel").classList.add("hidden");
  $("projectPicker").classList.add("hidden");
  $("projectPicker").setAttribute("aria-hidden", "true");
  $("projectApp").classList.remove("hidden");
  $("projectApp").setAttribute("aria-hidden", "false");
  $("topbar").classList.remove("hidden");
  document.body.classList.remove("project-picker-active");
}

function applyPendingScreen() {
  if (!currentProject) return;
  if (pendingScreen === "workspace") showWorkspace();
  else showAuth(pendingAuthMessage);
}

function enterProject(value) {
  const language = normalizeQuizLanguage(value);
  if (!language) return;
  if (currentProject && currentProject !== language) {
    saveCurrentWordDraft();
    saveProjectRuntime();
  }
  currentProject = language;
  state.quizLanguage = language;
  projectRuntimeNeedsRestore = true;
  loadCurrentWordDraft();
  saveState();
  updateLanguageUi();
  applyPendingScreen();
}

function showAuth(message = "") {
  pendingScreen = "auth";
  pendingAuthMessage = message;
  if (!currentProject) return;
  showMainShell();
  $("authPanel").classList.remove("hidden");
  $("workspace").classList.add("hidden");
  $("loginError").textContent = message;
  $("offlineReviewBtn").classList.toggle("hidden", !hasLocalReviewData());
}

function showWorkspace() {
  pendingScreen = "workspace";
  if (!currentProject) return;
  showMainShell();
  $("authPanel").classList.add("hidden");
  $("workspace").classList.remove("hidden");
  $("statusDot").classList.toggle("online", backendAvailable && aiAvailable);
  if (!backendAvailable) $("modelLabel").textContent = "本地复习";
  else if (!aiAvailable) $("modelLabel").textContent = "AI 未启动";
  restoreProjectRuntime();
}

function updateLanguageUi() {
  const language = state.quizLanguage;
  const select = $("languageSelect");
  if (select) select.value = language;

  document.querySelectorAll("[data-language-choice]").forEach((button) => {
    button.classList.toggle("active", button.dataset.languageChoice === language);
  });

  const quizLabel = $("quizLanguageLabel");
  if (quizLabel) quizLabel.textContent = quizLanguageLabel(language);
  const projectLabel = $("projectNameLabel");
  if (projectLabel) projectLabel.textContent = language ? `${quizLanguageLabel(language)}测试` : "";
  const input = $("wordInput");
  if (input) input.placeholder = language === "japanese" ? "输入日语词表，每行一个词" : "输入英语词表，每行一个词";
}

function updatePracticeUi() {
  const select = $("practiceModeSelect");
  if (select) select.value = state.practiceMode;
  const label = $("practiceModeLabel");
  if (label) label.textContent = practiceModeLabel(state.practiceMode);
}

function setQuizLanguage(value) {
  const language = normalizeQuizLanguage(value);
  if (!language) return;
  if (!currentProject) enterProject(language);
}

function setPracticeMode(value) {
  state.practiceMode = normalizePracticeMode(value);
  saveState();
  updatePracticeUi();
  updateStats();
}

function ensureQuizLanguage() {
  if (state.quizLanguage) return state.quizLanguage;
  showProjectPicker();
  alert("请先从项目选择页进入英语测试或日语测试。");
  return "";
}

function unlockAchievement(id) {
  const item = ACHIEVEMENTS.find((achievement) => achievement.id === id);
  if (!item || state.achievements[id]) return;
  state.achievements[id] = new Date().toLocaleString();
  saveAchievements();
  renderAchievements();
}

function renderAchievements() {
  const list = $("achievementList");
  if (!list) return;
  list.innerHTML = "";
  const unlockedCount = ACHIEVEMENTS.filter((item) => state.achievements[item.id]).length;
  $("achievementSummary").textContent = `${state.profile} · ${unlockedCount}/${ACHIEVEMENTS.length}`;

  ACHIEVEMENTS.forEach((item) => {
    const node = document.createElement("article");
    const unlockedAt = state.achievements[item.id];
    node.className = `achievement-item${unlockedAt ? " unlocked" : ""}`;
    const title = document.createElement("h3");
    const name = document.createElement("strong");
    const mark = document.createElement("span");
    const desc = document.createElement("p");
    name.textContent = item.title;
    mark.textContent = unlockedAt ? "已获得" : "未获得";
    title.appendChild(name);
    title.appendChild(mark);
    desc.textContent = unlockedAt ? `${item.desc} · ${unlockedAt}` : item.desc;
    node.appendChild(title);
    node.appendChild(desc);
    list.appendChild(node);
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const { controller: suppliedController, ...requestOptions } = options;
  const controller = suppliedController || new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...requestOptions, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      const wrapped = new Error(timedOut ? "请求超时，请稍后重试" : "请求已取消");
      wrapped.name = "AbortError";
      throw wrapped;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function api(path, body = {}, options = {}) {
  const response = await fetchWithTimeout(
    path,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Token": state.session,
      },
      body: JSON.stringify(body),
      controller: options.controller,
    },
    options.timeoutMs || API_TIMEOUT_MS,
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      showAuth("登录已失效，请重新输入口令");
      throw new Error("登录已失效，请重新输入口令");
    }
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function setView(id) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".tabs button").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === id));
  if (id === "wrongView") renderWrongBook();
  if (id === "achievementsView") renderAchievements();
}

function updateStats() {
  const parsedWords = parseWords();
  const eligibleWords = state.quizLanguage ? filterWordsByLanguage(parsedWords, state.quizLanguage) : parsedWords;
  $("statWords").textContent = eligibleWords.length || state.words.length;
  $("statWrong").textContent = Object.keys(activeWrongBook("current")).length;
  $("statScore").textContent = state.score;
}

function setBusy(busy) {
  state.busy = busy;
  ["startBtn", "submitBtn", "skipBtn", "reviewBtn", "reviewHistoryBtn", "speakBtn"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = busy;
  });
}

function setNextNowEnabled(enabled) {
  const el = $("nextNowBtn");
  if (el) el.disabled = !enabled || state.busy;
}

function clearNextTimer() {
  if (nextTimer) {
    clearTimeout(nextTimer);
    nextTimer = null;
  }
}

function hideResultPanel() {
  if (resultHideTimer) {
    clearTimeout(resultHideTimer);
    resultHideTimer = null;
  }
  $("resultPanel").classList.remove("grading", "ai-review");
  $("resultPanel").classList.add("hidden");
}

function resultVisibleMs(result = {}) {
  return result.ai_review ? AI_RESULT_VISIBLE_MS : NORMAL_RESULT_VISIBLE_MS;
}

function scheduleResultHide(delayMs = NORMAL_RESULT_VISIBLE_MS) {
  if (resultHideTimer) clearTimeout(resultHideTimer);
  resultHideTimer = setTimeout(() => {
    resultHideTimer = null;
    $("resultPanel").classList.add("hidden");
  }, delayMs);
}

function scheduleNext(delayMs) {
  clearNextTimer();
  setNextNowEnabled(true);
  nextTimer = setTimeout(() => {
    nextTimer = null;
    nextWord();
  }, delayMs);
}

function isDictationMode() {
  return state.mode === "normal" && state.practiceMode === "dictation";
}

function speechLang() {
  return state.quizLanguage === "japanese" ? "ja-JP" : "en-US";
}

function speakCurrentWord() {
  const word = state.words[state.index];
  if (!word || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = speechLang();
  utterance.rate = state.quizLanguage === "japanese" ? 0.82 : 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function normalizeDictationAnswer(value) {
  const normalized = String(value || "").normalize("NFKC").trim();
  if (state.quizLanguage === "english") return normalized.toLowerCase().replace(/\s+/g, " ");
  return normalized.replace(/\s+/g, "");
}

function dictationCorrect(word, answer) {
  return normalizeDictationAnswer(word) === normalizeDictationAnswer(answer);
}

function normalizeMeaning(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、；：,.!?;:（）()\[\]{}<>《》"“”‘’·•/\\|]/g, "");
}

function splitMeanings(value) {
  return String(value || "")
    .split(/[\/、，,；;：:|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function semanticMeaningForms(value) {
  const forms = new Set([normalizeMeaning(value)]);
  let changed = true;
  while (changed) {
    changed = false;
    [...forms].forEach((form) => {
      const additions = [];
      if (form.length > 1 && "的地得".includes(form.at(-1))) additions.push(form.slice(0, -1));
      if (form.length >= 3 && form.startsWith("有")) additions.push(form.slice(1));
      if (form.length >= 3 && form.endsWith("性")) additions.push(form.slice(0, -1));
      additions.forEach((item) => {
        if (item && !forms.has(item)) {
          forms.add(item);
          changed = true;
        }
      });
    });
  }
  forms.delete("");
  return forms;
}

function meaningBigrams(value) {
  const normalized = normalizeMeaning(value);
  if (normalized.length < 2) return normalized ? new Set([normalized]) : new Set();
  return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
}

function meaningSimilarity(left, right) {
  const a = meaningBigrams(left);
  const b = meaningBigrams(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / new Set([...a, ...b]).size;
}

function reviewEntryForWord(word) {
  if (state.mode === "review-current") return state.currentWrongBook[word];
  if (state.mode === "review-history") return state.historyWrongBook[word];
  return null;
}

function rubricCacheKey(word) {
  return `${APP_VERSION}:${state.quizLanguage}:${String(word || "").trim()}`;
}

function cachedRubric(word) {
  return state.rubricCache[rubricCacheKey(word)] || state.rubricCache[word] || null;
}

function hasUsableMeaning(info) {
  const answer = limitText(info && info.correct_answer);
  return Boolean(answer && !answer.startsWith("跳过：") && answer !== "（未给出释义）");
}

function localReviewResult(word, answer, info) {
  const gloss = limitText(info && info.correct_answer) || "（未给出释义）";
  const accepted = sanitizeAccepted(info && info.accepted);
  const pool = [...new Set([gloss, ...accepted].flatMap(splitMeanings))];
  const student = normalizeMeaning(answer);
  let correct = false;

  if (student) {
    const studentForms = semanticMeaningForms(student);
    correct = pool.some((item) => {
      const expected = normalizeMeaning(item);
      if (!expected) return false;
      const expectedForms = semanticMeaningForms(expected);
      if ([...studentForms].some((form) => expectedForms.has(form))) return true;
      if (state.gradingMode === "strict") return false;
      if (student.length >= 3 && expected.length >= 3 && (student.includes(expected) || expected.includes(student))) return true;
      return Math.min(student.length, expected.length) >= 3 && meaningSimilarity(student, expected) >= 0.67;
    });
  }

  return {
    correct,
    gloss,
    accepted,
    rubric: { language: quizLanguageLabel(state.quizLanguage), gloss, accepted, notes: "本地错题复习" },
    kind: "local-review",
    ai_review: false,
    grading_mode: state.gradingMode,
    word,
    answer,
  };
}

function parseWords() {
  return $("wordInput")
    .value.split(/[\s,，、;；]+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function startQuiz(words, mode = "normal") {
  const language = ensureQuizLanguage();
  if (!language) return;

  if (mode === "normal" && state.practiceMode === "meaning" && (!backendAvailable || !aiAvailable || !state.session)) {
    if (backendAvailable && !aiAvailable) {
      alert("本地后端在线，但 Ollama 尚未启动。请重新运行桌面启动程序；错题复习仍可本地进行。");
    } else if (backendAvailable) {
      showAuth("首次在线判卷需要登录本地 AI；错题复习仍可离线进行。");
    } else {
      alert("当前离线：可以进行听写或错题复习；首次释义判卷需要本地 AI 在线。");
    }
    return;
  }

  const uniqueWords = [...new Set(words.map((word) => String(word).trim()).filter(Boolean))];
  if (!uniqueWords.length) return;

  const quizWords = filterWordsByLanguage(uniqueWords, language);
  const excludedCount = uniqueWords.length - quizWords.length;
  if (!quizWords.length) {
    alert(`当前选择的是${quizLanguageLabel(language)}，词表里没有可测试的${quizLanguageLabel(language)}词。`);
    return;
  }
  if (excludedCount > 0) {
    alert(`已按${quizLanguageLabel(language)}模式排除 ${excludedCount} 个其他语言的词。`);
  }

  clearNextTimer();
  hideResultPanel();
  setNextNowEnabled(false);

  if (mode === "normal") {
    state.currentWrongBook = removeLanguageFromWrongBook(state.currentWrongBook, language);
    state.wrongScope = "current";
    saveWrongBooks();
  }

  state.words = shuffle(quizWords);
  state.index = 0;
  state.score = 0;
  state.mode = mode;
  unlockAchievement("firstQuiz");
  if (isDictationMode()) unlockAchievement("firstDictation");
  updateStats();
  setView("quizView");
  showWord();
}

function showWord() {
  const word = state.words[state.index] || "-";
  const dictation = isDictationMode();
  $("wordLabel").textContent = dictation ? "听写" : word;
  $("wordLabel").classList.toggle("dictation-display", dictation);
  $("progressLabel").textContent = `${state.index + 1}/${state.words.length}`;
  $("scoreLabel").textContent = `得分 ${state.score}`;
  $("quizLanguageLabel").textContent = quizLanguageLabel(state.quizLanguage);
  $("practiceModeLabel").textContent = state.mode.startsWith("review-") ? "错题复习" : practiceModeLabel(state.practiceMode);
  $("answerInput").value = "";
  $("answerInput").placeholder = dictation ? "输入听到的单词" : "中文意思";
  $("speakBtn").classList.toggle("hidden", !dictation);
  hideResultPanel();
  clearNextTimer();
  setNextNowEnabled(false);
  $("acceptedChips").innerHTML = "";
  $("answerInput").focus();
  if (dictation) speakCurrentWord();
}

function updateWrongEntry(book, word, answer, gloss, accepted) {
  const current = book[word] || { wrong_count: 0 };
  book[word] = {
    wrong_count: (current.wrong_count || 0) + 1,
    last_answer: answer,
    correct_answer: gloss,
    accepted: accepted || [],
    skipped: answer === SKIPPED_ANSWER,
    last_time: new Date().toLocaleString(),
  };
}

function markWrong(word, answer, gloss, accepted) {
  updateWrongEntry(state.currentWrongBook, word, answer, gloss, accepted);
  updateWrongEntry(state.historyWrongBook, word, answer, gloss, accepted);
  saveState();
  updateStats();
  if (answer === SKIPPED_ANSWER) unlockAchievement("skipSaved");
  if (Object.keys(state.historyWrongBook).length >= 10) unlockAchievement("wrongTen");
}

function removeReviewedWord(word) {
  if (state.mode === "review-current") delete state.currentWrongBook[word];
  if (state.mode === "review-history") delete state.historyWrongBook[word];
  saveState();
}

function renderResult(result) {
  $("resultPanel").classList.remove("hidden", "grading", "ai-review");
  void $("resultPanel").offsetWidth;
  $("resultPanel").classList.toggle("ai-review", Boolean(result.ai_review));
  $("resultTitle").className = `result-title ${result.correct ? "ok" : "bad"}`;
  $("resultTitle").textContent = result.correct ? "正确" : "错误";
  $("resultGloss").textContent = `${result.kind === "dictation" ? "正确答案" : "标准释义"}：${result.gloss || "（未给出）"}`;
  $("acceptedChips").innerHTML = "";
  (result.accepted || []).slice(0, 12).forEach((item) => {
    const chip = document.createElement("span");
    chip.textContent = item;
    $("acceptedChips").appendChild(chip);
  });
  scheduleResultHide(resultVisibleMs(result));
}

function renderSkipResult() {
  $("resultPanel").classList.remove("hidden", "grading", "ai-review");
  void $("resultPanel").offsetWidth;
  $("resultTitle").className = "result-title bad";
  $("resultTitle").textContent = "已跳过";
  $("resultGloss").textContent = "已加入错题本";
  $("acceptedChips").innerHTML = "";
  scheduleResultHide(900);
}

function nextWord() {
  clearNextTimer();
  setNextNowEnabled(false);
  if (state.index < state.words.length - 1) {
    state.index += 1;
    showWord();
  } else {
    finishRound();
    setView(Object.keys(activeWrongBook("current")).length ? "wrongView" : "setupView");
  }
}

function finishRound() {
  if (!state.words.length) return;
  if (state.score === state.words.length) unlockAchievement("perfectRound");
  if (state.words.length >= 20) unlockAchievement("longRound");
}

function skipWord() {
  if (state.busy) return;
  if (nextTimer) {
    nextWord();
    return;
  }

  const word = state.words[state.index];
  if (!word) return;
  const rubric = cachedRubric(word);
  markWrong(word, SKIPPED_ANSWER, rubric && rubric.gloss ? rubric.gloss : "跳过：未作答", rubric && rubric.accepted ? rubric.accepted : []);
  renderSkipResult();
  updateStats();
  scheduleNext(900);
}

async function submitAnswer(event) {
  event.preventDefault();
  if (state.busy) return;
  const word = state.words[state.index];
  const answer = $("answerInput").value.trim();
  if (!word) return;

  if (isDictationMode()) {
    clearNextTimer();
    hideResultPanel();
    setNextNowEnabled(false);
    const correct = dictationCorrect(word, answer);
    if (correct) {
      state.score += 1;
      removeReviewedWord(word);
      unlockAchievement("firstCorrect");
    } else {
      markWrong(word, answer || EMPTY_ANSWER, word, [word]);
    }
    saveState();
    renderResult({
      correct,
      gloss: word,
      accepted: [word],
      kind: "dictation",
    });
    updateStats();
    scheduleNext(NORMAL_RESULT_VISIBLE_MS);
    return;
  }

  if (state.mode === "review-current" || state.mode === "review-history") {
    setBusy(true);
    clearNextTimer();
    hideResultPanel();
    setNextNowEnabled(false);

    try {
      let info = reviewEntryForWord(word);
      if (!info) throw new Error("错题记录不存在，请重新进入错题复习");

      if (!hasUsableMeaning(info) && backendAvailable && aiAvailable && state.session) {
        $("resultPanel").classList.remove("hidden");
        $("resultTitle").className = "result-title";
        $("resultTitle").textContent = "首次准备释义";
        $("resultGloss").textContent = "正在调用本地 AI，保存后续离线复习所需的标准答案";
        const data = await api("/api/rubric", { word });
        const rubric = data.rubric || {};
        info.correct_answer = limitText(rubric.gloss) || info.correct_answer;
        info.accepted = sanitizeAccepted(rubric.accepted);
        state.rubricCache[rubricCacheKey(word)] = rubric;
        saveState();
      }

      info = reviewEntryForWord(word);
      if (!hasUsableMeaning(info)) {
        throw new Error("这条旧错题没有保存标准释义；请连接本地 AI 后再复习一次。");
      }

      const result = localReviewResult(word, answer, info);
      if (result.correct) {
        state.score += 1;
        removeReviewedWord(word);
        unlockAchievement("firstCorrect");
      } else {
        markWrong(word, answer || EMPTY_ANSWER, result.gloss, result.accepted);
      }
      saveState();
      renderResult(result);
      updateStats();
      scheduleNext(NORMAL_RESULT_VISIBLE_MS);
    } catch (error) {
      $("resultPanel").classList.remove("grading", "ai-review", "hidden");
      $("resultTitle").className = "result-title bad";
      $("resultTitle").textContent = "本地复习暂不可用";
      $("resultGloss").textContent = error.message;
      scheduleResultHide();
    } finally {
      setBusy(false);
      if (nextTimer) setNextNowEnabled(true);
    }
    return;
  }

  setBusy(true);
  clearNextTimer();
  hideResultPanel();
  setNextNowEnabled(false);
  $("resultPanel").classList.add("grading");
  $("resultPanel").classList.remove("hidden");
  $("resultTitle").className = "result-title";
  $("resultTitle").textContent = "判卷中";
  $("resultGloss").textContent = "";
  $("acceptedChips").innerHTML = "";
  judgeController = new AbortController();
  $("cancelJudgeBtn").classList.remove("hidden");

  try {
    const result = await api("/api/judge", {
      word,
      answer,
      rubric: cachedRubric(word),
      mode: state.gradingMode,
      language: state.quizLanguage,
    }, { controller: judgeController, timeoutMs: API_TIMEOUT_MS });
    if (result.rubric) state.rubricCache[rubricCacheKey(word)] = result.rubric;

    if (result.correct) {
      state.score += 1;
      removeReviewedWord(word);
      unlockAchievement("firstCorrect");
    } else {
      markWrong(word, answer, result.gloss, result.accepted);
    }

    saveState();
    renderResult(result);
    updateStats();
    scheduleNext(resultVisibleMs(result));
  } catch (error) {
    $("resultPanel").classList.remove("grading", "ai-review");
    $("resultTitle").className = "result-title bad";
    $("resultTitle").textContent = "判卷失败";
    $("resultGloss").textContent = error.message;
    scheduleResultHide();
  } finally {
    judgeController = null;
    $("cancelJudgeBtn").classList.add("hidden");
    setBusy(false);
    if (nextTimer) setNextNowEnabled(true);
  }
}

function setWrongScope(scope) {
  state.wrongScope = scope === "history" ? "history" : "current";
  $("currentWrongTab").classList.toggle("active", state.wrongScope === "current");
  $("historyWrongTab").classList.toggle("active", state.wrongScope === "history");
  renderWrongBook();
}

function renderWrongBook() {
  const list = $("wrongList");
  list.innerHTML = "";
  const scope = state.wrongScope;
  const book = activeWrongBook(scope);
  const entries = Object.entries(book).sort((a, b) => (b[1].wrong_count || 0) - (a[1].wrong_count || 0));
  $("wrongScopeLabel").textContent = `${state.profile} · ${scope === "history" ? "历史错题" : "本轮错题"} · ${entries.length} 个`;

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "error";
    empty.textContent = scope === "history" ? "历史错题为空" : "本轮还没有错题";
    list.appendChild(empty);
    updateStats();
    return;
  }

  const template = $("wrongItemTemplate");
  entries.forEach(([word, info]) => {
    const node = template.content.cloneNode(true);
    node.querySelector("h3").textContent = word;
    node.querySelector("p").textContent = info.skipped
      ? `跳过 · ${info.correct_answer || "未作答"}`
      : `你答：${info.last_answer || ""} · 标准：${info.correct_answer || ""}`;
    node.querySelector("strong").textContent = `${info.wrong_count || 0}次`;
    list.appendChild(node);
  });
  updateStats();
}

function startWrongReview(scope) {
  const words = Object.keys(activeWrongBook(scope));
  if (!words.length) {
    renderWrongBook();
    return;
  }
  startQuiz(words, scope === "history" ? "review-history" : "review-current");
}

async function exportWrongBook(scope = "current") {
  const book = activeWrongBook(scope);
  if (!Object.keys(book).length) {
    alert(scope === "history" ? "历史错题为空，暂无可导出的 PDF。" : "本轮错题为空，暂无可导出的 PDF。");
    return;
  }

  const button = scope === "history" ? $("exportHistoryBtn") : $("exportBtn");
  const previousText = button ? button.textContent : "";
  if (button) {
    button.disabled = true;
    button.textContent = "导出中...";
  }

  try {
    const response = await fetchWithTimeout(
      "/api/export-pdf",
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Token": state.session,
        },
        body: JSON.stringify({
          wrongBook: book,
          title: scope === "history" ? "WYJ的网站历史错题本" : "WYJ的网站本轮错题本",
          meta: {
            profile: state.profile,
            scope: scope === "history" ? "历史错题" : "本轮错题",
            grading_mode: state.gradingMode,
            language: state.quizLanguage,
            practice_mode: state.practiceMode,
            achievement_count: ACHIEVEMENTS.filter((item) => state.achievements[item.id]).length,
          },
        }),
      },
      PDF_TIMEOUT_MS,
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        clearSession();
        showAuth("登录已失效，请重新输入口令");
        return;
      }
      alert(data.error || "导出失败");
      return;
    }

    const blob = await response.blob();
    const contentType = response.headers.get("Content-Type") || "";
    const signature = await blob.slice(0, 4).text();
    if (!contentType.includes("application/pdf") || signature !== "%PDF") throw new Error("服务器没有返回有效 PDF");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wrong-book-${scope}-${Date.now()}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    unlockAchievement("firstPdf");
  } catch (error) {
    alert(`导出失败：${error.message || "请检查本地后端连接"}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

function exportWrongData() {
  const payload = {
    type: WRONG_BOOK_EXPORT_TYPE,
    version: WRONG_BOOK_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    profile: state.profile,
    language: state.quizLanguage,
    currentWrongBook: sanitizeWrongBook(activeWrongBook("current")),
    historyWrongBook: sanitizeWrongBook(activeWrongBook("history")),
  };
  const safeProfile = state.profile.replace(/[\\/:*?"<>|]+/g, "-") || "default";
  downloadText(`wrong-book-${safeProfile}-${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function importedWrongBooks(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("错题数据格式不正确");
  }

  if (payload.type === WRONG_BOOK_EXPORT_TYPE) {
    if (Number(payload.version) > WRONG_BOOK_EXPORT_VERSION) throw new Error("错题数据版本过新，请先更新网站");
    return {
      current: sanitizeWrongBook(payload.currentWrongBook),
      history: sanitizeWrongBook(payload.historyWrongBook),
      language: normalizeQuizLanguage(payload.language),
    };
  }

  if (payload.wrongBook && typeof payload.wrongBook === "object") {
    const book = sanitizeWrongBook(payload.wrongBook);
    return {
      current: payload.scope === "current" ? book : {},
      history: book,
      language: normalizeQuizLanguage(payload.language),
    };
  }

  return { current: {}, history: sanitizeWrongBook(payload), language: "" };
}

async function importWrongData(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    if (file.size > 1024 * 1024) throw new Error("错题数据文件不能超过 1 MB");
    const payload = JSON.parse(await file.text());
    const imported = importedWrongBooks(payload);
    if (imported.language && imported.language !== state.quizLanguage) {
      throw new Error(`该文件属于${quizLanguageLabel(imported.language)}项目，请返回项目选择页后再导入`);
    }
    state.currentWrongBook = mergeWrongBooks(state.currentWrongBook, imported.current);
    state.historyWrongBook = mergeWrongBooks(state.historyWrongBook, imported.history);
    if (!state.quizLanguage && imported.language) state.quizLanguage = imported.language;
    saveState();
    updateLanguageUi();
    updateStats();
    renderWrongBook();
    $("offlineReviewBtn").classList.toggle("hidden", !hasLocalReviewData());
    alert(`错题数据导入完成：历史错题 ${Object.keys(state.historyWrongBook).length} 个。可以直接进入本地复习。`);
  } catch (error) {
    alert(`错题数据导入失败：${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportWords() {
  const words = parseWords();
  if (!words.length) return;
  downloadText(`vocab-words-${Date.now()}.txt`, words.join("\n"));
}

function parseImportedWords(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    const data = JSON.parse(trimmed);
    if (Array.isArray(data)) return data.map(String).filter(Boolean);
    if (Array.isArray(data.words)) return data.words.map(String).filter(Boolean);
  } catch (_) {
    // Fall through to plain text parsing.
  }

  return trimmed
    .split(/[\s,，、;；]+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

async function importWords(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const words = parseImportedWords(text);
  if (words.length) {
    $("wordInput").value = [...new Set(words)].join("\n");
    saveCurrentWordDraft();
    updateStats();
  } else {
    alert("没有识别到词表");
  }
  event.target.value = "";
}

function changeProfile(value) {
  saveCurrentWordDraft();
  saveWrongBooks();
  saveAchievements();
  state.profile = sanitizeProfile(value);
  $("profileInput").value = state.profile;
  loadWrongBooks();
  loadAchievements();
  loadCurrentWordDraft();
  saveState();
  updateStats();
  if ($("wrongView").classList.contains("active")) renderWrongBook();
  if ($("achievementsView").classList.contains("active")) renderAchievements();
}

async function login(event) {
  event.preventDefault();
  $("loginError").textContent = "";
  if (!backendAvailable) {
    $("loginError").textContent = BACKEND_OFFLINE_MESSAGE;
    return;
  }
  try {
    const data = await api("/api/login", { token: $("tokenInput").value.trim() });
    state.session = data.session;
    sessionStorage.setItem("vocabSession", state.session);
    $("modelLabel").textContent = data.model || "qwen3:8b";
    showWorkspace();
    updateStats();
  } catch (error) {
    $("loginError").textContent = error.message;
  }
}

async function refreshBackendState() {
  try {
    const response = await fetchWithTimeout("/api/status", { cache: "no-store" }, STATUS_TIMEOUT_MS);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "backend unavailable");
    backendAvailable = true;
    aiAvailable = data.ai_ready !== false;
    $("modelLabel").textContent = data.model || "qwen3:8b";
    $("statusDot").classList.toggle("online", aiAvailable);

    if (state.session) {
      const healthResponse = await fetchWithTimeout(
        "/api/health",
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-Session-Token": state.session,
          },
          body: "{}",
        },
        STATUS_TIMEOUT_MS,
      );
      const health = await healthResponse.json().catch(() => ({}));
      if (!healthResponse.ok) {
        if (healthResponse.status === 401) clearSession();
        pendingScreen = "auth";
        pendingAuthMessage = "登录已失效，请重新输入口令";
      } else {
        aiAvailable = health.ai_ready !== false;
        $("modelLabel").textContent = health.model || data.model || "qwen3:8b";
        $("statusDot").classList.toggle("online", aiAvailable);
        pendingScreen = "workspace";
        pendingAuthMessage = "";
      }
    } else {
      pendingScreen = "auth";
      pendingAuthMessage = "";
    }
  } catch (_) {
    backendAvailable = false;
    aiAvailable = false;
    pendingScreen = "workspace";
    pendingAuthMessage = "";
    $("modelLabel").textContent = "本地复习";
    $("statusDot").classList.remove("online");
  }
  applyPendingScreen();
}

async function boot() {
  const splashPromise = runSplashSequence();
  loadWrongBooks();
  loadAchievements();
  state.quizLanguage = "";

  $("profileInput").value = state.profile;
  $("gradingModeSelect").value = ["strict", "normal", "lenient"].includes(state.gradingMode) ? state.gradingMode : "normal";
  state.gradingMode = $("gradingModeSelect").value;
  state.practiceMode = normalizePracticeMode(state.practiceMode);
  $("practiceModeSelect").value = state.practiceMode;
  updateLanguageUi();
  updatePracticeUi();

  $("loginForm").addEventListener("submit", login);
  $("offlineReviewBtn").addEventListener("click", () => {
    pendingScreen = "workspace";
    showWorkspace();
    setView("wrongView");
  });
  $("answerForm").addEventListener("submit", submitAnswer);
  $("startBtn").addEventListener("click", () => startQuiz(parseWords()));
  $("shuffleBtn").addEventListener("click", () => {
    $("wordInput").value = shuffle(parseWords()).join("\n");
    saveCurrentWordDraft();
    updateStats();
  });
  $("clearBtn").addEventListener("click", () => {
    $("wordInput").value = "";
    saveCurrentWordDraft();
    updateStats();
  });
  $("importWordsBtn").addEventListener("click", () => $("wordFileInput").click());
  $("exportWordsBtn").addEventListener("click", exportWords);
  $("wordFileInput").addEventListener("change", importWords);
  $("speakBtn").addEventListener("click", speakCurrentWord);
  $("skipBtn").addEventListener("click", skipWord);
  $("nextNowBtn").addEventListener("click", nextWord);
  $("cancelJudgeBtn").addEventListener("click", () => {
    if (judgeController) judgeController.abort();
  });
  $("backBtn").addEventListener("click", () => setView("setupView"));
  $("reviewBtn").addEventListener("click", () => startWrongReview("current"));
  $("reviewHistoryBtn").addEventListener("click", () => startWrongReview("history"));
  $("exportBtn").addEventListener("click", () => exportWrongBook("current"));
  $("exportHistoryBtn").addEventListener("click", () => exportWrongBook("history"));
  $("exportWrongDataBtn").addEventListener("click", exportWrongData);
  $("importWrongDataBtn").addEventListener("click", () => $("wrongDataFileInput").click());
  $("wrongDataFileInput").addEventListener("change", importWrongData);
  $("clearWrongBtn").addEventListener("click", () => {
    state.currentWrongBook = removeLanguageFromWrongBook(state.currentWrongBook);
    saveState();
    renderWrongBook();
  });
  $("clearHistoryBtn").addEventListener("click", () => {
    state.historyWrongBook = removeLanguageFromWrongBook(state.historyWrongBook);
    saveState();
    renderWrongBook();
  });
  $("currentWrongTab").addEventListener("click", () => setWrongScope("current"));
  $("historyWrongTab").addEventListener("click", () => setWrongScope("history"));
  $("wordInput").addEventListener("input", () => {
    saveCurrentWordDraft();
    updateStats();
  });
  $("profileInput").addEventListener("change", (event) => changeProfile(event.target.value));
  $("languageSelect").addEventListener("change", (event) => setQuizLanguage(event.target.value));
  $("practiceModeSelect").addEventListener("change", (event) => setPracticeMode(event.target.value));
  document.querySelectorAll("[data-language-choice]").forEach((button) => {
    button.addEventListener("click", () => setQuizLanguage(button.dataset.languageChoice));
  });
  document.querySelectorAll("[data-project]").forEach((button) => {
    button.addEventListener("click", () => enterProject(button.dataset.project));
  });
  $("backProjectBtn").addEventListener("click", showProjectPicker);
  $("gradingModeSelect").addEventListener("change", (event) => {
    state.gradingMode = event.target.value;
    saveState();
  });
  document.querySelectorAll(".tabs button").forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.view)));

  saveState();
  updateStats();
  renderWrongBook();
  renderAchievements();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`).catch(() => {});
  }

  refreshBackendState();
  await splashPromise;
  $("appShell").classList.remove("app-shell-pending");
  $("appShell").classList.add("app-shell-ready");
  $("appShell").setAttribute("aria-hidden", "false");
  showProjectPicker();
}

boot();

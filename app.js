const APP_VERSION = "2026-07-06-0810";
const NORMAL_RESULT_VISIBLE_MS = 3000;
const AI_RESULT_VISIBLE_MS = 3000;
const DEFAULT_PROFILE = "我";
const LANGUAGE_LABELS = {
  english: "英语",
  japanese: "日语",
};
const SKIPPED_ANSWER = "（跳过）";

const $ = (id) => document.getElementById(id);

let resultHideTimer = null;
let nextTimer = null;
let backendAvailable = false;
let pendingScreen = "auth";
let pendingAuthMessage = "";
const BACKEND_OFFLINE_MESSAGE = "未连接本地后端，请先运行本地服务并配置 Cloudflare Pages 的 LOCAL_API_BASE。";

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (_) {
    return fallback;
  }
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

const state = {
  session: localStorage.getItem("vocabSession") || "",
  profile: sanitizeProfile(localStorage.getItem("vocabProfile") || DEFAULT_PROFILE),
  gradingMode: localStorage.getItem("gradingMode") || "normal",
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
};

function wrongBookKey(scope) {
  return `wrongBook:${scope}:${profileStorageName(state.profile)}`;
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
  state.currentWrongBook = loadJson(wrongBookKey("current"), {});
  state.historyWrongBook = loadJson(wrongBookKey("history"), {});
  migrateLegacyWrongBook();
}

function saveWrongBooks() {
  localStorage.setItem(wrongBookKey("current"), JSON.stringify(state.currentWrongBook));
  localStorage.setItem(wrongBookKey("history"), JSON.stringify(state.historyWrongBook));
}

function saveState() {
  localStorage.setItem("vocabAppVersion", APP_VERSION);
  localStorage.setItem("vocabProfile", state.profile);
  localStorage.setItem("gradingMode", state.gradingMode);
  localStorage.setItem("quizLanguage", state.quizLanguage);
  localStorage.setItem("rubricCache", JSON.stringify(state.rubricCache));
  saveWrongBooks();
}

function activeWrongBook(scope = state.wrongScope) {
  return scope === "history" ? state.historyWrongBook : state.currentWrongBook;
}

function setActiveWrongBook(scope, book) {
  if (scope === "history") state.historyWrongBook = book;
  else state.currentWrongBook = book;
}

function clearSession() {
  state.session = "";
  localStorage.removeItem("vocabSession");
}

function showLanguageGate() {
  $("languagePanel").classList.remove("hidden");
  $("topbar").classList.add("hidden");
  $("authPanel").classList.add("hidden");
  $("workspace").classList.add("hidden");
}

function showMainShell() {
  $("languagePanel").classList.add("hidden");
  $("topbar").classList.remove("hidden");
}

function showAuth(message = "") {
  pendingScreen = "auth";
  pendingAuthMessage = message;
  if (!state.quizLanguage) {
    showLanguageGate();
    return;
  }
  showMainShell();
  $("authPanel").classList.remove("hidden");
  $("workspace").classList.add("hidden");
  $("loginError").textContent = message;
}

function showWorkspace() {
  pendingScreen = "workspace";
  if (!state.quizLanguage) {
    showLanguageGate();
    return;
  }
  showMainShell();
  $("authPanel").classList.add("hidden");
  $("workspace").classList.remove("hidden");
  $("statusDot").classList.add("online");
}

function updateLanguageUi() {
  const language = state.quizLanguage;
  if (!language) showLanguageGate();
  else showMainShell();

  const select = $("languageSelect");
  if (select) select.value = language;

  document.querySelectorAll("[data-language-choice]").forEach((button) => {
    button.classList.toggle("active", button.dataset.languageChoice === language);
  });

  const quizLabel = $("quizLanguageLabel");
  if (quizLabel) quizLabel.textContent = quizLanguageLabel(language);
}

function setQuizLanguage(value) {
  const language = normalizeQuizLanguage(value);
  if (!language) return;
  state.quizLanguage = language;
  saveState();
  updateLanguageUi();
  updateStats();
  if (pendingScreen === "workspace") showWorkspace();
  else showAuth(pendingAuthMessage);
}

function ensureQuizLanguage() {
  if (state.quizLanguage) return state.quizLanguage;
  updateLanguageUi();
  const languagePanel = $("languagePanel");
  if (languagePanel) languagePanel.scrollIntoView({ block: "center", behavior: "smooth" });
  alert("请先选择测试英语还是日语。");
  return "";
}

async function api(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Token": state.session,
    },
    body: JSON.stringify(body),
  });
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
}

function updateStats() {
  const parsedWords = parseWords();
  const eligibleWords = state.quizLanguage ? filterWordsByLanguage(parsedWords, state.quizLanguage) : parsedWords;
  $("statWords").textContent = eligibleWords.length || state.words.length;
  $("statWrong").textContent = Object.keys(state.currentWrongBook).length;
  $("statScore").textContent = state.score;
}

function setBusy(busy) {
  state.busy = busy;
  ["startBtn", "submitBtn", "skipBtn", "reviewBtn", "reviewHistoryBtn"].forEach((id) => {
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
    state.currentWrongBook = {};
    state.wrongScope = "current";
    saveWrongBooks();
  }

  state.words = shuffle(quizWords);
  state.index = 0;
  state.score = 0;
  state.mode = mode;
  updateStats();
  setView("quizView");
  showWord();
}

function showWord() {
  const word = state.words[state.index] || "-";
  $("wordLabel").textContent = word;
  $("progressLabel").textContent = `${state.index + 1}/${state.words.length}`;
  $("scoreLabel").textContent = `得分 ${state.score}`;
  $("quizLanguageLabel").textContent = quizLanguageLabel(state.quizLanguage);
  $("answerInput").value = "";
  hideResultPanel();
  clearNextTimer();
  setNextNowEnabled(false);
  $("acceptedChips").innerHTML = "";
  $("answerInput").focus();
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
  $("resultGloss").textContent = `标准释义：${result.gloss || "（未给出）"}`;
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
    setView(Object.keys(state.currentWrongBook).length ? "wrongView" : "setupView");
  }
}

function skipWord() {
  if (state.busy) return;
  if (nextTimer) {
    nextWord();
    return;
  }

  const word = state.words[state.index];
  if (!word) return;
  markWrong(word, SKIPPED_ANSWER, "跳过：未作答", []);
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

  try {
    const result = await api("/api/judge", {
      word,
      answer,
      rubric: state.rubricCache[word],
      mode: state.gradingMode,
      language: state.quizLanguage,
    });
    if (result.rubric) state.rubricCache[word] = result.rubric;

    if (result.correct) {
      state.score += 1;
      removeReviewedWord(word);
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
    const response = await fetch("/api/export-pdf", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Token": state.session,
      },
      body: JSON.stringify({
        wrongBook: book,
        title: scope === "history" ? "外语词测历史错题本" : "外语词测本轮错题本",
        meta: {
          profile: state.profile,
          scope: scope === "history" ? "历史错题" : "本轮错题",
          grading_mode: state.gradingMode,
        },
      }),
    });
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wrong-book-${scope}-${Date.now()}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(`导出失败：${error.message || "请检查本地后端连接"}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
    updateStats();
  } else {
    alert("没有识别到词表");
  }
  event.target.value = "";
}

function changeProfile(value) {
  saveWrongBooks();
  state.profile = sanitizeProfile(value);
  $("profileInput").value = state.profile;
  loadWrongBooks();
  saveState();
  updateStats();
  if (!$("wrongView").classList.contains("active")) return;
  renderWrongBook();
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
    localStorage.setItem("vocabSession", state.session);
    $("modelLabel").textContent = data.model || "qwen3:8b";
    showWorkspace();
    updateStats();
  } catch (error) {
    $("loginError").textContent = error.message;
  }
}

async function boot() {
  loadWrongBooks();

  $("profileInput").value = state.profile;
  $("gradingModeSelect").value = ["strict", "normal", "lenient"].includes(state.gradingMode) ? state.gradingMode : "normal";
  state.gradingMode = $("gradingModeSelect").value;
  updateLanguageUi();

  $("loginForm").addEventListener("submit", login);
  $("answerForm").addEventListener("submit", submitAnswer);
  $("startBtn").addEventListener("click", () => startQuiz(parseWords()));
  $("shuffleBtn").addEventListener("click", () => {
    $("wordInput").value = shuffle(parseWords()).join("\n");
    updateStats();
  });
  $("clearBtn").addEventListener("click", () => {
    $("wordInput").value = "";
    updateStats();
  });
  $("importWordsBtn").addEventListener("click", () => $("wordFileInput").click());
  $("exportWordsBtn").addEventListener("click", exportWords);
  $("wordFileInput").addEventListener("change", importWords);
  $("skipBtn").addEventListener("click", skipWord);
  $("nextNowBtn").addEventListener("click", nextWord);
  $("backBtn").addEventListener("click", () => setView("setupView"));
  $("reviewBtn").addEventListener("click", () => startWrongReview("current"));
  $("reviewHistoryBtn").addEventListener("click", () => startWrongReview("history"));
  $("exportBtn").addEventListener("click", () => exportWrongBook("current"));
  $("exportHistoryBtn").addEventListener("click", () => exportWrongBook("history"));
  $("clearWrongBtn").addEventListener("click", () => {
    state.currentWrongBook = {};
    saveState();
    renderWrongBook();
  });
  $("clearHistoryBtn").addEventListener("click", () => {
    state.historyWrongBook = {};
    saveState();
    renderWrongBook();
  });
  $("currentWrongTab").addEventListener("click", () => setWrongScope("current"));
  $("historyWrongTab").addEventListener("click", () => setWrongScope("history"));
  $("wordInput").addEventListener("input", updateStats);
  $("profileInput").addEventListener("change", (event) => changeProfile(event.target.value));
  $("languageSelect").addEventListener("change", (event) => setQuizLanguage(event.target.value));
  document.querySelectorAll("[data-language-choice]").forEach((button) => {
    button.addEventListener("click", () => setQuizLanguage(button.dataset.languageChoice));
  });
  $("gradingModeSelect").addEventListener("change", (event) => {
    state.gradingMode = event.target.value;
    saveState();
  });
  document.querySelectorAll(".tabs button").forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.view)));

  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "backend unavailable");
    $("modelLabel").textContent = data.model || "qwen3:8b";
    $("statusDot").classList.add("online");
    backendAvailable = true;
  } catch (_) {
    $("statusDot").classList.remove("online");
    backendAvailable = false;
  }

  if (state.session) {
    try {
      const data = await api("/api/health");
      $("modelLabel").textContent = data.model || "qwen3:8b";
      showWorkspace();
    } catch (_) {
      showAuth(backendAvailable ? "登录已失效，请重新输入口令" : BACKEND_OFFLINE_MESSAGE);
    }
  } else {
    showAuth(backendAvailable ? "" : BACKEND_OFFLINE_MESSAGE);
  }
  saveState();
  updateStats();
  renderWrongBook();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((items) => items.forEach((item) => item.unregister())).catch(() => {});
  }
  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key))).catch(() => {});
  }
}

boot();

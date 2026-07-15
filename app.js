const APP_VERSION = "2026-07-15-tools9";
const NORMAL_RESULT_VISIBLE_MS = 8000;
const AI_RESULT_VISIBLE_MS = 10000;
const SKIP_RESULT_VISIBLE_MS = 5000;
const API_TIMEOUT_MS = 100000;
const STATUS_TIMEOUT_MS = 8000;
const STATUS_RETRY_DELAYS_MS = [0, 800, 2000];
const API_GET_TIMEOUT_MS = 10000;
const GET_RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 530]);
const PDF_TIMEOUT_MS = 120000;
const MAX_WRONG_BOOK_ITEMS = 250;
const MAX_ACCEPTED_ANSWERS = 14;
const MAX_RUBRIC_CACHE_ITEMS = 500;
const MAX_JAPANESE_READING_CACHE_ITEMS = 2000;
const MAX_STUDY_RECORDS = 500;
const MAX_WORD_IMPORT_BYTES = 1024 * 1024;
const MAX_WORD_INPUT_CHARS = 120000;
const PROJECT_RUNTIME_MAX_AGE_MS = 100 * 60 * 1000;
const BACKEND_REFRESH_INTERVAL_MS = 60 * 1000;
const JAPANESE_READING_CACHE_KEY = "japaneseReadingCache:v1";
const JAPANESE_WRITTEN_FORM_CACHE_KEY = "japaneseWrittenFormCache:v1";
const ACCOUNT_DATA_VERSION = 2;
const STUDY_DATA_VERSION = 1;
const WRONG_BOOK_EXPORT_TYPE = "vocab-wrong-book";
const WRONG_BOOK_EXPORT_VERSION = 1;
const DEFAULT_PROFILE = "我";
const BUSINESS_TIME_ZONE = "Asia/Hong_Kong";
const LANGUAGE_LABELS = {
  english: "英语",
  japanese: "日语",
};
const PRACTICE_LABELS = {
  meaning: "释义",
  dictation: "听写",
};
const VOCABULARY_LEVEL_OPTIONS = {
  japanese: [
    ["n5", "JLPT N5"],
    ["n4", "JLPT N4"],
    ["n3", "JLPT N3"],
    ["n2", "JLPT N2"],
    ["n1", "JLPT N1"],
  ],
  english: [
    ["primary_3", "小学三年级"],
    ["primary_4", "小学四年级"],
    ["primary_5", "小学五年级"],
    ["primary_6", "小学六年级"],
    ["middle_1", "初中一年级"],
    ["middle_2", "初中二年级"],
    ["middle_3", "初中三年级"],
    ["high_1", "高中一年级"],
    ["high_2", "高中二年级"],
    ["high_3", "高中三年级"],
    ["cet_4", "大学英语四级"],
    ["cet_6", "大学英语六级"],
  ],
};
const SKIPPED_ANSWER = "（跳过）";
const ACHIEVEMENT_TIERS = {
  bronze: { label: "初阶", points: 10 },
  silver: { label: "进阶", points: 25 },
  gold: { label: "高阶", points: 50 },
  platinum: { label: "卓越", points: 100 },
};
const ACHIEVEMENTS = [
  { id: "firstQuiz", category: "入门", tier: "bronze", title: "开测", desc: "完成一次词表测试。", metric: "rounds", goal: 1 },
  { id: "firstCorrect", category: "入门", tier: "bronze", title: "第一题正确", desc: "累计答对 1 题。", metric: "correct", goal: 1 },
  { id: "firstDictation", category: "探索", tier: "bronze", title: "听写启动", desc: "完成一次听写练习。", metric: "dictationRounds", goal: 1 },
  { id: "skipSaved", category: "入门", tier: "bronze", title: "跳过也记录", desc: "跳过的词已进入错题本。", metric: "skipped", goal: 1 },
  { id: "wrongTen", category: "工具", tier: "silver", title: "错题收藏家", desc: "历史错题达到 10 个。", metric: "wrongWords", goal: 10 },
  { id: "perfectRound", category: "能力", tier: "silver", title: "满分一轮", desc: "完成一轮满分测试。", metric: "perfectRounds", goal: 1 },
  { id: "firstPdf", category: "工具", tier: "silver", title: "练习册生成", desc: "导出一次 PDF 错题本。" },
  { id: "longRound", category: "坚持", tier: "silver", title: "长跑", desc: "完成一轮 20 题以上的测试。", metric: "longRounds", goal: 1 },
  { id: "rounds5", category: "坚持", tier: "bronze", title: "渐入佳境", desc: "累计完成 5 轮练习。", metric: "rounds", goal: 5 },
  { id: "rounds25", category: "坚持", tier: "silver", title: "稳定节奏", desc: "累计完成 25 轮练习。", metric: "rounds", goal: 25 },
  { id: "rounds100", category: "坚持", tier: "platinum", title: "百炼成章", desc: "累计完成 100 轮练习。", metric: "rounds", goal: 100 },
  { id: "words50", category: "坚持", tier: "bronze", title: "五十步", desc: "累计完成 50 道题。", metric: "words", goal: 50 },
  { id: "words500", category: "坚持", tier: "silver", title: "五百题", desc: "累计完成 500 道题。", metric: "words", goal: 500 },
  { id: "words2000", category: "坚持", tier: "gold", title: "两千里", desc: "累计完成 2000 道题。", metric: "words", goal: 2000 },
  { id: "correct100", category: "能力", tier: "bronze", title: "百题正确", desc: "累计答对 100 道题。", metric: "correct", goal: 100 },
  { id: "correct1000", category: "能力", tier: "gold", title: "千题正确", desc: "累计答对 1000 道题。", metric: "correct", goal: 1000 },
  { id: "streak3", category: "坚持", tier: "bronze", title: "三日不辍", desc: "最长连续学习 3 天。", metric: "longestStreak", goal: 3 },
  { id: "streak7", category: "坚持", tier: "silver", title: "一周坚持", desc: "最长连续学习 7 天。", metric: "longestStreak", goal: 7 },
  { id: "streak30", category: "坚持", tier: "gold", title: "月度恒心", desc: "最长连续学习 30 天。", metric: "longestStreak", goal: 30 },
  { id: "perfect3", category: "能力", tier: "gold", title: "三连满分", desc: "累计完成 3 轮满分练习。", metric: "perfectRounds", goal: 3 },
  { id: "dictation10", category: "探索", tier: "silver", title: "听辨熟手", desc: "累计完成 10 轮听写。", metric: "dictationRounds", goal: 10 },
  { id: "review10", category: "探索", tier: "silver", title: "回炉有方", desc: "累计完成 10 轮错题复习。", metric: "reviewRounds", goal: 10 },
  { id: "bilingual", category: "探索", tier: "silver", title: "双语启程", desc: "英语和日语各完成至少 1 轮。", metric: "bilingualRounds", goal: 1 },
  { id: "highAccuracy5", category: "能力", tier: "gold", title: "稳定高分", desc: "完成 5 轮至少 10 题且正确率不低于 90% 的练习。", metric: "highAccuracyRounds", goal: 5 },
  { id: "goalDays3", category: "坚持", tier: "gold", title: "目标常客", desc: "累计 3 天达到当日学习目标。", metric: "goalDays", goal: 3 },
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
let selectedRechargePlan = "";
let currentPaymentOrder = null;
let membershipPlans = [];
let membershipPlansPromise = null;
let toolsInitialized = false;
let routeBusy = false;
let adminUsers = [];
let adminLoadSequence = 0;
let confirmAction = null;
let lastLimitPromptKey = "";
let projectRuntimeNeedsRestore = false;
let backendStatusPromise = null;
let backendRefreshPromise = null;
let storageWriteFailed = false;
let achievementFilter = "all";
let achievementToastTimer = null;
let achievementToastHideTimer = null;
const modalReturnFocus = new Map();
const projectRuntime = {
  english: null,
  japanese: null,
};
const BACKEND_CONFIG_MESSAGE = "服务器代理尚未配置，请设置 Cloudflare Pages 的 LOCAL_API_BASE。";
const BACKEND_NETWORK_MESSAGE = "暂时无法连接服务器，请检查网络后重试；微信中可关闭页面再重新打开。";
let backendFailureMessage = BACKEND_NETWORK_MESSAGE;

const restoredSession = localStorage.getItem("wyjAccountSession") || sessionStorage.getItem("vocabSession") || "";
if (restoredSession) safeStorageSet(localStorage, "wyjAccountSession", restoredSession);
sessionStorage.removeItem("vocabSession");
localStorage.removeItem("vocabSession");

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (_) {
    return fallback;
  }
}

function safeStorageSet(storage, key, value) {
  try {
    storage.setItem(key, String(value));
    return true;
  } catch (_) {
    storageWriteFailed = true;
    return false;
  }
}

function migrateProjectPreferences() {
  const legacyGrading = ["strict", "normal", "lenient"].includes(localStorage.getItem("gradingMode"))
    ? localStorage.getItem("gradingMode")
    : "normal";
  const legacyPractice = normalizePracticeMode(localStorage.getItem("practiceMode"));
  Object.keys(LANGUAGE_LABELS).forEach((language) => {
    if (localStorage.getItem(`gradingMode:${language}`) === null) {
      safeStorageSet(localStorage, `gradingMode:${language}`, legacyGrading);
    }
    if (localStorage.getItem(`practiceMode:${language}`) === null) {
      safeStorageSet(localStorage, `practiceMode:${language}`, legacyPractice);
    }
  });
}

migrateProjectPreferences();

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
    .slice(-MAX_WRONG_BOOK_ITEMS)
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
    delete merged[word];
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

function normalizeJapaneseReading(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").trim();
}

function isJapaneseReading(value) {
  return /^[\u3040-\u30ff\u31f0-\u31ffー・]+$/u.test(normalizeJapaneseReading(value));
}

function sanitizeJapaneseReadings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const cleaned = {};
  Object.entries(value).forEach(([word, reading]) => {
    const cleanWord = limitText(word, 64);
    const cleanReading = normalizeJapaneseReading(reading).slice(0, 64);
    if (cleanWord && isJapaneseReading(cleanReading)) cleaned[cleanWord] = cleanReading;
  });
  return Object.fromEntries(Object.entries(cleaned).slice(-MAX_JAPANESE_READING_CACHE_ITEMS));
}

function sanitizeJapaneseWrittenForms(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const cleaned = {};
  Object.entries(value).forEach(([word, written]) => {
    const cleanWord = limitText(word, 64);
    const cleanWritten = limitText(written, 64);
    if (
      cleanWord
      && cleanWritten
      && /^[\u3040-\u30ff\u31f0-\u31ff\u3400-\u9fff々〆ヶー・]+$/u.test(cleanWord)
      && /^[\u3040-\u30ff\u31f0-\u31ff\u3400-\u9fff々〆ヶー・]+$/u.test(cleanWritten)
    ) cleaned[cleanWord] = cleanWritten;
  });
  return Object.fromEntries(Object.entries(cleaned).slice(-MAX_JAPANESE_READING_CACHE_ITEMS));
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
  account: loadJson("wyjAccountCache", null),
  quizSession: "",
  profile: sanitizeProfile(localStorage.getItem("vocabProfile") || DEFAULT_PROFILE),
  gradingMode: localStorage.getItem("gradingMode") || "normal",
  practiceMode: normalizePracticeMode(localStorage.getItem("practiceMode")),
  quizLanguage: "",
  words: [],
  index: 0,
  score: 0,
  roundSkipped: 0,
  lastRound: null,
  mode: "normal",
  busy: false,
  answerLocked: false,
  roundActive: false,
  roundStartedAt: 0,
  wrongScope: "current",
  rubricCache: loadJson("rubricCache", {}),
  japaneseReadings: sanitizeJapaneseReadings(loadJson(JAPANESE_READING_CACHE_KEY, {})),
  japaneseWrittenForms: sanitizeJapaneseWrittenForms(loadJson(JAPANESE_WRITTEN_FORM_CACHE_KEY, {})),
  currentWrongBook: {},
  historyWrongBook: {},
  achievements: {},
  studyRecords: [],
};

function accountStorageId(account = state.account) {
  return encodeURIComponent(String(account?.id || "guest"));
}

function accountProfileKey(account = state.account) {
  return `vocabProfile:v${ACCOUNT_DATA_VERSION}:${accountStorageId(account)}`;
}

function wrongBookKey(scope, account = state.account, profile = state.profile) {
  return `wrongBook:v${ACCOUNT_DATA_VERSION}:${accountStorageId(account)}:${scope}:${profileStorageName(profile)}`;
}

function achievementKey(account = state.account, profile = state.profile) {
  return `achievements:v${ACCOUNT_DATA_VERSION}:${accountStorageId(account)}:${profileStorageName(profile)}`;
}

function projectRuntimeKey(language, account = state.account) {
  return `vocabRuntime:v1:${accountStorageId(account)}:${language}`;
}

function studyHistoryKey(account = state.account, profile = state.profile) {
  return `studyHistory:v${STUDY_DATA_VERSION}:${accountStorageId(account)}:${profileStorageName(profile)}`;
}

function studyGoalKey(language = state.quizLanguage, account = state.account, profile = state.profile) {
  return `studyGoal:v${STUDY_DATA_VERSION}:${accountStorageId(account)}:${profileStorageName(profile)}:${language}`;
}

function sanitizeStudyRecords(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_STUDY_RECORDS).map((record) => {
    if (!record || typeof record !== "object") return null;
    const language = normalizeQuizLanguage(record.language);
    const parsedTotal = Number.parseInt(record.total, 10) || 0;
    if (parsedTotal < 1) return null;
    const total = Math.min(500, parsedTotal);
    const correct = Math.max(0, Math.min(total, Number.parseInt(record.correct, 10) || 0));
    const skipped = Math.max(0, Math.min(total - correct, Number.parseInt(record.skipped, 10) || 0));
    const wrong = Math.max(0, total - correct - skipped);
    const finishedAt = new Date(record.finishedAt || record.finished_at || "");
    if (!language || !Number.isFinite(finishedAt.getTime())) return null;
    return {
      id: limitText(record.id, 100) || `${finishedAt.getTime()}-${language}`,
      finishedAt: finishedAt.toISOString(),
      language,
      practiceMode: normalizePracticeMode(record.practiceMode),
      mode: ["normal", "review-current", "review-history"].includes(record.mode) ? record.mode : "normal",
      total,
      correct,
      wrong,
      skipped,
      accuracy: Math.round((correct / total) * 100),
      durationSec: Math.max(0, Math.min(24 * 60 * 60, Number.parseInt(record.durationSec, 10) || 0)),
    };
  }).filter(Boolean);
}

function loadStudyRecords() {
  if (!state.account?.id) {
    state.studyRecords = [];
    return;
  }
  state.studyRecords = sanitizeStudyRecords(loadJson(studyHistoryKey(), []));
}

function saveStudyRecords() {
  if (!state.account?.id) return;
  state.studyRecords = sanitizeStudyRecords(state.studyRecords);
  safeStorageSet(localStorage, studyHistoryKey(), JSON.stringify(state.studyRecords));
}

function migrateLegacyAccountData() {
  if (!state.account?.id) return;
  const accountId = accountStorageId();
  const migratedKey = `accountLocalDataMigrated:v${ACCOUNT_DATA_VERSION}:${accountId}`;
  if (localStorage.getItem(migratedKey)) return;
  const claimedKey = `accountLocalDataLegacyOwner:v${ACCOUNT_DATA_VERSION}`;
  const claimedBy = localStorage.getItem(claimedKey);
  if (!claimedBy || claimedBy === accountId) {
    const legacyProfile = sanitizeProfile(localStorage.getItem("vocabProfile") || DEFAULT_PROFILE);
    if (localStorage.getItem(accountProfileKey()) === null) {
      safeStorageSet(localStorage, accountProfileKey(), legacyProfile);
    }
    ["current", "history"].forEach((scope) => {
      const legacy = loadJson(`wrongBook:${scope}:${profileStorageName(legacyProfile)}`, {});
      const target = wrongBookKey(scope, state.account, legacyProfile);
      if (localStorage.getItem(target) === null && Object.keys(legacy).length) {
        safeStorageSet(localStorage, target, JSON.stringify(sanitizeWrongBook(legacy)));
      }
    });
    const legacyAchievements = loadJson(`achievements:${profileStorageName(legacyProfile)}`, {});
    const targetAchievements = achievementKey(state.account, legacyProfile);
    if (localStorage.getItem(targetAchievements) === null && Object.keys(legacyAchievements).length) {
      safeStorageSet(localStorage, targetAchievements, JSON.stringify(legacyAchievements));
    }
    safeStorageSet(localStorage, claimedKey, accountId);
  }
  safeStorageSet(localStorage, migratedKey, "1");
}

function migrateLegacyWrongBook() {
  const flag = `wrongBookMigrated:v${ACCOUNT_DATA_VERSION}:${accountStorageId()}:${profileStorageName(state.profile)}`;
  const legacy = loadJson("wrongBook", {});
  if (localStorage.getItem(flag) || !Object.keys(legacy).length) return;

  state.historyWrongBook = { ...legacy, ...state.historyWrongBook };
  safeStorageSet(localStorage, flag, "1");
  localStorage.removeItem("wrongBook");
}

function loadAccountLocalState() {
  if (!state.account?.id) return;
  migrateLegacyAccountData();
  state.profile = sanitizeProfile(localStorage.getItem(accountProfileKey()) || DEFAULT_PROFILE);
  if ($("profileInput")) $("profileInput").value = state.profile;
  loadWrongBooks();
  loadAchievements();
  loadStudyRecords();
}

function resetLocalViewState() {
  state.profile = DEFAULT_PROFILE;
  state.currentWrongBook = {};
  state.historyWrongBook = {};
  state.achievements = {};
  state.studyRecords = [];
  state.words = [];
  state.index = 0;
  state.score = 0;
  state.roundSkipped = 0;
  state.lastRound = null;
  state.quizSession = "";
  state.roundActive = false;
  state.answerLocked = false;
  state.roundStartedAt = 0;
  if ($("profileInput")) $("profileInput").value = state.profile;
}

function loadWrongBooks() {
  if (!state.account?.id) {
    state.currentWrongBook = {};
    state.historyWrongBook = {};
    return;
  }
  state.currentWrongBook = sanitizeWrongBook(loadJson(wrongBookKey("current"), {}));
  state.historyWrongBook = sanitizeWrongBook(loadJson(wrongBookKey("history"), {}));
  migrateLegacyWrongBook();
}

function saveWrongBooks() {
  if (!state.account?.id) return;
  safeStorageSet(localStorage, wrongBookKey("current"), JSON.stringify(state.currentWrongBook));
  safeStorageSet(localStorage, wrongBookKey("history"), JSON.stringify(state.historyWrongBook));
}

function loadAchievements() {
  if (!state.account?.id) {
    state.achievements = {};
    return;
  }
  state.achievements = loadJson(achievementKey(), {});
}

function saveAchievements() {
  if (!state.account?.id) return;
  safeStorageSet(localStorage, achievementKey(), JSON.stringify(state.achievements));
}

function loadProjectPreferences(language) {
  if (!LANGUAGE_LABELS[language]) return;
  const grading = localStorage.getItem(`gradingMode:${language}`);
  state.gradingMode = ["strict", "normal", "lenient"].includes(grading) ? grading : "normal";
  state.practiceMode = normalizePracticeMode(localStorage.getItem(`practiceMode:${language}`));
  if ($("gradingModeSelect")) $("gradingModeSelect").value = state.gradingMode;
  updatePracticeUi();
}

function saveProjectPreferences() {
  if (!LANGUAGE_LABELS[state.quizLanguage]) return;
  safeStorageSet(localStorage, `gradingMode:${state.quizLanguage}`, state.gradingMode);
  safeStorageSet(localStorage, `practiceMode:${state.quizLanguage}`, state.practiceMode);
}

function saveState() {
  safeStorageSet(localStorage, "vocabAppVersion", APP_VERSION);
  safeStorageSet(localStorage, "vocabProfile", state.profile);
  if (state.account?.id) safeStorageSet(localStorage, accountProfileKey(), state.profile);
  safeStorageSet(localStorage, "gradingMode", state.gradingMode);
  safeStorageSet(localStorage, "practiceMode", state.practiceMode);
  safeStorageSet(localStorage, "quizLanguage", state.quizLanguage);
  saveProjectPreferences();
  state.rubricCache = trimRubricCache(state.rubricCache);
  safeStorageSet(localStorage, "rubricCache", JSON.stringify(state.rubricCache));
  state.japaneseReadings = sanitizeJapaneseReadings(state.japaneseReadings);
  safeStorageSet(localStorage, JAPANESE_READING_CACHE_KEY, JSON.stringify(state.japaneseReadings));
  state.japaneseWrittenForms = sanitizeJapaneseWrittenForms(state.japaneseWrittenForms);
  safeStorageSet(localStorage, JAPANESE_WRITTEN_FORM_CACHE_KEY, JSON.stringify(state.japaneseWrittenForms));
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
  state.account = null;
  state.quizSession = "";
  sessionStorage.removeItem("vocabSession");
  localStorage.removeItem("vocabSession");
  localStorage.removeItem("wyjAccountSession");
  localStorage.removeItem("wyjAccountCache");
  ["secretInput", "registerSecretInput", "registerConfirmInput", "currentSecretInput", "newSecretInput", "deleteSecretInput", "adminNewSecretInput"].forEach((id) => {
    const input = $(id);
    if (input) input.value = "";
  });
  resetLocalViewState();
  renderAccountUi();
}

function membershipLabel(value) {
  return {
    free: "普通用户",
    trial_single_language: "单语言包月体验会员",
    monthly: "历史双语言包月会员",
    lifetime: "历史双语言永久会员",
    legacy_all_monthly: "历史双语言包月会员",
    legacy_all_lifetime: "历史双语言永久会员",
    japanese_lifetime: "日语单项永久会员",
    all_access_monthly: "全功能月度会员",
    all_access_lifetime: "全功能永久会员",
    super_admin: "超级管理员",
  }[value] || "普通用户";
}

function accountEntitlements(account = state.account) {
  return new Set(Array.isArray(account?.entitlements) ? account.entitlements : []);
}

function hasAccountEntitlement(code, account = state.account) {
  return isSuperAdmin(account) || accountEntitlements(account).has(code);
}

function accountMembershipSummary(account = state.account) {
  if (!account) return { code: "free", name: "未登录", permanent: false, expires_at: "", tools_access: false };
  return account.membership_summary || {
    code: account.membership || "free",
    name: membershipLabel(account.membership),
    permanent: account.membership === "lifetime",
    expires_at: account.membership_expires || "",
    tools_access: Boolean(account.tools_access),
  };
}

function isSuperAdmin(account = state.account) {
  return Boolean(
    account && account.username === "wyj" && account.role === "super_admin" && account.is_super_admin === true,
  );
}

function applyAccount(account) {
  const previousAccountId = String(state.account?.id || "");
  const nextAccountId = String(account?.id || "");
  state.account = account || null;
  if (state.account) safeStorageSet(localStorage, "wyjAccountCache", JSON.stringify(state.account));
  else localStorage.removeItem("wyjAccountCache");
  if (state.account && previousAccountId !== nextAccountId) loadAccountLocalState();
  if (!state.account && previousAccountId) resetLocalViewState();
  renderAccountUi();
  updateStats();
  updateAiSuggestionControls();
}

function accountWordLimit(language = state.quizLanguage) {
  const account = state.account;
  if (!account) return 15;
  if (isSuperAdmin(account) || hasAccountEntitlement("language_all_access", account)) return Infinity;
  if (language === "japanese" && hasAccountEntitlement("language_japanese_access", account)) return Infinity;
  if (language === "english" && hasAccountEntitlement("language_english_access", account)) return Infinity;
  return 15;
}

function renderAccountUi() {
  const account = state.account;
  const badge = $("accountBadge");
  if (!badge) return;
  const summary = accountMembershipSummary(account);
  badge.textContent = account ? `${account.username} · ${summary.name}` : "未登录";
  $("membershipBtn")?.classList.toggle("hidden", !account);
  $("accountBtn")?.classList.toggle("hidden", !account);
  $("logoutBtn")?.classList.toggle("hidden", !account);
  $("adminBtn")?.classList.toggle("hidden", !isSuperAdmin(account));
  $("homeBtn")?.classList.toggle("hidden", !account || location.pathname === "/select");
  if ($("moduleMembershipStatus")) {
    $("moduleMembershipStatus").textContent = summary.permanent
      ? `${summary.name} · 永久有效`
      : `${summary.name}${summary.expires_at ? ` · 到期 ${formatLocalDateTime(summary.expires_at)}` : ""}`;
  }
  if ($("toolsMemberBadge")) {
    $("toolsMemberBadge").textContent = isSuperAdmin(account) || hasAccountEntitlement("tools_access", account)
      ? "可使用"
      : "会员功能";
    $("toolsMemberBadge").classList.toggle("active", Boolean(account && (isSuperAdmin(account) || hasAccountEntitlement("tools_access", account))));
  }
  renderAccountDetails();
}

function renderAccountDetails() {
  const details = $("accountDetails");
  if (!details || !state.account) return;
  const account = state.account;
  const summary = accountMembershipSummary(account);
  const memberships = Array.isArray(account.memberships) ? account.memberships : [];
  const membershipText = memberships.length
    ? memberships.map((item) => {
      const expiry = item.is_lifetime ? "永久" : formatLocalDateTime(item.expires_at, "无到期时间");
      return `${item.plan_name || membershipLabel(item.plan_code)}（${expiry}）`;
    }).join("；")
    : "无";
  const entitlementText = accountEntitlements(account).size
    ? [...accountEntitlements(account)].map((code) => ({
      language_japanese_access: "日语会员功能",
      language_english_access: "英语会员功能",
      language_all_access: "全部语言会员功能",
      tools_access: "在线工具箱",
      tools_batch_access: "批量处理",
      temporary_share_access: "临时分享",
      save_tool_config: "保存工具配置",
      all_features_access: "全部高级功能",
    }[code] || code)).join("、")
    : "基础功能";
  const rows = [
    ["用户名", account.username],
    ["用户 ID", account.id],
    ["账户类型", isSuperAdmin(account) ? "超级管理员" : "普通账户"],
    ["当前等级", summary.name],
    ["有效会员", membershipText],
    ["当前权益", entitlementText],
    ["注册时间", formatLocalDateTime(account.registered_at, "未知")],
    ["最后登录", formatLocalDateTime(account.last_login_at, "从未")],
  ];
  details.innerHTML = "";
  rows.forEach(([label, value]) => {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    details.append(term, description);
  });
  $("changeSecretForm")?.classList.toggle("hidden", isSuperAdmin(account));
  $("openDeleteAccountBtn")?.closest(".danger-zone")?.classList.toggle("hidden", isSuperAdmin(account));
}

async function requestJsonGet(path, options = {}) {
  const authenticated = options.authenticated === true;
  let lastError = new Error(BACKEND_NETWORK_MESSAGE);
  for (let attempt = 0; attempt < STATUS_RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = STATUS_RETRY_DELAYS_MS[attempt];
    if (delay) await waitForDelay(delay);
    let response;
    try {
      response = await fetchWithTimeout(path, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: authenticated ? { "X-Session-Token": state.session } : {},
      }, options.timeoutMs || API_GET_TIMEOUT_MS);
    } catch (networkError) {
      backendAvailable = false;
      backendFailureMessage = backendErrorMessage(networkError);
      lastError = new Error(backendFailureMessage);
      if (attempt < STATUS_RETRY_DELAYS_MS.length - 1) continue;
      throw lastError;
    }

    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      backendAvailable = true;
      return data;
    }
    if (authenticated && response.status === 401) {
      clearSession();
      showAuth("登录已失效，请重新登录", { replace: true });
      const error = new Error("登录已失效，请重新登录");
      error.code = "session_expired";
      throw error;
    }
    if (GET_RETRYABLE_STATUS.has(response.status) && attempt < STATUS_RETRY_DELAYS_MS.length - 1) {
      lastError = new Error("服务器正在恢复，请稍候…");
      continue;
    }
    const configuredWrong = String(data.error || "").includes("LOCAL_API_BASE");
    const message = configuredWrong
      ? BACKEND_CONFIG_MESSAGE
      : GET_RETRYABLE_STATUS.has(response.status)
        ? "服务器暂时不可用，请稍后重新加载。"
        : data.error || `请求失败（HTTP ${response.status}）`;
    const error = new Error(message);
    error.code = data.code || "request_failed";
    error.status = response.status;
    throw error;
  }
  throw lastError;
}

async function apiGet(path, options = {}) {
  return requestJsonGet(path, { ...options, authenticated: true });
}

function openModal(id) {
  const modal = $(id);
  if (!modal) return;
  if (!modalReturnFocus.has(id) && document.activeElement instanceof HTMLElement) {
    modalReturnFocus.set(id, document.activeElement);
  }
  modal.classList.remove("hidden", "is-closing");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  if ($("appShell")) $("appShell").inert = true;
  modal.querySelector("button, input, select")?.focus();
}

function closeModal(id, immediate = false) {
  const modal = $(id);
  if (!modal || modal.classList.contains("hidden")) return;
  const finish = () => {
    modal.classList.add("hidden");
    modal.classList.remove("is-closing");
    modal.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal-layer:not(.hidden)")) {
      document.body.classList.remove("modal-open");
      if ($("appShell")) $("appShell").inert = false;
    }
    const returnFocus = modalReturnFocus.get(id);
    modalReturnFocus.delete(id);
    if (returnFocus?.isConnected && !returnFocus.closest(".modal-layer.hidden")) returnFocus.focus();
    if ((id === "membershipModal" && location.pathname === "/recharge") || (id === "accountModal" && location.pathname === "/account")) {
      if (state.session && state.account) {
        showModulePicker(false);
        pushRoute("/select", true);
      }
    }
  };
  if (immediate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) finish();
  else {
    modal.classList.add("is-closing");
    window.setTimeout(finish, 180);
  }
}

function showAuthMode(mode, updateRoute = false) {
  const register = mode === "register";
  $("loginForm").classList.toggle("hidden", register);
  $("registerForm").classList.toggle("hidden", !register);
  $("showLoginBtn").classList.toggle("active", !register);
  $("showRegisterBtn").classList.toggle("active", register);
  $("authTitle").textContent = register ? "注册账户" : "账户登录";
  $("loginError").textContent = "";
  if (updateRoute) pushRoute(register ? "/register" : "/login");
}

async function registerAccount(event) {
  event.preventDefault();
  const button = $("registerSubmitBtn");
  if (button.disabled) return;
  $("loginError").textContent = "";
  button.disabled = true;
  try {
    $("loginError").textContent = "正在连接服务器…";
    if (!(await ensureBackendConnection())) throw new Error(backendFailureMessage);
    const username = $("registerUsernameInput").value.trim();
    const secret = $("registerSecretInput").value;
    const confirmSecret = $("registerConfirmInput").value;
    await api("/api/register", { username, secret, confirm_secret: confirmSecret });
    $("usernameInput").value = username;
    $("secretInput").value = secret;
    showAuthMode("login", true);
    $("loginError").textContent = "注册成功，请登录";
  } catch (error) {
    $("loginError").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function logoutAccount() {
  const session = state.session;
  const account = state.account;
  try {
    if (session) await api("/api/logout");
  } catch (_) {
    // Local cleanup still signs the browser out when the network is unavailable.
  }
  clearSavedWordDrafts(account);
  clearSession();
  pendingScreen = "auth";
  pendingAuthMessage = "已退出登录";
  showAuth(pendingAuthMessage, { path: "/login", replace: true });
}

function planDetails(plan) {
  const item = membershipPlans.find((candidate) => candidate.code === plan);
  return item
    ? [item.name, `${item.price} ${item.currency}`, item.description]
    : ["请选择套餐", "", ""];
}

function renderMembershipPlans() {
  const list = $("membershipPlanList");
  if (list) {
    list.innerHTML = membershipPlans.map((item) => `<button class="plan-option" data-plan="${escapeHtml(item.code)}" type="button">
      <strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.price)} ${escapeHtml(item.currency)}${item.duration_months ? "/月" : ""}</span><small>${escapeHtml(item.description)}</small>
    </button>`).join("");
    list.querySelectorAll("[data-plan]").forEach((button) => button.addEventListener("click", () => selectRechargePlan(button.dataset.plan)));
  }
  $("membershipPlanRecovery")?.classList.add("hidden");
}

function showMembershipPlanRecovery(message) {
  if (!membershipPlans.length) $("membershipPlanList").innerHTML = "";
  $("membershipPlanError").textContent = message || "会员方案暂时无法加载。";
  $("membershipPlanRecovery").classList.remove("hidden");
}

async function loadMembershipPlans(force = false) {
  if (membershipPlans.length && !force) {
    renderMembershipPlans();
    return membershipPlans;
  }
  if (membershipPlansPromise) return membershipPlansPromise;
  const list = $("membershipPlanList");
  list?.setAttribute("aria-busy", "true");
  if (!membershipPlans.length && list) list.innerHTML = '<p class="plan-loading">正在连接服务器并加载会员方案…</p>';
  $("membershipPlanRecovery")?.classList.add("hidden");

  membershipPlansPromise = (async () => {
    const data = await requestJsonGet("/api/membership/plans", { timeoutMs: STATUS_TIMEOUT_MS });
    if (!Array.isArray(data.plans) || !data.plans.length) throw new Error("服务器没有返回可购买的会员方案");
    const order = ["trial_single_language", "japanese_lifetime", "all_access_monthly", "all_access_lifetime"];
    const rank = (code) => {
      const index = order.indexOf(code);
      return index < 0 ? order.length : index;
    };
    membershipPlans = [...data.plans].sort((left, right) => rank(left.code) - rank(right.code));
    renderMembershipPlans();
    return membershipPlans;
  })().catch((error) => {
    showMembershipPlanRecovery(`${error.message} 请点击下方按钮重试。`);
    throw error;
  }).finally(() => {
    list?.setAttribute("aria-busy", "false");
    membershipPlansPromise = null;
  });
  return membershipPlansPromise;
}

async function reloadMembershipPlans() {
  const button = $("retryMembershipPlansBtn");
  button.disabled = true;
  $("rechargeMessage").textContent = "正在重新连接并加载套餐…";
  try {
    await loadMembershipPlans(true);
    selectRechargePlan("");
    $("rechargeMessage").textContent = "套餐已重新加载，请选择方案。";
  } catch (error) {
    $("rechargeMessage").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function openMembershipModal(options = {}) {
  if (!state.session || !state.account) {
    showAuth("请先登录后查看会员方案", { path: "/login" });
    return;
  }
  $("copyWechatBtn").textContent = "复制微信号";
  selectRechargePlan("");
  $("rechargeMessage").textContent = "正在加载套餐与订单状态…";
  openModal("membershipModal");
  let openOrder = null;
  let loadError = "";
  try {
    await loadMembershipPlans(options.forcePlans === true);
    const orders = await apiGet("/api/recharge/mine");
    openOrder = (orders.requests || []).find((item) => ["pending_payment", "user_paid"].includes(item.status)) || null;
  } catch (error) {
    loadError = error.message;
  }
  if (!state.session || !state.account) {
    closeModal("membershipModal", true);
    return;
  }
  const planCode = openOrder?.plan_code || (selectedRechargePlan && membershipPlans.some((item) => item.code === selectedRechargePlan)
    ? selectedRechargePlan
    : "");
  selectRechargePlan(planCode);
  if (openOrder) {
    renderPaymentOrder(openOrder);
    $("rechargeMessage").textContent = openOrder.status === "user_paid"
      ? "已通知管理员，正在等待人工核对付款。"
      : "你有一个尚未付款的订单。请按订单备注付款后点击“我已付款”。";
  } else if (loadError) {
    $("rechargeMessage").textContent = loadError;
  } else {
    $("rechargeMessage").textContent = "请选择会员方案。";
  }
  return membershipPlans;
}

function selectRechargePlan(plan) {
  selectedRechargePlan = plan;
  currentPaymentOrder = null;
  document.querySelectorAll("[data-plan]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.plan === plan);
  });
  const isSingleLanguage = plan === "trial_single_language";
  $("trialLanguageField")?.classList.toggle("hidden", !isSingleLanguage);
  $("trialLanguageSelect").required = isSingleLanguage;
  const [name, price, description] = planDetails(plan);
  $("purchaseSummary").textContent = `${name} · ${price} · ${description}`;
  $("submitRechargeBtn").disabled = !plan;
  $("submitRechargeBtn").textContent = "生成付款订单";
  $("confirmPaymentBtn").classList.add("hidden");
  $("paymentOrderBox").classList.add("hidden");
  $("rechargeMessage").textContent = "";
}

function paymentStatusLabel(status) {
  return {
    pending_payment: "等待付款",
    user_paid: "已通知管理员，等待确认",
    approved: "已开通",
    rejected: "已拒绝",
  }[status] || status || "未知";
}

function renderPaymentOrder(record) {
  if (!record) return;
  currentPaymentOrder = record;
  const plan = membershipPlans.find((item) => item.code === record.plan_code);
  $("paymentUsername").textContent = record.username || state.account?.username || "-";
  $("paymentPlan").textContent = plan?.name || membershipLabel(record.plan_code);
  const languageLabel = { english: "英语", japanese: "日语" }[record.trial_language] || "";
  $("paymentLanguageTerm").classList.toggle("hidden", !languageLabel);
  $("paymentLanguage").classList.toggle("hidden", !languageLabel);
  $("paymentLanguage").textContent = languageLabel || "-";
  if (languageLabel) $("trialLanguageSelect").value = record.trial_language;
  $("paymentAmount").textContent = `${(Number(record.amount_cents || 0) / 100).toFixed(2)} ${record.currency || "CNY"}`;
  $("paymentOrderNumber").textContent = record.order_number || "-";
  $("paymentNote").textContent = record.payment_note || "-";
  $("paymentStatus").textContent = paymentStatusLabel(record.status);
  $("paymentOrderBox").classList.remove("hidden");
  $("confirmPaymentBtn").classList.toggle("hidden", record.status !== "pending_payment");
  $("submitRechargeBtn").textContent = record.status === "pending_payment"
    ? "订单已生成"
    : record.status === "user_paid" ? "等待管理员确认" : "生成付款订单";
  $("submitRechargeBtn").disabled = record.status === "pending_payment" || record.status === "user_paid";
}

async function submitRechargeRequest() {
  if (!state.account || !state.session) {
    closeModal("membershipModal", true);
    showAuth("请先登录后再提交充值申请", { path: "/login", replace: true });
    return;
  }
  const button = $("submitRechargeBtn");
  if (button.disabled || !selectedRechargePlan) return;
  button.disabled = true;
  try {
    const data = await api("/api/recharge/request", {
      plan: selectedRechargePlan,
      trial_language: selectedRechargePlan === "trial_single_language" ? $("trialLanguageSelect").value : "",
    });
    renderPaymentOrder(data.request);
    $("rechargeMessage").textContent = data.created
      ? "订单已生成。付款时请填写页面中的备注，付款后再点“我已付款”。"
      : "你已有未完成订单，已为你显示原订单。";
  } catch (error) {
    $("rechargeMessage").textContent = error.message;
  } finally {
    button.disabled = !selectedRechargePlan || ["pending_payment", "user_paid"].includes(currentPaymentOrder?.status);
  }
}

async function confirmRechargePayment() {
  if (!currentPaymentOrder?.id) return;
  const button = $("confirmPaymentBtn");
  button.disabled = true;
  try {
    const data = await api("/api/recharge/confirm", { request_id: currentPaymentOrder.id });
    renderPaymentOrder(data.request);
    $("rechargeMessage").textContent = "已通知管理员。只有管理员核对付款后才会开通会员。";
  } catch (error) {
    $("rechargeMessage").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function changeOwnSecret(event) {
  event.preventDefault();
  const message = $("accountMessage");
  try {
    await api("/api/account/secret", {
      current_secret: $("currentSecretInput").value,
      new_secret: $("newSecretInput").value,
    });
    message.textContent = "密钥已修改，请使用新密钥重新登录";
    window.setTimeout(() => {
      closeModal("accountModal", true);
      clearSession();
      showAuth("密钥已修改，请重新登录");
    }, 700);
  } catch (error) {
    message.textContent = error.message;
  }
}

async function deleteOwnAccount(event) {
  event.preventDefault();
  const button = $("confirmDeleteAccountBtn");
  button.disabled = true;
  try {
    const deletedAccount = state.account;
    await api("/api/account/delete", { secret: $("deleteSecretInput").value });
    closeModal("deleteAccountModal", true);
    closeModal("accountModal", true);
    clearAccountLocalData(deletedAccount);
    clearSession();
    showAuth("账户已注销", { path: "/login", replace: true });
    alert("账户已永久注销");
  } catch (error) {
    $("accountMessage").textContent = error.message;
    closeModal("deleteAccountModal");
  } finally {
    button.disabled = false;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[char]));
}

async function writeClipboardText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(String(value));
      return true;
    } catch (_) {
      // Embedded browsers may expose the API but reject it; fall back below.
    }
  }

  const helper = document.createElement("textarea");
  helper.value = String(value);
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  helper.style.pointerEvents = "none";
  document.body.appendChild(helper);
  helper.focus();
  helper.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (_) {
    copied = false;
  } finally {
    helper.remove();
  }
  return copied;
}

async function copyTextWithFeedback(value, button) {
  if (!button) return false;
  const originalLabel = button.dataset.copyLabel || button.textContent;
  button.dataset.copyLabel = originalLabel;
  const copied = await writeClipboardText(value);
  button.textContent = copied ? "已复制" : "复制失败";
  window.setTimeout(() => {
    if (button.isConnected) button.textContent = button.dataset.copyLabel || originalLabel;
  }, 1600);
  return copied;
}

function adminUserById(id) {
  return adminUsers.find((user) => user.id === id);
}

function formatLocalDateTime(value, fallback = "无") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("zh-CN", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function rechargeStatusLabel(status) {
  return {
    pending: "待处理",
    pending_payment: "等待用户付款",
    user_paid: "用户已确认付款",
    activated: "已开通",
    approved: "已开通",
    rejected: "已拒绝",
  }[status] || status || "未知";
}

function renderAdminUsers(users = null) {
  if (Array.isArray(users)) adminUsers = users;
  const list = $("adminUserList");
  const query = $("adminUserSearch")?.value.trim().toLocaleLowerCase() || "";
  const visibleUsers = query
    ? adminUsers.filter((user) => [user.username, user.id].some((value) => String(value || "").toLocaleLowerCase().includes(query)))
    : adminUsers;
  const count = $("adminUserCount");
  if (count) count.textContent = query ? `显示 ${visibleUsers.length} / ${adminUsers.length} 个用户` : `共 ${adminUsers.length} 个用户`;
  list.innerHTML = visibleUsers.map((user) => {
    const protectedUser = user.is_super_admin;
    const stateClass = user.banned ? "account-state-bad" : "account-state-good";
    const summary = accountMembershipSummary(user);
    const memberships = (user.memberships || []).map((item) => `${item.plan_name || membershipLabel(item.plan_code)}${item.is_lifetime ? " · 永久" : item.expires_at ? ` · 至 ${formatLocalDateTime(item.expires_at)}` : ""}`).join("；") || "无有效会员";
    const entitlements = (user.entitlements || []).map((item) => ({
      language_japanese_access: "日语",
      language_english_access: "英语",
      language_all_access: "全部语言",
      tools_access: "工具箱",
      tools_batch_access: "批量处理",
      temporary_share_access: "临时分享",
      save_tool_config: "配置保存",
      all_features_access: "全功能",
    }[item] || item)).join("、") || "基础功能";
    return `<article class="admin-user-card" data-user-id="${escapeHtml(user.id)}">
      <div class="admin-user-identity"><h3>${escapeHtml(user.username)}</h3><p class="admin-user-id">${escapeHtml(user.id)}</p><p class="${stateClass}">${user.banned ? "已永久封禁" : "正常"}</p></div>
      <div class="admin-user-facts"><p><span>最高等级</span><strong>${escapeHtml(summary.name)}</strong></p><p><span>有效会员</span><strong>${escapeHtml(memberships)}</strong></p><p><span>合并权益</span><strong>${escapeHtml(entitlements)}</strong></p></div>
      <div class="admin-user-security"><p><span class="admin-field-name">登录密钥</span><span class="secret-value">已加密保存，只能重置</span></p><p class="admin-last-login">最后登录：${escapeHtml(formatLocalDateTime(user.last_login_at, "从未"))}</p></div>
      <div class="action-row compact admin-user-actions"><button data-admin-edit type="button" ${protectedUser ? "disabled" : ""}>编辑</button></div>
    </article>`;
  }).join("") || `<p class="admin-empty-state">${query ? "没有匹配的用户" : "暂无用户"}</p>`;
  list.querySelectorAll("[data-admin-edit]").forEach((button) => button.addEventListener("click", () => openAdminEditor(button.closest("[data-user-id]").dataset.userId)));
}

function renderAdminRecharge(requests) {
  const list = $("adminRechargeList");
  list.innerHTML = (requests || []).map((request) => `<article class="admin-user-card" data-request-id="${escapeHtml(request.id)}">
    <div class="admin-user-identity"><h3>${escapeHtml(request.username)}</h3><p class="admin-user-id">${escapeHtml(request.order_number || request.id)}</p><p class="admin-last-login">申请：${escapeHtml(formatLocalDateTime(request.requested_at, "未知"))}</p></div>
    <div class="admin-user-facts"><p><span>套餐</span><strong>${escapeHtml(membershipLabel(request.plan_code || request.plan))}</strong></p><p><span>金额</span><strong>${escapeHtml(`${(Number(request.amount_cents || 0) / 100).toFixed(2)} ${request.currency || "CNY"}`)}</strong></p><p><span>付款备注</span><strong>${escapeHtml(request.payment_note || "-")}</strong></p></div>
    <div class="admin-request-status"><span>状态</span><strong>${escapeHtml(rechargeStatusLabel(request.status))}</strong>${request.user_confirmed_at ? `<small>用户确认：${escapeHtml(formatLocalDateTime(request.user_confirmed_at))}</small>` : ""}</div>
    <div class="action-row compact admin-user-actions">${["pending_payment", "user_paid", "pending"].includes(request.status) ? '<button data-recharge-approve type="button">确认付款并开通</button><button data-recharge-reject type="button">拒绝</button>' : ""}</div>
  </article>`).join("") || "<p>暂无充值申请</p>";
  list.querySelectorAll("[data-recharge-approve], [data-recharge-reject]").forEach((button) => button.addEventListener("click", () => {
    const requestId = button.closest("[data-request-id]").dataset.requestId;
    const action = button.hasAttribute("data-recharge-approve") ? "approve" : "reject";
    askConfirmation(action === "approve" ? "确认开通该会员套餐？" : "确认拒绝该充值申请？", async () => {
      await api("/api/admin/recharge/process", { request_id: requestId, action });
      await loadAdminData();
    });
  }));
}

function renderAdminAudit(logs) {
  const list = $("adminAuditList");
  list.innerHTML = (logs || []).map((log) => `<article class="admin-log-card">
    <div><strong>${escapeHtml(log.action)}</strong><time>${escapeHtml(formatLocalDateTime(log.created_at))}</time></div>
    <p>管理员：${escapeHtml(log.actor_username || "-")} · 对象：${escapeHtml(log.target_username || "-")}</p>
    <p>${escapeHtml(log.note || "无备注")}</p>
  </article>`).join("") || "<p>暂无审计记录</p>";
}

function renderAdminToolStats(tools) {
  const list = $("adminToolStatsList");
  list.innerHTML = (tools || []).map((item) => `<article class="admin-log-card"><div><strong>${escapeHtml(item.tool_id)}</strong><span>${escapeHtml(item.uses || 0)} 次 · ${escapeHtml(item.users || 0)} 人</span></div><p>最近使用：${escapeHtml(formatLocalDateTime(item.last_used_at, "无"))}</p></article>`).join("") || "<p>暂无工具使用记录</p>";
}

async function loadAdminData() {
  if (!isSuperAdmin()) return;
  const sequence = ++adminLoadSequence;
  const refreshButton = $("refreshAdminBtn");
  refreshButton.disabled = true;
  refreshButton.textContent = "刷新中…";
  $("adminPanel").setAttribute("aria-busy", "true");
  $("adminError").textContent = "";
  if (!adminUsers.length) {
    $("adminUserCount").textContent = "正在加载用户…";
    if (!$("adminUserList").children.length) $("adminUserList").innerHTML = '<p class="admin-empty-state">正在连接服务器…</p>';
  }
  const requests = [
    { label: "用户", path: "/api/admin/users", target: "adminUserList", apply: (data) => renderAdminUsers(data.users) },
    { label: "充值申请", path: "/api/admin/recharge", target: "adminRechargeList", apply: (data) => renderAdminRecharge(data.requests) },
    { label: "审计日志", path: "/api/admin/audit", target: "adminAuditList", apply: (data) => renderAdminAudit(data.logs) },
    { label: "工具统计", path: "/api/admin/tool-stats", target: "adminToolStatsList", apply: (data) => renderAdminToolStats(data.tools) },
  ];
  try {
    const results = await Promise.allSettled(requests.map((request) => apiGet(request.path)));
    if (sequence !== adminLoadSequence || !state.session || !isSuperAdmin()) return;
    const failures = [];
    results.forEach((result, index) => {
      const request = requests[index];
      if (result.status === "fulfilled") {
        try {
          request.apply(result.value);
        } catch (_error) {
          failures.push(`${request.label}返回格式异常`);
        }
        return;
      }
      failures.push(`${request.label}：${result.reason?.message || "加载失败"}`);
      const target = $(request.target);
      const missingUsers = request.label === "用户" && !adminUsers.length;
      if (target && (!target.children.length || missingUsers)) target.innerHTML = `<p class="admin-empty-state">${request.label}尚未加载，请点击刷新重试。</p>`;
      if (missingUsers) $("adminUserCount").textContent = "用户尚未加载";
    });
    $("adminError").textContent = failures.length
      ? `${failures.join("；")}。已加载的内容会保留，请点击刷新重试。`
      : "";
  } finally {
    if (sequence === adminLoadSequence) {
      refreshButton.disabled = false;
      refreshButton.textContent = "刷新";
      $("adminPanel").setAttribute("aria-busy", "false");
    }
  }
}

async function showAdminPanel(pushHistory = true) {
  if (!state.session || !state.account) {
    showAuth("请先登录管理员账户", { path: "/login", replace: true });
    return;
  }
  if (!isSuperAdmin()) {
    history.replaceState({}, "", "/select");
    showModulePicker(false);
    alert("无管理员权限");
    return;
  }
  if (pushHistory && location.pathname !== "/admin") history.pushState({}, "", "/admin");
  hidePrimaryScreens();
  $("adminPanel").classList.remove("hidden");
  $("adminPanel").setAttribute("aria-hidden", "false");
  renderAccountUi();
  await loadAdminData();
}

function leaveAdminPanel() {
  showModulePicker(true);
}

function localDateValue(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("zh-CN", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}/${parts.month}/${parts.day}`;
}

function membershipDateValue(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : localDateValue(parsed);
}

function updateAdminMembershipFields(fillDefaults = true) {
  const action = $("adminMembershipAction").value;
  const membership = $("adminMembershipSelect").value;
  const cancelling = action === "cancel" || action === "cancel_all";
  const lifetime = ["japanese_lifetime", "all_access_lifetime"].includes(membership);
  const singleLanguage = membership === "trial_single_language";
  const fieldsDisabled = cancelling;
  $("adminTrialLanguageField")?.classList.toggle("hidden", cancelling || !singleLanguage);
  $("adminTrialLanguageSelect").required = !cancelling && singleLanguage;
  $("adminMembershipSelect").disabled = action === "cancel_all";
  $("adminMembershipStart").disabled = fieldsDisabled;
  $("adminMembershipExpires").disabled = fieldsDisabled || lifetime;
  $("adminMembershipStartField").classList.toggle("field-disabled", fieldsDisabled);
  $("adminMembershipExpiresField").classList.toggle("field-disabled", fieldsDisabled || lifetime);
  $("adminPreserveJapanese").closest("label").classList.toggle("hidden", action !== "cancel_all");
  if (cancelling) {
    $("adminMembershipStart").value = "";
    $("adminMembershipExpires").value = "";
    return;
  }
  if (fillDefaults && !$("adminMembershipStart").value) $("adminMembershipStart").value = localDateValue();
  if (lifetime) {
    $("adminMembershipExpires").value = "";
  } else if (fillDefaults && !$("adminMembershipExpires").value) {
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);
    $("adminMembershipExpires").value = localDateValue(expiry);
  }
}

function renderAdminCurrentMemberships(user) {
  const target = $("adminCurrentMemberships");
  const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
  target.innerHTML = memberships.map((item) => {
    const language = { english: "英语", japanese: "日语" }[item.metadata?.language] || "";
    return `<article><strong>${escapeHtml(item.plan_name || membershipLabel(item.plan_code))}</strong><span>${item.is_lifetime ? "永久有效" : `到期 ${escapeHtml(formatLocalDateTime(item.expires_at, "未知"))}`}</span><small>${escapeHtml([language, item.source || "系统"].filter(Boolean).join(" · "))}</small></article>`;
  }).join("") || "<p>当前没有有效会员</p>";
}

function openAdminEditor(userId) {
  const user = adminUserById(userId);
  if (!user || user.is_super_admin) return;
  $("adminEditUserId").value = user.id;
  $("adminEditTitle").textContent = `编辑 ${user.username}`;
  const preferred = (user.memberships || [])
    .filter((item) => ["all_access_lifetime", "all_access_monthly", "japanese_lifetime", "trial_single_language"].includes(item.plan_code))
    .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0))[0];
  $("adminMembershipAction").value = "grant";
  $("adminMembershipSelect").value = preferred?.plan_code || "japanese_lifetime";
  $("adminMembershipStart").value = membershipDateValue(preferred?.starts_at);
  $("adminMembershipExpires").value = membershipDateValue(preferred?.expires_at);
  $("adminTrialLanguageSelect").value = preferred?.metadata?.language || "";
  $("adminMembershipNote").value = "";
  $("adminPreserveJapanese").checked = false;
  $("adminNewSecretInput").value = "";
  $("adminToggleBanBtn").textContent = user.banned ? "解除封禁" : "永久封禁";
  $("adminEditMessage").textContent = "";
  renderAdminCurrentMemberships(user);
  updateAdminMembershipFields(false);
  openModal("adminEditModal");
}

async function saveAdminMembership() {
  const userId = $("adminEditUserId").value;
  const button = $("saveAdminMembershipBtn");
  if (button.disabled) return;
  const action = $("adminMembershipAction").value;
  const planCode = $("adminMembershipSelect").value;
  const user = adminUserById(userId);
  const actionLabel = { grant: "开通或覆盖", extend: "续期", cancel: "取消所选会员", cancel_all: "降级为普通用户" }[action] || action;
  askConfirmation(`确认对“${user?.username || userId}”执行“${actionLabel}”？`, async () => {
    button.disabled = true;
    try {
      const data = await api("/api/admin/membership/manage", {
        user_id: userId,
        action,
        plan_code: planCode,
        membership_start: $("adminMembershipStart").value.trim(),
        membership_expires: $("adminMembershipExpires").value.trim(),
        note: $("adminMembershipNote").value.trim(),
        preserve_japanese: $("adminPreserveJapanese").checked,
        trial_language: planCode === "trial_single_language" ? $("adminTrialLanguageSelect").value : "",
      });
      $("adminEditMessage").textContent = "会员设置已保存并立即生效";
      await loadAdminData();
      const refreshed = adminUserById(userId) || data.user;
      renderAdminCurrentMemberships(refreshed);
    } catch (error) {
      $("adminEditMessage").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

function updateAdminToolsOverride(allowed) {
  const userId = $("adminEditUserId").value;
  const user = adminUserById(userId);
  const message = allowed === false
    ? `确认仅取消“${user?.username || userId}”的在线工具箱权限？语言会员不会受影响。`
    : `确认移除“${user?.username || userId}”的工具权限覆盖，并恢复按会员方案计算？`;
  askConfirmation(message, async () => {
    await api("/api/admin/entitlement", {
      user_id: userId,
      entitlement: "tools_access",
      allowed,
      note: $("adminMembershipNote").value.trim(),
    });
    $("adminEditMessage").textContent = allowed === false ? "已单独取消工具权限" : "已恢复按会员方案计算工具权限";
    await loadAdminData();
    renderAdminCurrentMemberships(adminUserById(userId));
  });
}

async function saveAdminSecret() {
  const secret = $("adminNewSecretInput").value;
  try {
    await api("/api/admin/secret", { user_id: $("adminEditUserId").value, secret });
    $("adminEditMessage").textContent = "密钥已修改，旧会话已失效";
    await loadAdminData();
  } catch (error) { $("adminEditMessage").textContent = error.message; }
}

function askConfirmation(message, action) {
  $("confirmMessage").textContent = message;
  confirmAction = action;
  openModal("confirmModal");
}

async function runConfirmedAction() {
  const action = confirmAction;
  confirmAction = null;
  $("acceptConfirmBtn").disabled = true;
  try {
    closeModal("confirmModal");
    if (action) await action();
  } catch (error) {
    $("adminEditMessage").textContent = error.message;
  } finally {
    $("acceptConfirmBtn").disabled = false;
  }
}

function adminUserAction(kind) {
  const userId = $("adminEditUserId").value;
  const user = adminUserById(userId);
  if (!user || user.is_super_admin) return;
  const configs = {
    ban: [user.banned ? "确认解除该用户的永久封禁？" : "确认永久封禁该用户并立即退出其所有会话？", "/api/admin/ban", { user_id: userId, banned: !user.banned }],
    logout: ["确认强制退出该用户的全部登录会话？", "/api/admin/logout-user", { user_id: userId }],
    delete: ["确认删除该用户、会员资格、充值申请和全部会话？此操作不可恢复。", "/api/admin/delete-user", { user_id: userId }],
  };
  const [message, path, payload] = configs[kind];
  askConfirmation(message, async () => {
    await api(path, payload);
    closeModal("adminEditModal");
    await loadAdminData();
  });
}

function wordDraftKey(language = state.quizLanguage, profile = state.profile) {
  const accountId = encodeURIComponent(String(state.account?.id || "no-account"));
  return `vocabWords:${accountId}:${language}:${profileStorageName(profile)}`;
}

function clearSavedWordDrafts(account = state.account) {
  const accountId = account?.id ? encodeURIComponent(String(account.id)) : "";
  const accountPrefix = accountId ? `vocabWords:${accountId}:` : "";
  const keysToRemove = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) || "";
    const legacySharedKey = /^vocabWords:(english|japanese):/.test(key);
    if (legacySharedKey || (accountPrefix && key.startsWith(accountPrefix))) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
  ["english", "japanese"].forEach((language) => sessionStorage.removeItem(projectRuntimeKey(language, account)));
  projectRuntime.english = null;
  projectRuntime.japanese = null;
  projectRuntimeNeedsRestore = false;
  state.words = [];
  state.index = 0;
  state.score = 0;
  state.roundSkipped = 0;
  state.quizSession = "";
  state.roundActive = false;
  state.answerLocked = false;
  state.roundStartedAt = 0;
  if ($("wordInput")) $("wordInput").value = "";
}

function clearAccountLocalData(account = state.account) {
  if (!account?.id) return;
  const accountId = accountStorageId(account);
  const localPrefixes = [
    `vocabWords:${accountId}:`,
    `wrongBook:v${ACCOUNT_DATA_VERSION}:${accountId}:`,
    `achievements:v${ACCOUNT_DATA_VERSION}:${accountId}:`,
    `studyHistory:v${STUDY_DATA_VERSION}:${accountId}:`,
    `studyGoal:v${STUDY_DATA_VERSION}:${accountId}:`,
  ];
  const exactLocalKeys = [
    `vocabProfile:v${ACCOUNT_DATA_VERSION}:${accountId}`,
    `accountLocalDataMigrated:v${ACCOUNT_DATA_VERSION}:${accountId}`,
  ];
  const localKeys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) || "";
    if (exactLocalKeys.includes(key) || localPrefixes.some((prefix) => key.startsWith(prefix))) localKeys.push(key);
  }
  localKeys.forEach((key) => localStorage.removeItem(key));
  ["english", "japanese"].forEach((language) => sessionStorage.removeItem(projectRuntimeKey(language, account)));
  clearSavedWordDrafts(account);
}

function saveCurrentWordDraft() {
  const input = $("wordInput");
  if (!input || !currentProject || !state.account) return;
  safeStorageSet(localStorage, wordDraftKey(currentProject), input.value);
}

function loadCurrentWordDraft() {
  const input = $("wordInput");
  if (!input || !currentProject || !state.account) return;
  const key = wordDraftKey(currentProject);
  const saved = localStorage.getItem(key) || "";
  if (currentProject === "japanese" && /[|｜=＝]/u.test(saved)) {
    const normalized = formatWordsForInput(parseWordText(saved));
    input.value = normalized;
    safeStorageSet(localStorage, key, normalized);
    return;
  }
  input.value = saved;
}

function saveProjectRuntime() {
  if (!currentProject || !state.account?.id) return;
  const runtime = {
    language: currentProject,
    words: [...state.words],
    index: state.index,
    score: state.score,
    roundSkipped: state.roundSkipped,
    quizSession: state.quizSession,
    roundActive: state.roundActive,
    answerLocked: state.answerLocked,
    roundStartedAt: state.roundStartedAt,
    lastRound: state.lastRound,
    mode: state.mode,
    view: document.querySelector(".view.active")?.id || "setupView",
    savedAt: Date.now(),
  };
  projectRuntime[currentProject] = runtime;
  safeStorageSet(sessionStorage, projectRuntimeKey(currentProject), JSON.stringify(runtime));
}

function loadProjectRuntime(language) {
  if (projectRuntime[language]) return projectRuntime[language];
  const key = projectRuntimeKey(language);
  let runtime = null;
  try {
    runtime = JSON.parse(sessionStorage.getItem(key) || "null");
  } catch (_) {
    runtime = null;
  }
  const valid = runtime
    && runtime.language === language
    && Array.isArray(runtime.words)
    && Number.isFinite(Number(runtime.savedAt))
    && Date.now() - Number(runtime.savedAt) <= PROJECT_RUNTIME_MAX_AGE_MS;
  if (!valid) {
    sessionStorage.removeItem(key);
    return null;
  }
  runtime.words = filterWordsByLanguage(runtime.words.map((word) => limitText(word, 240)), language).slice(0, 500);
  runtime.index = Math.max(0, Math.min(Number.parseInt(runtime.index, 10) || 0, Math.max(0, runtime.words.length - 1)));
  runtime.score = Math.max(0, Math.min(Number.parseInt(runtime.score, 10) || 0, runtime.words.length));
  runtime.roundSkipped = Math.max(0, Math.min(Number.parseInt(runtime.roundSkipped, 10) || 0, runtime.words.length));
  runtime.mode = ["normal", "review-current", "review-history"].includes(runtime.mode) ? runtime.mode : "normal";
  runtime.view = ["setupView", "quizView", "wrongView", "achievementsView", "studyView"].includes(runtime.view) ? runtime.view : "setupView";
  runtime.quizSession = limitText(runtime.quizSession, 160);
  runtime.roundActive = Boolean(runtime.roundActive && runtime.words.length);
  runtime.answerLocked = Boolean(runtime.answerLocked && runtime.roundActive);
  runtime.roundStartedAt = runtime.roundActive && Number.isFinite(Number(runtime.roundStartedAt))
    ? Math.min(Date.now(), Math.max(0, Number(runtime.roundStartedAt)))
    : 0;
  projectRuntime[language] = runtime;
  return runtime;
}

function removeProjectRuntime(language = currentProject) {
  if (!language) return;
  projectRuntime[language] = null;
  sessionStorage.removeItem(projectRuntimeKey(language));
}

function restoreProjectRuntime() {
  if (!currentProject || !projectRuntimeNeedsRestore) return;
  projectRuntimeNeedsRestore = false;
  const runtime = loadProjectRuntime(currentProject);
  if (!runtime) {
    state.words = [];
    state.index = 0;
    state.score = 0;
    state.roundSkipped = 0;
    state.quizSession = "";
    state.lastRound = null;
    state.roundActive = false;
    state.answerLocked = false;
    state.roundStartedAt = 0;
    state.mode = "normal";
    setView("setupView");
    updateStats();
    return;
  }
  state.words = [...runtime.words];
  state.index = Math.min(runtime.index, Math.max(0, state.words.length - 1));
  state.score = runtime.score;
  state.roundSkipped = runtime.roundSkipped;
  state.quizSession = runtime.quizSession;
  state.lastRound = runtime.lastRound || null;
  state.roundActive = runtime.roundActive;
  state.answerLocked = runtime.answerLocked;
  state.roundStartedAt = runtime.roundStartedAt;
  state.mode = runtime.mode;
  const view = runtime.view === "quizView" && !state.roundActive ? "setupView" : runtime.view;
  setView(view);
  if (view === "quizView" && state.roundActive) {
    if (state.answerLocked && state.index < state.words.length - 1) state.index += 1;
    if (state.answerLocked && state.index >= state.words.length - 1 && runtime.index === state.words.length - 1) {
      state.answerLocked = false;
      const summary = finishRound();
      setView(Object.keys(activeWrongBook("current")).length ? "wrongView" : "setupView");
      showRoundSummary(summary);
    } else {
      state.answerLocked = false;
      showWord();
      saveProjectRuntime();
    }
  }
  updateStats();
}

function runSplashSequence(revealContent) {
  const screen = $("entryScreen");
  if (!screen) {
    revealContent?.();
    return Promise.resolve();
  }

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const visibleMs = reducedMotion ? 260 : 2000;
  const openingMs = reducedMotion ? 300 : 1150;
  const images = Array.from(screen.querySelectorAll(".splash-art"));

  const markImageFailed = () => {
    screen.classList.add("image-failed");
    screen.querySelectorAll(".splash-fallback").forEach((fallback) => {
      fallback.setAttribute("aria-hidden", "false");
    });
  };
  images.forEach((image) => image.addEventListener("error", markImageFailed, { once: true }));
  if (images.some((image) => image.complete && !image.naturalWidth)) markImageFailed();

  return new Promise((resolve) => {
    window.setTimeout(() => {
      revealContent?.();
      window.requestAnimationFrame(() => {
        screen.classList.add("is-opening");
        window.setTimeout(() => {
          screen.classList.add("is-hidden");
          screen.setAttribute("aria-hidden", "true");
          screen.remove();
          resolve();
        }, openingMs);
      });
    }, visibleMs);
  });
}

function showLanguageGate() {
  showProjectPicker();
}

function pushRoute(path, replace = false) {
  const target = String(path || "/");
  if (location.pathname === target) return;
  history[replace ? "replaceState" : "pushState"]({}, "", target);
  renderAccountUi();
}

function hidePrimaryScreens() {
  ["modulePicker", "projectPicker", "projectApp", "toolsPanel", "shareViewer", "adminPanel"].forEach((id) => {
    const element = $(id);
    if (!element) return;
    element.classList.add("hidden");
    element.setAttribute("aria-hidden", "true");
  });
  $("topbar")?.classList.add("hidden");
  $("authPanel")?.classList.add("hidden");
  $("workspace")?.classList.add("hidden");
  window.WYJTools?.hide?.();
}

function stopProjectActivity() {
  if (currentProject) {
    saveCurrentWordDraft();
    saveProjectRuntime();
  }
  if (judgeController) judgeController.abort();
  clearNextTimer();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function showModulePicker(pushHistory = true) {
  if (!state.session || !state.account) {
    showAuth(pendingAuthMessage || "请先登录", { replace: true });
    return;
  }
  stopProjectActivity();
  currentProject = "";
  state.quizLanguage = "";
  hidePrimaryScreens();
  $("modulePicker").classList.remove("hidden");
  $("modulePicker").setAttribute("aria-hidden", "false");
  document.body.classList.add("project-picker-active");
  if (pushHistory) pushRoute("/select");
  renderAccountUi();
}

function showProjectPicker(pushHistory = true) {
  if (!state.session || !state.account) {
    showAuth(pendingAuthMessage || "请先登录后选择测试项目", { replace: true });
    return;
  }
  stopProjectActivity();
  currentProject = "";
  state.quizLanguage = "";
  hidePrimaryScreens();
  $("projectPicker").classList.remove("hidden");
  $("projectPicker").setAttribute("aria-hidden", "false");
  document.body.classList.add("project-picker-active");
  if (pushHistory) pushRoute("/language");
  renderAccountUi();
}

function showMainShell() {
  if (!currentProject) return;
  hidePrimaryScreens();
  $("languagePanel").classList.add("hidden");
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

function enterProject(value, pushHistory = true) {
  if (!state.session || !state.account) {
    showAuth("请先登录后选择测试项目");
    return;
  }
  const language = normalizeQuizLanguage(value);
  if (!language) return;
  if (currentProject && currentProject !== language) {
    saveCurrentWordDraft();
    saveProjectRuntime();
  }
  currentProject = language;
  if ($("wrongSearchInput")) $("wrongSearchInput").value = "";
  state.quizLanguage = language;
  loadProjectPreferences(language);
  projectRuntimeNeedsRestore = true;
  loadCurrentWordDraft();
  saveState();
  updateLanguageUi();
  applyPendingScreen();
  if (pushHistory) pushRoute(`/language/${language}`);
  renderAccountUi();
}

function showAuth(message = "", options = {}) {
  pendingScreen = "auth";
  pendingAuthMessage = message;
  stopProjectActivity();
  currentProject = "";
  state.quizLanguage = "";
  const mode = options.mode || (options.path === "/register" || location.pathname === "/register" ? "register" : "login");
  showAuthMode(mode);
  hidePrimaryScreens();
  $("projectApp").classList.remove("hidden");
  $("projectApp").setAttribute("aria-hidden", "false");
  $("topbar").classList.add("hidden");
  $("projectNameLabel").textContent = "";
  $("authPanel").classList.remove("hidden");
  $("workspace").classList.add("hidden");
  $("loginError").textContent = message;
  $("offlineReviewBtn").classList.add("hidden");
  document.body.classList.add("project-picker-active");
  const path = options.path || (mode === "register" ? "/register" : "/login");
  if (!options.skipRoute) pushRoute(path, Boolean(options.replace));
  renderAccountUi();
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

async function showTools(path = "/tools", pushHistory = true) {
  if (!state.session || !state.account) {
    showAuth("请先登录后使用在线工具箱", { replace: true });
    return;
  }
  try {
    await apiGet("/api/tools/access");
    stopProjectActivity();
    currentProject = "";
    state.quizLanguage = "";
    hidePrimaryScreens();
    if (pushHistory) pushRoute(path);
    await window.WYJTools.show(path);
    document.body.classList.remove("project-picker-active");
    renderAccountUi();
  } catch (error) {
    showModulePicker(false);
    pushRoute("/select", true);
    if (error.code === "membership_required") {
      $("rechargeMessage").textContent = "当前会员不包含在线工具箱，请选择全功能会员。";
      await openMembershipModal();
    } else {
      alert(error.message);
    }
  }
}

function showShareRoute(path) {
  stopProjectActivity();
  currentProject = "";
  state.quizLanguage = "";
  hidePrimaryScreens();
  if (!window.WYJTools?.showShareViewer?.(path)) return false;
  document.body.classList.add("project-picker-active");
  renderAccountUi();
  return true;
}

async function routeCurrent() {
  if (routeBusy) return;
  routeBusy = true;
  try {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path.startsWith("/share/")) {
      if (!showShareRoute(path)) pushRoute(state.session && state.account ? "/select" : "/login", true);
      return;
    }
    if (!state.session || !state.account) {
      const register = path === "/register";
      showAuth(pendingAuthMessage, { mode: register ? "register" : "login", path: register ? "/register" : "/login", replace: !["/login", "/register"].includes(path) });
      return;
    }
    if (["/", "/login", "/register", "/select"].includes(path)) {
      showModulePicker(false);
      if (path !== "/select") pushRoute("/select", true);
      return;
    }
    if (path === "/language") {
      showProjectPicker(false);
      return;
    }
    const languageMatch = path.match(/^\/language\/(english|japanese)$/);
    if (languageMatch) {
      pendingScreen = "workspace";
      enterProject(languageMatch[1], false);
      return;
    }
    if (path === "/tools" || path.startsWith("/tools/")) {
      await showTools(path, false);
      return;
    }
    if (path === "/admin") {
      await showAdminPanel(false);
      return;
    }
    if (path === "/account") {
      showModulePicker(false);
      openModal("accountModal");
      return;
    }
    if (path === "/recharge") {
      showModulePicker(false);
      await openMembershipModal();
      return;
    }
    showModulePicker(false);
    pushRoute("/select", true);
  } finally {
    routeBusy = false;
  }
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
  if (input) input.placeholder = language === "japanese"
    ? "输入日语词表，每行一个词；汉字或假名都可以"
    : "输入英语词表，每行一个词";
  updateAiSuggestionControls();
}

function aiSuggestionSettingsKey(language = state.quizLanguage) {
  return `aiSuggestSettings:${language}`;
}

function saveAiSuggestionSettings() {
  if (!LANGUAGE_LABELS[state.quizLanguage]) return;
  const level = $("aiLevelSelect")?.value || "";
  const count = Number($("aiSuggestCount")?.value);
  const mode = $("aiSuggestMode")?.value === "append" ? "append" : "replace";
  safeStorageSet(localStorage, aiSuggestionSettingsKey(), JSON.stringify({ level, count, mode }));
}

function updateAiSuggestionControls() {
  const language = state.quizLanguage;
  const levelSelect = $("aiLevelSelect");
  const countInput = $("aiSuggestCount");
  if (!levelSelect || !countInput || !VOCABULARY_LEVEL_OPTIONS[language]) return;
  const previousLanguage = levelSelect.dataset.language || "";
  const previousLevel = previousLanguage === language ? levelSelect.value : "";
  const saved = previousLanguage === language ? null : loadJson(aiSuggestionSettingsKey(language), {});
  levelSelect.replaceChildren();
  VOCABULARY_LEVEL_OPTIONS[language].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    levelSelect.append(option);
  });
  const savedLevel = String(saved?.level || "");
  if (previousLevel && VOCABULARY_LEVEL_OPTIONS[language].some(([value]) => value === previousLevel)) {
    levelSelect.value = previousLevel;
  } else if (savedLevel && VOCABULARY_LEVEL_OPTIONS[language].some(([value]) => value === savedLevel)) {
    levelSelect.value = savedLevel;
  }
  levelSelect.dataset.language = language;
  $("aiSuggestLanguage").textContent = quizLanguageLabel(language);
  const accountLimit = accountWordLimit(language);
  const maxCount = Number.isFinite(accountLimit) ? accountLimit : 200;
  countInput.max = String(maxCount);
  if (saved && Number.isInteger(Number(saved.count))) countInput.value = String(saved.count);
  if (saved && $("aiSuggestMode")) $("aiSuggestMode").value = saved.mode === "append" ? "append" : "replace";
  const currentCount = Number(countInput.value);
  if (!Number.isInteger(currentCount) || currentCount < 1 || currentCount > maxCount) {
    countInput.value = String(Math.min(10, maxCount));
  }
  if (previousLanguage && previousLanguage !== language) $("aiSuggestMessage").textContent = "";
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
  showAchievementToast(`解锁成就：${item.title}`);
  renderAchievements();
}

function showAchievementToast(message) {
  const toast = $("achievementToast");
  if (!toast) return;
  clearTimeout(achievementToastTimer);
  clearTimeout(achievementToastHideTimer);
  toast.textContent = message;
  toast.classList.remove("hidden", "is-leaving");
  window.requestAnimationFrame(() => toast.classList.add("is-visible"));
  achievementToastTimer = window.setTimeout(() => {
    toast.classList.add("is-leaving");
    toast.classList.remove("is-visible");
    achievementToastHideTimer = window.setTimeout(() => toast.classList.add("hidden"), 240);
  }, 3200);
}

function calculateLongestStudyStreak(records) {
  const dayNumbers = [...new Set(records.map((record) => localDayKey(record.finishedAt)).filter(Boolean))]
    .map((key) => {
      const [year, month, day] = key.split("-").map(Number);
      return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
    })
    .sort((left, right) => left - right);
  let longest = 0;
  let current = 0;
  let previous = null;
  dayNumbers.forEach((day) => {
    current = previous !== null && day === previous + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day;
  });
  return longest;
}

function achievementMetrics() {
  const records = state.studyRecords;
  const languageRounds = { english: 0, japanese: 0 };
  const totals = records.reduce((result, record) => {
    result.rounds += 1;
    result.words += record.total;
    result.correct += record.correct;
    result.skipped += record.skipped;
    if (record.correct === record.total) result.perfectRounds += 1;
    if (record.total >= 20) result.longRounds += 1;
    if (record.practiceMode === "dictation") result.dictationRounds += 1;
    if (record.mode.startsWith("review-")) result.reviewRounds += 1;
    if (record.total >= 10 && record.accuracy >= 90) result.highAccuracyRounds += 1;
    languageRounds[record.language] += 1;
    return result;
  }, {
    rounds: 0,
    words: 0,
    correct: 0,
    skipped: 0,
    perfectRounds: 0,
    longRounds: 0,
    dictationRounds: 0,
    reviewRounds: 0,
    highAccuracyRounds: 0,
  });
  totals.wrongWords = Object.keys(state.historyWrongBook).length;
  totals.longestStreak = calculateLongestStudyStreak(records);
  totals.bilingualRounds = Math.min(languageRounds.english, languageRounds.japanese);

  const dailyTotals = new Map();
  records.forEach((record) => {
    const day = localDayKey(record.finishedAt);
    const key = `${day}:${record.language}`;
    dailyTotals.set(key, (dailyTotals.get(key) || 0) + record.total);
  });
  const completedGoalDays = new Set();
  dailyTotals.forEach((total, key) => {
    const separator = key.lastIndexOf(":");
    const day = key.slice(0, separator);
    const language = key.slice(separator + 1);
    const storedGoal = Number.parseInt(localStorage.getItem(studyGoalKey(language)), 10);
    const goal = Number.isInteger(storedGoal) && storedGoal >= 1 && storedGoal <= 500 ? storedGoal : 20;
    if (total >= goal) completedGoalDays.add(day);
  });
  totals.goalDays = completedGoalDays.size;
  return totals;
}

function evaluateAchievements(notify = false) {
  const metrics = achievementMetrics();
  const unlockedNow = [];
  ACHIEVEMENTS.forEach((item) => {
    if (!item.metric || state.achievements[item.id]) return;
    if ((metrics[item.metric] || 0) < item.goal) return;
    state.achievements[item.id] = new Date().toLocaleString();
    unlockedNow.push(item);
  });
  if (unlockedNow.length) {
    saveAchievements();
    if (notify) {
      showAchievementToast(unlockedNow.length === 1
        ? `解锁成就：${unlockedNow[0].title}`
        : `一次解锁 ${unlockedNow.length} 个成就`);
    }
  }
  return metrics;
}

function renderAchievements() {
  const list = $("achievementList");
  if (!list) return;
  list.innerHTML = "";
  const metrics = evaluateAchievements(false);
  const unlockedCount = ACHIEVEMENTS.filter((item) => state.achievements[item.id]).length;
  const points = ACHIEVEMENTS.reduce((sum, item) => (
    state.achievements[item.id] ? sum + (ACHIEVEMENT_TIERS[item.tier]?.points || 0) : sum
  ), 0);
  $("achievementSummary").textContent = `${state.profile} · ${ACHIEVEMENTS.length} 个挑战`;
  $("achievementPoints").textContent = `${points} 点`;
  $("achievementUnlockedCount").textContent = unlockedCount;
  $("achievementInProgressCount").textContent = ACHIEVEMENTS.length - unlockedCount;
  $("achievementCompletion").textContent = `${Math.round((unlockedCount / ACHIEVEMENTS.length) * 100)}%`;
  $("achievementTotalProgress").max = ACHIEVEMENTS.length;
  $("achievementTotalProgress").value = unlockedCount;

  document.querySelectorAll("[data-achievement-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.achievementFilter === achievementFilter);
  });

  const visibleItems = ACHIEVEMENTS.filter((item) => {
    const unlocked = Boolean(state.achievements[item.id]);
    if (achievementFilter === "unlocked") return unlocked;
    if (achievementFilter === "progress") return !unlocked;
    return true;
  });

  visibleItems.forEach((item) => {
    const node = document.createElement("article");
    const unlockedAt = state.achievements[item.id];
    const tier = ACHIEVEMENT_TIERS[item.tier] || ACHIEVEMENT_TIERS.bronze;
    const current = item.metric ? Math.max(0, metrics[item.metric] || 0) : unlockedAt ? 1 : 0;
    const goal = item.goal || 1;
    node.className = `achievement-item tier-${item.tier || "bronze"}${unlockedAt ? " unlocked" : ""}`;
    const title = document.createElement("h3");
    const name = document.createElement("strong");
    const mark = document.createElement("span");
    mark.className = "achievement-tier";
    const desc = document.createElement("p");
    name.textContent = item.title;
    mark.textContent = `${item.category} · ${tier.label}`;
    title.appendChild(name);
    title.appendChild(mark);
    desc.textContent = item.desc;
    node.appendChild(title);
    node.appendChild(desc);

    const progress = document.createElement("div");
    progress.className = "achievement-card-progress";
    const bar = document.createElement("progress");
    bar.max = goal;
    bar.value = unlockedAt ? goal : Math.min(current, goal);
    const detail = document.createElement("div");
    const count = document.createElement("span");
    count.textContent = item.metric ? `${Math.min(current, goal)} / ${goal}` : unlockedAt ? "已完成" : "等待触发";
    const reward = document.createElement("span");
    reward.textContent = `${tier.points} 点`;
    detail.append(count, reward);
    progress.append(bar, detail);
    node.appendChild(progress);

    const status = document.createElement("p");
    status.className = "achievement-status";
    status.textContent = unlockedAt ? `已获得 · ${unlockedAt}` : "尚未完成";
    node.appendChild(status);
    list.appendChild(node);
  });
  if (!visibleItems.length) {
    const empty = document.createElement("p");
    empty.className = "achievement-empty";
    empty.textContent = achievementFilter === "unlocked" ? "还没有已获得的成就" : "所有成就都已完成";
    list.appendChild(empty);
  }
}

function localDayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function studyDaySeries(days = 7) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() - (days - index - 1));
    return { date, key: localDayKey(date), total: 0, correct: 0, rounds: 0 };
  });
}

function currentStudyRecords() {
  return state.studyRecords
    .filter((record) => record.language === state.quizLanguage)
    .sort((left, right) => Date.parse(right.finishedAt) - Date.parse(left.finishedAt));
}

function studyGoalValue() {
  const stored = Number.parseInt(localStorage.getItem(studyGoalKey()), 10);
  return Number.isInteger(stored) && stored >= 1 && stored <= 500 ? stored : 20;
}

function saveStudyGoal() {
  const input = $("studyGoalInput");
  if (!input || !state.account?.id || !state.quizLanguage) return;
  const goal = Math.max(1, Math.min(500, Number.parseInt(input.value, 10) || 20));
  input.value = String(goal);
  safeStorageSet(localStorage, studyGoalKey(), String(goal));
  renderStudyDashboard();
}

function formatDuration(seconds) {
  const value = Math.max(0, Number.parseInt(seconds, 10) || 0);
  if (value < 60) return `${value}秒`;
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  if (minutes < 60) return remainder ? `${minutes}分${remainder}秒` : `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}小时${restMinutes}分` : `${hours}小时`;
}

function calculateStudyStreak(records) {
  const studiedDays = new Set(records.map((record) => localDayKey(record.finishedAt)).filter(Boolean));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!studiedDays.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (streak < 3660 && studiedDays.has(localDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function recordStudyRound(summary) {
  if (!state.account?.id || !summary?.total || !normalizeQuizLanguage(summary.language)) return;
  const finishedAt = new Date().toISOString();
  state.studyRecords.push({
    id: `${Date.now()}-${summary.language}-${state.studyRecords.length}`,
    finishedAt,
    language: summary.language,
    practiceMode: normalizePracticeMode(summary.practiceMode),
    mode: summary.mode,
    total: summary.total,
    correct: summary.correct,
    wrong: summary.wrong,
    skipped: summary.skipped,
    accuracy: summary.accuracy,
    durationSec: summary.durationSec,
  });
  saveStudyRecords();
  evaluateAchievements(true);
  if ($("studyView")?.classList.contains("active")) renderStudyDashboard();
}

function renderStudyDashboard() {
  const history = $("studyHistory");
  const chart = $("studyWeekChart");
  if (!history || !chart) return;
  const records = currentStudyRecords();
  const days = studyDaySeries(7);
  const dayByKey = new Map(days.map((day) => [day.key, day]));
  records.forEach((record) => {
    const day = dayByKey.get(localDayKey(record.finishedAt));
    if (!day) return;
    day.total += record.total;
    day.correct += record.correct;
    day.rounds += 1;
  });

  const totalWords = records.reduce((sum, record) => sum + record.total, 0);
  const weekWords = days.reduce((sum, day) => sum + day.total, 0);
  const weekCorrect = days.reduce((sum, day) => sum + day.correct, 0);
  const today = days[days.length - 1];
  const goal = studyGoalValue();
  const recent = records[0];

  $("studyGoalInput").value = String(goal);
  $("studyGoalProgress").textContent = `${today.total} / ${goal}`;
  $("studyGoalBar").max = goal;
  $("studyGoalBar").value = Math.min(today.total, goal);
  $("studyTotalRounds").textContent = records.length;
  $("studyTotalWords").textContent = totalWords;
  $("studyWeekAccuracy").textContent = weekWords ? `${Math.round((weekCorrect / weekWords) * 100)}%` : "--";
  $("studyStreak").textContent = calculateStudyStreak(records);
  $("studyWeekTotal").textContent = `${weekWords} 题`;
  $("studyRecordCount").textContent = `${records.length} 条`;
  $("studySummary").textContent = recent
    ? `${state.profile} · ${quizLanguageLabel(state.quizLanguage)} · 最近学习 ${new Date(recent.finishedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
    : `${state.profile} · ${quizLanguageLabel(state.quizLanguage)} · 暂无完成记录`;

  chart.innerHTML = "";
  const maxTotal = Math.max(1, ...days.map((day) => day.total));
  days.forEach((day) => {
    const item = document.createElement("div");
    item.className = `study-day${day.total ? "" : " is-empty"}`;
    item.title = `${day.date.toLocaleDateString("zh-CN")} · ${day.total} 题${day.total ? ` · 正确率 ${Math.round((day.correct / day.total) * 100)}%` : ""}`;
    const count = document.createElement("span");
    count.className = "study-day-count";
    count.textContent = String(day.total);
    const track = document.createElement("div");
    track.className = "study-day-track";
    const bar = document.createElement("i");
    bar.className = "study-day-bar";
    bar.style.height = day.total ? `${Math.max(8, Math.round((day.total / maxTotal) * 100))}%` : "0";
    track.appendChild(bar);
    const label = document.createElement("span");
    label.className = "study-day-label";
    label.textContent = day.date.toLocaleDateString("zh-CN", { weekday: "short" });
    item.append(count, track, label);
    chart.appendChild(item);
  });
  chart.setAttribute("aria-label", `最近七天共完成 ${weekWords} 题`);

  history.innerHTML = "";
  records.slice(0, 20).forEach((record) => {
    const row = document.createElement("article");
    row.className = "study-history-row";
    const time = document.createElement("strong");
    time.textContent = new Date(record.finishedAt).toLocaleString("zh-CN", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    const mode = document.createElement("span");
    mode.textContent = record.mode.startsWith("review-") ? "错题复习" : practiceModeLabel(record.practiceMode);
    const total = document.createElement("span");
    total.textContent = `${record.total} 题`;
    const accuracy = document.createElement("span");
    accuracy.className = "study-history-accuracy";
    accuracy.textContent = `${record.accuracy}%`;
    const duration = document.createElement("span");
    duration.textContent = formatDuration(record.durationSec);
    const main = document.createElement("div");
    main.className = "study-history-main";
    main.append(time, mode);
    const facts = document.createElement("div");
    facts.className = "study-history-facts";
    facts.append(total, accuracy, duration);
    row.append(main, facts);
    history.appendChild(row);
  });
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "study-empty";
    empty.textContent = "完成一轮测试或错题复习后，这里会显示学习趋势。";
    history.appendChild(empty);
  }
  $("exportStudyBtn").disabled = !records.length;
  $("clearStudyBtn").disabled = !records.length;
}

function exportStudyRecords() {
  const records = currentStudyRecords();
  if (!records.length) return;
  const payload = {
    type: "wyj-study-history",
    version: STUDY_DATA_VERSION,
    exported_at: new Date().toISOString(),
    profile: state.profile,
    language: state.quizLanguage,
    daily_goal: studyGoalValue(),
    records,
  };
  const safeProfile = profileStorageName(state.profile).replace(/[^\w\u4e00-\u9fff-]+/gu, "-");
  downloadText(`study-${state.quizLanguage}-${safeProfile}-${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function confirmClearStudyRecords() {
  const records = currentStudyRecords();
  if (!records.length) return;
  askConfirmation(`确认清除${quizLanguageLabel(state.quizLanguage)}的 ${records.length} 条学习统计？错题和成就不会被删除。`, () => {
    state.studyRecords = state.studyRecords.filter((record) => record.language !== state.quizLanguage);
    saveStudyRecords();
    renderStudyDashboard();
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

function waitForDelay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function backendErrorMessage(error) {
  const detail = String(error?.message || "");
  if (detail.includes("LOCAL_API_BASE")) return BACKEND_CONFIG_MESSAGE;
  if (navigator.onLine === false) return "设备当前没有网络连接，请联网后重试。";
  return BACKEND_NETWORK_MESSAGE;
}

function applyBackendStatus(data) {
  backendAvailable = true;
  backendFailureMessage = "";
  aiAvailable = data.ai_ready !== false;
  $("modelLabel").textContent = data.model || "qwen3:8b";
  $("statusDot").classList.toggle("online", aiAvailable);
}

async function requestBackendStatus() {
  let lastError = new Error(BACKEND_NETWORK_MESSAGE);
  for (const delay of STATUS_RETRY_DELAYS_MS) {
    if (delay) await waitForDelay(delay);
    try {
      const response = await fetchWithTimeout("/api/status", { cache: "no-store" }, STATUS_TIMEOUT_MS);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) return data;
      const error = new Error(data.error || `服务器返回 ${response.status}`);
      if (error.message.includes("LOCAL_API_BASE")) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (String(error?.message || "").includes("LOCAL_API_BASE")) break;
    }
  }
  throw lastError;
}

function checkBackendStatus() {
  if (!backendStatusPromise) {
    backendStatusPromise = requestBackendStatus().finally(() => {
      backendStatusPromise = null;
    });
  }
  return backendStatusPromise;
}

async function ensureBackendConnection() {
  if (backendAvailable) return true;
  try {
    applyBackendStatus(await checkBackendStatus());
    return true;
  } catch (error) {
    backendAvailable = false;
    aiAvailable = false;
    backendFailureMessage = backendErrorMessage(error);
    $("modelLabel").textContent = "本地复习";
    $("statusDot").classList.remove("online");
    return false;
  }
}

async function api(path, body = {}, options = {}) {
  let response;
  try {
    response = await fetchWithTimeout(
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
  } catch (error) {
    if (error.name === "AbortError") throw error;
    backendAvailable = false;
    backendFailureMessage = backendErrorMessage(error);
    throw new Error(backendFailureMessage);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      showAuth("登录已失效，请重新登录");
      throw new Error("登录已失效，请重新登录");
    }
    const error = new Error(data.error || "请求失败");
    error.code = data.code || "request_failed";
    if (error.code === "membership_required") openMembershipModal();
    throw error;
  }
  return data;
}

async function publicApi(path, body = {}, options = {}) {
  let response;
  try {
    response = await fetchWithTimeout(
      path,
      {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        controller: options.controller,
      },
      options.timeoutMs || API_TIMEOUT_MS,
    );
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(backendErrorMessage(error));
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "请求失败");
    error.code = data.code || "request_failed";
    throw error;
  }
  return data;
}

function setView(id) {
  if (id === "quizView" && !state.roundActive) id = "setupView";
  const leavingQuiz = id !== "quizView" && $("quizView")?.classList.contains("active");
  if (leavingQuiz) {
    if (judgeController) judgeController.abort();
    clearNextTimer();
    hideResultPanel();
    setNextNowEnabled(false);
  }
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".tabs button").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === id));
  if (id === "wrongView") renderWrongBook();
  if (id === "achievementsView") renderAchievements();
  if (id === "studyView") renderStudyDashboard();
  if (currentProject && state.roundActive) saveProjectRuntime();
}

function updateStats() {
  const analysis = analyzeWordList(parseWords(), state.quizLanguage);
  const eligibleWords = analysis.valid;
  $("statWords").textContent = eligibleWords.length || state.words.length;
  $("statWrong").textContent = Object.keys(activeWrongBook("current")).length;
  $("statScore").textContent = state.score;
  if ($("scoreLabel") && state.roundActive) $("scoreLabel").textContent = `得分 ${state.score}`;
  const limit = accountWordLimit(state.quizLanguage);
  const exceeded = Number.isFinite(limit) && eligibleWords.length > limit;
  $("wordInput")?.classList.toggle("limit-exceeded", exceeded);
  if ($("wordLimitHint")) {
    $("wordLimitHint").textContent = Number.isFinite(limit)
      ? `当前账户每次最多测试 ${limit} 个单词${exceeded ? "，请开通会员后继续" : ""}`
      : "当前语言不限单次测试数量";
  }
  if ($("wordQualityHint")) {
    const ignored = [];
    if (analysis.duplicates) ignored.push(`${analysis.duplicates} 个重复词`);
    if (analysis.invalid.length) ignored.push(`${analysis.invalid.length} 个其他语言或无效词`);
    $("wordQualityHint").textContent = storageWriteFailed
      ? "浏览器存储空间不足，本次更改可能无法在刷新后保留"
      : ignored.length
        ? `可测试 ${eligibleWords.length} 个，开始时将忽略${ignored.join("、")}`
        : eligibleWords.length ? `已识别 ${eligibleWords.length} 个可测试词` : "";
    $("wordQualityHint").classList.toggle("has-warning", storageWriteFailed || ignored.length > 0);
  }
  const quizTab = document.querySelector('[data-view="quizView"]');
  if (quizTab) {
    quizTab.disabled = !state.roundActive;
    quizTab.title = state.roundActive ? "继续当前测试" : "尚未开始测试";
  }
  updateSetupActionState();
  const promptKey = `${state.quizLanguage}:${eligibleWords.length}`;
  if (exceeded && promptKey !== lastLimitPromptKey && !$("entryScreen")) {
    lastLimitPromptKey = promptKey;
    openMembershipModal();
  }
}

function setBusy(busy) {
  state.busy = busy;
  ["reviewBtn", "reviewHistoryBtn"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = busy;
  });
  updateQuestionControls();
  updateSetupActionState();
}

function updateQuestionControls() {
  const disabled = state.busy || state.answerLocked || !state.roundActive;
  ["submitBtn", "skipBtn", "speakBtn", "answerInput"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = disabled;
  });
}

function setAnswerLocked(locked) {
  state.answerLocked = Boolean(locked);
  updateQuestionControls();
}

function updateSetupActionState() {
  const wordCount = analyzeWordList(parseWords(), state.quizLanguage).valid.length;
  if ($("startBtn")) $("startBtn").disabled = state.busy || wordCount === 0;
  if ($("shuffleBtn")) $("shuffleBtn").disabled = state.busy || wordCount < 2;
  if ($("clearBtn")) $("clearBtn").disabled = state.busy || wordCount === 0;
  if ($("exportWordsBtn")) $("exportWordsBtn").disabled = state.busy || wordCount === 0;
  if ($("importWordsBtn")) $("importWordsBtn").disabled = state.busy;
  if ($("wordInput")) $("wordInput").disabled = state.busy;
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

function hasJapaneseKanji(value) {
  return /[\u3400-\u9fff々〆ヶ]/u.test(String(value || ""));
}

function normalizeKana(value) {
  return [...normalizeJapaneseReading(value)].map((character) => {
    const code = character.charCodeAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : character;
  }).join("");
}

function rememberJapaneseVocabularyData(readings, writtenForms = {}, persist = true) {
  const cleanReadings = sanitizeJapaneseReadings(readings);
  const cleanWrittenForms = sanitizeJapaneseWrittenForms(writtenForms);
  if (Object.keys(cleanReadings).length) {
    state.japaneseReadings = sanitizeJapaneseReadings({ ...state.japaneseReadings, ...cleanReadings });
  }
  if (Object.keys(cleanWrittenForms).length) {
    state.japaneseWrittenForms = sanitizeJapaneseWrittenForms({
      ...state.japaneseWrittenForms,
      ...cleanWrittenForms,
    });
  }
  if (persist) {
    safeStorageSet(localStorage, JAPANESE_READING_CACHE_KEY, JSON.stringify(state.japaneseReadings));
    safeStorageSet(localStorage, JAPANESE_WRITTEN_FORM_CACHE_KEY, JSON.stringify(state.japaneseWrittenForms));
  }
}

function rememberJapaneseReadings(readings, persist = true) {
  rememberJapaneseVocabularyData(readings, {}, persist);
}

function japaneseReadingFor(word) {
  const cleanWord = String(word || "").trim();
  if (state.japaneseReadings[cleanWord]) return state.japaneseReadings[cleanWord];
  return isJapaneseReading(cleanWord) ? normalizeJapaneseReading(cleanWord) : "";
}

function japaneseWrittenFormFor(word) {
  const cleanWord = String(word || "").trim();
  return state.japaneseWrittenForms[cleanWord] || cleanWord;
}

function japaneseDictationRequiresBoth(word) {
  const written = japaneseWrittenFormFor(word);
  const reading = japaneseReadingFor(word);
  return Boolean(hasJapaneseKanji(written) && reading && normalizeKana(written) !== normalizeKana(reading));
}

function formatJapaneseDictationAnswer(word) {
  const written = japaneseWrittenFormFor(word);
  const reading = japaneseReadingFor(word);
  return japaneseDictationRequiresBoth(word) ? `${written} / ${reading}` : (written || reading || word);
}

function dictationEvaluation(word, answer) {
  const expectedWord = normalizeDictationAnswer(word);
  const student = normalizeDictationAnswer(answer);
  if (state.quizLanguage !== "japanese") {
    return {
      correct: expectedWord === student,
      expected: word,
      guidance: "",
    };
  }

  const written = japaneseWrittenFormFor(word);
  const reading = japaneseReadingFor(word);
  if (!reading || !written) {
    return {
      correct: false,
      expected: word,
      guidance: "未能取得该词的完整写法，请返回词表后重试",
    };
  }

  const compact = student.replace(/[\/、，,；;：:|｜=＝·・]/g, "");
  const normalizedCompact = normalizeKana(compact);
  const normalizedWritten = normalizeKana(normalizeDictationAnswer(written));
  const normalizedReading = normalizeKana(reading);
  const requiresBoth = japaneseDictationRequiresBoth(word);
  const correct = requiresBoth
    ? normalizedCompact === `${normalizedWritten}${normalizedReading}`
      || normalizedCompact === `${normalizedReading}${normalizedWritten}`
    : [expectedWord, normalizedWritten, normalizedReading]
      .map((item) => normalizeKana(item))
      .includes(normalizedCompact);
  const guidance = correct
    ? ""
    : requiresBoth
      ? `请同时填写汉字“${written}”和假名“${reading}”`
      : `正确写法是“${written || reading || word}”`;

  return {
    correct,
    expected: formatJapaneseDictationAnswer(word),
    guidance,
  };
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
      if (form.length > 1 && "的地得".includes(form[form.length - 1])) additions.push(form.slice(0, -1));
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

function cacheRubric(word, rubric) {
  if (!rubric || typeof rubric !== "object") return;
  state.rubricCache[rubricCacheKey(word)] = rubric;
  if (rubric.reading) rememberJapaneseReadings({ [word]: rubric.reading });
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

function parseWordText(value, captureReadings = true) {
  const words = [];
  const readings = {};
  const writtenForms = {};
  String(value || "").split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const pair = state.quizLanguage === "japanese"
      ? line.match(/^(.+?)\s*[|｜=＝]\s*([^|｜=＝]+)$/u)
      : null;
    if (pair) {
      const word = pair[1].trim();
      const reading = normalizeJapaneseReading(pair[2]);
      if (wordMatchesLanguage(word, "japanese") && isJapaneseReading(reading)) {
        words.push(word);
        readings[word] = reading;
        writtenForms[word] = word;
        return;
      }
    }
    line.split(/[\s,，、;；]+/).map((word) => word.trim()).filter(Boolean).forEach((word) => words.push(word));
  });
  if (captureReadings) rememberJapaneseVocabularyData(readings, writtenForms);
  return words;
}

function parseWords() {
  return parseWordText($("wordInput").value);
}

function wordIdentity(word, language = state.quizLanguage) {
  const normalized = String(word || "").normalize("NFKC").trim();
  return language === "english" ? normalized.toLocaleLowerCase("en") : normalized;
}

function analyzeWordList(words, language = state.quizLanguage) {
  const valid = [];
  const invalid = [];
  const seen = new Set();
  let duplicates = 0;
  (Array.isArray(words) ? words : []).forEach((item) => {
    const word = limitText(item, 240);
    if (!word) return;
    if (language && !wordMatchesLanguage(word, language)) {
      invalid.push(word);
      return;
    }
    const key = wordIdentity(word, language);
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.add(key);
    valid.push(word);
  });
  return { valid, invalid, duplicates };
}

function formatWordInputEntry(word) {
  return word;
}

function formatWordsForInput(words) {
  return words.map(formatWordInputEntry).join("\n");
}

async function generateAiVocabulary() {
  const language = ensureQuizLanguage();
  if (!language) return;
  const message = $("aiSuggestMessage");
  const button = $("aiSuggestBtn");
  if (button.disabled) return;
  if (!state.session || !state.account) {
    showAuth("请先登录后使用 AI 联网选词");
    return;
  }
  if (!backendAvailable) {
    message.textContent = "正在重新连接服务器…";
    if (!(await ensureBackendConnection())) {
      message.textContent = backendFailureMessage;
      message.classList.add("error");
      return;
    }
  }
  if (!aiAvailable) {
    message.textContent = "本地 AI 尚未启动，请运行桌面启动程序";
    message.classList.add("error");
    return;
  }
  const level = $("aiLevelSelect").value;
  const count = Number($("aiSuggestCount").value);
  const mode = $("aiSuggestMode").value;
  const maxCount = Number($("aiSuggestCount").max || 200);
  const baseWords = mode === "append" ? analyzeWordList(parseWords(), language).valid : [];
  const existingLanguageWords = baseWords;
  if (!Number.isInteger(count) || count < 1 || count > maxCount) {
    message.textContent = `请输入 1 至 ${maxCount} 之间的整数`;
    message.classList.add("error");
    return;
  }
  const accountLimit = accountWordLimit(language);
  const remaining = Number.isFinite(accountLimit) ? Math.max(0, accountLimit - new Set(existingLanguageWords).size) : Infinity;
  if (mode === "append" && count > remaining) {
    message.textContent = remaining > 0
      ? `当前词表还能追加 ${remaining} 个词，请减少数量`
      : "当前词表已达到本次测试上限，请改用替换词表或开通会员";
    message.classList.add("error");
    return;
  }

  button.disabled = true;
  button.textContent = "搜索中…";
  message.classList.remove("error");
  message.textContent = "正在联网搜索并由本地 AI 整理词汇…";
  saveAiSuggestionSettings();
  try {
    const data = await api(
      "/api/vocabulary/suggest",
      { language, level, count, exclude: existingLanguageWords },
      { timeoutMs: 240000 },
    );
    rememberJapaneseVocabularyData(data.readings || {}, data.written_forms || {});
    const generated = filterWordsByLanguage(data.words || [], language);
    if (!generated.length) throw new Error("没有生成可用词汇，请重试");
    const existingKeys = new Set(baseWords.map((word) => wordIdentity(word, language)));
    const added = generated.filter((word) => {
      const key = wordIdentity(word, language);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
    if (!added.length) throw new Error("这次找到的词都已在词表中，请重试或改用替换词表");
    const words = mode === "append" ? [...baseWords, ...added] : added;
    $("wordInput").value = formatWordsForInput(words);
    saveCurrentWordDraft();
    updateStats();
    const sourceText = data.online ? "联网资料与本地 AI" : "本地 AI（联网资料暂不可用）";
    message.textContent = `${sourceText} 已${mode === "append" ? "追加" : "生成"} ${added.length} 个${data.level_label || ""}词汇`;
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("error");
  } finally {
    button.disabled = false;
    button.textContent = "生成词表";
  }
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function ensureJapaneseDictationReadings(words) {
  if (state.quizLanguage !== "japanese" || state.practiceMode !== "dictation") return true;
  const required = words.filter((word) => wordMatchesLanguage(word, "japanese"));
  const missing = required.filter((word) => {
    const hasReading = Boolean(japaneseReadingFor(word));
    const hasWrittenResolution = hasJapaneseKanji(word)
      || Object.prototype.hasOwnProperty.call(state.japaneseWrittenForms, word);
    return !hasReading || !hasWrittenResolution;
  });
  if (!missing.length) return true;
  if (!backendAvailable || !state.session || !aiAvailable) {
    alert("这些日语词还缺少完整的汉字或假名写法，请启动本地 AI 后重试。");
    return false;
  }

  try {
    const data = await api(
      "/api/japanese/readings",
      { words: missing, quiz_session: state.quizSession },
      { timeoutMs: 180000 },
    );
    rememberJapaneseVocabularyData(data.readings || {}, data.written_forms || {});
  } catch (error) {
    alert(`获取日语完整写法失败：${error.message}`);
    return false;
  }

  const unresolved = required.filter((word) => {
    const hasReading = Boolean(japaneseReadingFor(word));
    const hasWrittenResolution = hasJapaneseKanji(word)
      || Object.prototype.hasOwnProperty.call(state.japaneseWrittenForms, word);
    return !hasReading || !hasWrittenResolution;
  });
  if (unresolved.length) {
    const preview = unresolved.slice(0, 5).join("、");
    alert(`AI 暂时未找到这些词的完整写法：${preview}${unresolved.length > 5 ? "等" : ""}。请稍后重试。`);
    return false;
  }
  return true;
}

async function startQuiz(words, mode = "normal", options = {}) {
  const language = ensureQuizLanguage();
  if (!language) return;

  if (state.roundActive && !options.replaceActive) {
    askConfirmation("当前测试尚未完成，确认放弃当前进度并开始新一轮？", () => (
      startQuiz(words, mode, { replaceActive: true })
    ));
    return;
  }

  if (mode === "normal" && (!backendAvailable || !state.session)) {
    if (backendAvailable) {
      showAuth("开始测试前请登录账户；错题复习仍可离线进行。未登录时不能绕过测试数量限制。");
    } else {
      alert("当前离线：可以复习已有错题；开始新测试需要连接本地后端并登录账户。");
    }
    return;
  }

  if (mode === "normal" && state.practiceMode === "meaning" && !aiAvailable) {
    if (backendAvailable) {
      alert("本地后端在线，但 Ollama 尚未启动。请重新运行桌面启动程序；错题复习仍可本地进行。");
    } else {
      alert("当前离线：可以进行听写或错题复习；首次释义判卷需要本地 AI 在线。");
    }
    return;
  }

  const analysis = analyzeWordList(words, language);
  const quizWords = analysis.valid;
  const excludedCount = analysis.invalid.length;
  if (!quizWords.length) {
    alert(`当前选择的是${quizLanguageLabel(language)}，词表里没有可测试的${quizLanguageLabel(language)}词。`);
    return;
  }
  if (excludedCount > 0 || analysis.duplicates > 0) {
    const ignored = [];
    if (excludedCount) ignored.push(`${excludedCount} 个其他语言或无效词`);
    if (analysis.duplicates) ignored.push(`${analysis.duplicates} 个重复词`);
    alert(`已按${quizLanguageLabel(language)}模式忽略${ignored.join("、")}。`);
  }

  state.quizSession = "";
  if (backendAvailable && state.session) {
    setBusy(true);
    try {
      const authorization = await api("/api/quiz/start", { language, words: quizWords });
      state.quizSession = authorization.quiz_session;
      applyAccount(authorization.account);
      if (mode === "normal" && !(await ensureJapaneseDictationReadings(quizWords))) return;
    } catch (error) {
      if (error.code !== "membership_required") alert(error.message);
      return;
    } finally {
      setBusy(false);
    }
  } else if (mode === "normal") {
    return;
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
  state.roundSkipped = 0;
  state.lastRound = null;
  state.mode = mode;
  state.roundActive = true;
  state.answerLocked = false;
  state.roundStartedAt = Date.now();
  updateStats();
  setView("quizView");
  showWord();
  saveProjectRuntime();
}

function showWord() {
  if (!state.roundActive) return;
  const word = state.words[state.index] || "-";
  const dictation = isDictationMode();
  $("wordLabel").textContent = dictation ? "听写" : word;
  $("wordLabel").classList.toggle("dictation-display", dictation);
  $("progressLabel").textContent = `${state.index + 1}/${state.words.length}`;
  $("scoreLabel").textContent = `得分 ${state.score}`;
  $("quizLanguageLabel").textContent = quizLanguageLabel(state.quizLanguage);
  $("practiceModeLabel").textContent = state.mode.startsWith("review-") ? "错题复习" : practiceModeLabel(state.practiceMode);
  $("answerInput").value = "";
  $("answerInput").placeholder = dictation
    ? state.quizLanguage === "japanese"
      ? japaneseDictationRequiresBoth(word)
        ? "输入汉字和假名，例如 学校 / がっこう"
        : "输入听到的假名"
      : "输入听到的单词"
    : "中文意思";
  clearAnswerValidation();
  setAnswerLocked(false);
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
  delete book[word];
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
  scheduleResultHide(SKIP_RESULT_VISIBLE_MS);
}

function clearAnswerValidation() {
  const input = $("answerInput");
  const message = $("answerValidation");
  if (input) {
    input.classList.remove("input-invalid");
    input.removeAttribute("aria-invalid");
  }
  if (message) {
    message.textContent = "";
    message.classList.add("hidden");
  }
}

function showAnswerValidation() {
  const dictation = isDictationMode();
  const currentWord = state.words[state.index];
  const text = !dictation
    ? "请输入中文意思"
    : state.quizLanguage === "japanese"
      ? japaneseDictationRequiresBoth(currentWord)
        ? "请输入汉字和假名，答案仍停留在本题"
        : "请输入听到的假名，答案仍停留在本题"
      : "请输入听到的英语单词";
  const input = $("answerInput");
  const message = $("answerValidation");
  clearNextTimer();
  if (input) {
    input.classList.add("input-invalid");
    input.setAttribute("aria-invalid", "true");
    input.focus();
  }
  if (message) {
    message.textContent = text;
    message.classList.remove("hidden");
  }
}

function nextWord() {
  if (!state.roundActive) return;
  clearNextTimer();
  setAnswerLocked(false);
  setNextNowEnabled(false);
  if (state.index < state.words.length - 1) {
    state.index += 1;
    showWord();
    saveProjectRuntime();
  } else {
    const summary = finishRound();
    const hasWrong = Object.keys(activeWrongBook("current")).length > 0;
    setView(hasWrong ? "wrongView" : "setupView");
    showRoundSummary(summary);
  }
}

function finishRound() {
  if (!state.words.length) return null;
  const total = state.words.length;
  const skipped = Math.min(state.roundSkipped, total);
  const wrong = Math.max(0, total - state.score - skipped);
  const durationSec = state.roundStartedAt
    ? Math.max(1, Math.round((Date.now() - state.roundStartedAt) / 1000))
    : 0;
  const summary = {
    total,
    correct: state.score,
    wrong,
    skipped,
    accuracy: Math.round((state.score / total) * 100),
    words: [...state.words],
    mode: state.mode,
    language: state.quizLanguage,
    practiceMode: state.practiceMode,
    durationSec,
  };
  state.lastRound = summary;
  state.roundActive = false;
  state.answerLocked = false;
  if (state.score === state.words.length) unlockAchievement("perfectRound");
  if (state.words.length >= 20) unlockAchievement("longRound");
  if (state.mode === "normal") {
    unlockAchievement("firstQuiz");
    if (state.practiceMode === "dictation") unlockAchievement("firstDictation");
  }
  recordStudyRound(summary);
  state.roundStartedAt = 0;
  state.quizSession = "";
  removeProjectRuntime();
  updateQuestionControls();
  return summary;
}

function showRoundSummary(summary) {
  if (!summary) return;
  $("roundSummaryTitle").textContent = summary.correct === summary.total ? "本轮满分" : "本轮完成";
  $("roundSummaryMessage").textContent = `${quizLanguageLabel(summary.language)} · ${summary.mode.startsWith("review-") ? "错题复习" : practiceModeLabel(summary.practiceMode)}`;
  $("roundTotalCount").textContent = summary.total;
  $("roundCorrectCount").textContent = summary.correct;
  $("roundWrongCount").textContent = summary.wrong;
  $("roundSkippedCount").textContent = summary.skipped;
  $("roundDuration").textContent = formatDuration(summary.durationSec);
  $("roundAccuracy").textContent = `正确率 ${summary.accuracy}%`;
  $("roundWrongBtn").disabled = summary.wrong + summary.skipped === 0;
  openModal("roundSummaryModal");
}

async function retryLastRound() {
  const summary = state.lastRound;
  if (!summary?.words?.length) return;
  closeModal("roundSummaryModal", true);
  await startQuiz(summary.words, summary.mode);
}

function skipWord() {
  if (state.busy || state.answerLocked || !state.roundActive) return;

  const word = state.words[state.index];
  if (!word) return;
  state.roundSkipped += 1;
  const rubric = cachedRubric(word);
  markWrong(word, SKIPPED_ANSWER, rubric && rubric.gloss ? rubric.gloss : "跳过：未作答", rubric && rubric.accepted ? rubric.accepted : []);
  setAnswerLocked(true);
  renderSkipResult();
  updateStats();
  saveProjectRuntime();
  scheduleNext(SKIP_RESULT_VISIBLE_MS);
}

async function submitAnswer(event) {
  event.preventDefault();
  if (state.busy || state.answerLocked || !state.roundActive) return;
  const word = state.words[state.index];
  const answer = $("answerInput").value.trim();
  if (!word) return;
  if (!answer) {
    showAnswerValidation();
    return;
  }
  clearAnswerValidation();

  if (isDictationMode()) {
    clearNextTimer();
    hideResultPanel();
    setNextNowEnabled(false);
    const evaluation = dictationEvaluation(word, answer);
    if (evaluation.correct) {
      state.score += 1;
      removeReviewedWord(word);
      unlockAchievement("firstCorrect");
    } else {
      markWrong(word, answer, evaluation.expected, [evaluation.expected]);
    }
    saveState();
    setAnswerLocked(true);
    renderResult({
      correct: evaluation.correct,
      gloss: evaluation.expected,
      accepted: evaluation.guidance ? [evaluation.guidance] : [],
      kind: "dictation",
    });
    updateStats();
    saveProjectRuntime();
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
        const data = await api("/api/rubric", { word, quiz_session: state.quizSession });
        const rubric = data.rubric || {};
        info.correct_answer = limitText(rubric.gloss) || info.correct_answer;
        info.accepted = sanitizeAccepted(rubric.accepted);
        cacheRubric(word, rubric);
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
        markWrong(word, answer, result.gloss, result.accepted);
      }
      saveState();
      setAnswerLocked(true);
      renderResult(result);
      updateStats();
      saveProjectRuntime();
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
      quiz_session: state.quizSession,
      rubric: cachedRubric(word),
      mode: state.gradingMode,
      language: state.quizLanguage,
    }, { controller: judgeController, timeoutMs: API_TIMEOUT_MS });
    if (result.rubric) cacheRubric(word, result.rubric);

    if (result.correct) {
      state.score += 1;
      removeReviewedWord(word);
      unlockAchievement("firstCorrect");
    } else {
      markWrong(word, answer, result.gloss, result.accepted);
    }

    saveState();
    setAnswerLocked(true);
    renderResult(result);
    updateStats();
    saveProjectRuntime();
    scheduleNext(resultVisibleMs(result));
  } catch (error) {
    if (error.name === "AbortError") {
      hideResultPanel();
    } else {
      $("resultPanel").classList.remove("grading", "ai-review");
      $("resultTitle").className = "result-title bad";
      $("resultTitle").textContent = "判卷失败";
      $("resultGloss").textContent = error.message;
      scheduleResultHide();
    }
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
  const currentCount = Object.keys(activeWrongBook("current")).length;
  const historyCount = Object.keys(activeWrongBook("history")).length;
  [["reviewBtn", currentCount], ["exportBtn", currentCount], ["clearWrongBtn", currentCount], ["reviewHistoryBtn", historyCount], ["exportHistoryBtn", historyCount], ["clearHistoryBtn", historyCount]].forEach(([id, count]) => {
    const button = $(id);
    if (!button) return;
    button.disabled = count === 0;
    button.title = count === 0 ? "暂无可操作的错题" : "";
  });
  const scope = state.wrongScope;
  const book = activeWrongBook(scope);
  const query = normalizeMeaning($("wrongSearchInput")?.value || "");
  const allEntries = Object.entries(book).sort((a, b) => (b[1].wrong_count || 0) - (a[1].wrong_count || 0));
  const entries = query ? allEntries.filter(([word, info]) => (
    [word, info.last_answer, info.correct_answer, ...(info.accepted || [])]
      .some((value) => normalizeMeaning(value).includes(query))
  )) : allEntries;
  $("wrongScopeLabel").textContent = `${state.profile} · ${scope === "history" ? "历史错题" : "本轮错题"} · ${allEntries.length} 个${query ? ` · 显示 ${entries.length} 个` : ""}`;

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "error";
    empty.textContent = query ? "没有匹配的错题" : scope === "history" ? "历史错题为空" : "本轮还没有错题";
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
    node.querySelector("button").addEventListener("click", () => {
      askConfirmation(`确认从${scope === "history" ? "历史" : "本轮"}错题中移除“${word}”？`, () => {
        const target = scope === "history" ? state.historyWrongBook : state.currentWrongBook;
        delete target[word];
        saveState();
        renderWrongBook();
      });
    });
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
    $("wrongScopeLabel").textContent = scope === "history"
      ? "历史错题为空，暂无可导出的 PDF"
      : "本轮错题为空，暂无可导出的 PDF";
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
        showAuth("登录已失效，请重新登录");
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
  const words = analyzeWordList(parseWords(), state.quizLanguage).valid;
  if (!words.length) return;
  downloadText(`vocab-words-${Date.now()}.txt`, formatWordsForInput(words));
}

function confirmClearWords() {
  const count = parseWords().length;
  if (!count) return;
  askConfirmation(`确认清空当前词表中的 ${count} 个词？`, () => {
    $("wordInput").value = "";
    saveCurrentWordDraft();
    updateStats();
  });
}

function confirmClearWrongBook(scope) {
  const history = scope === "history";
  const count = Object.keys(activeWrongBook(history ? "history" : "current")).length;
  if (!count) return;
  askConfirmation(`确认清空${history ? "历史" : "本轮"}错题中的 ${count} 个词？此操作不可撤销。`, () => {
    if (history) state.historyWrongBook = removeLanguageFromWrongBook(state.historyWrongBook);
    else state.currentWrongBook = removeLanguageFromWrongBook(state.currentWrongBook);
    saveState();
    renderWrongBook();
  });
}

function parseImportedWords(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    const data = JSON.parse(trimmed);
    if (Array.isArray(data)) return parseWordText(data.map(String).join("\n"));
    if (Array.isArray(data.words)) {
      rememberJapaneseVocabularyData(data.readings || {}, data.written_forms || {});
      return parseWordText(data.words.map(String).join("\n"));
    }
  } catch (_) {
    // Fall through to plain text parsing.
  }

  return parseWordText(trimmed);
}

async function importWords(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    if (file.size > MAX_WORD_IMPORT_BYTES) throw new Error("词表文件不能超过 1 MB");
    const text = await file.text();
    if (text.length > MAX_WORD_INPUT_CHARS) throw new Error("词表内容过长，请分成多个文件导入");
    const analysis = analyzeWordList(parseImportedWords(text), state.quizLanguage);
    if (analysis.valid.length) {
      $("wordInput").value = formatWordsForInput(analysis.valid);
      saveCurrentWordDraft();
      updateStats();
      if (analysis.invalid.length || analysis.duplicates) {
        alert(`词表已导入，并忽略 ${analysis.invalid.length} 个无效词、${analysis.duplicates} 个重复词。`);
      }
    } else {
      throw new Error(`没有识别到可用于${quizLanguageLabel(state.quizLanguage)}测试的词`);
    }
  } catch (error) {
    alert(`词表导入失败：${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function discardActiveRound() {
  if (!state.roundActive) return;
  if (judgeController) judgeController.abort();
  clearNextTimer();
  hideResultPanel();
  setNextNowEnabled(false);
  removeProjectRuntime();
  state.words = [];
  state.index = 0;
  state.score = 0;
  state.roundSkipped = 0;
  state.quizSession = "";
  state.lastRound = null;
  state.mode = "normal";
  state.roundActive = false;
  state.answerLocked = false;
  state.roundStartedAt = 0;
  updateQuestionControls();
  setView("setupView");
}

function changeProfile(value, options = {}) {
  const nextProfile = sanitizeProfile(value);
  if (state.roundActive && nextProfile !== state.profile && !options.abandonActive) {
    $("profileInput").value = state.profile;
    askConfirmation(`切换到“${nextProfile}”会放弃当前未完成的测试，确认继续？`, () => {
      changeProfile(nextProfile, { abandonActive: true });
    });
    return;
  }
  saveCurrentWordDraft();
  saveWrongBooks();
  saveAchievements();
  saveStudyRecords();
  if (options.abandonActive) discardActiveRound();
  state.profile = nextProfile;
  $("profileInput").value = state.profile;
  loadWrongBooks();
  loadAchievements();
  loadStudyRecords();
  loadCurrentWordDraft();
  saveState();
  updateStats();
  if ($("wrongView").classList.contains("active")) renderWrongBook();
  if ($("achievementsView").classList.contains("active")) renderAchievements();
  if ($("studyView").classList.contains("active")) renderStudyDashboard();
}

async function login(event) {
  event.preventDefault();
  $("loginError").textContent = "";
  const button = $("loginSubmitBtn");
  if (button.disabled) return;
  button.disabled = true;
  try {
    if (!backendAvailable) {
      $("loginError").textContent = "正在重新连接服务器…";
      if (!(await ensureBackendConnection())) throw new Error(backendFailureMessage);
    }
    const data = await api("/api/login", {
      username: $("usernameInput").value.trim(),
      secret: $("secretInput").value,
    });
    state.session = data.session;
    safeStorageSet(localStorage, "wyjAccountSession", state.session);
    applyAccount(data.account);
    $("secretInput").value = "";
    clearSavedWordDrafts(data.account);
    pendingScreen = "workspace";
    pendingAuthMessage = "";
    $("modelLabel").textContent = data.model || "qwen3:8b";
    showModulePicker(false);
    pushRoute("/select", true);
    updateStats();
  } catch (error) {
    $("loginError").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function performBackendRefresh() {
  try {
    const data = await checkBackendStatus();
    applyBackendStatus(data);

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
        pendingAuthMessage = "登录已失效，请重新登录";
      } else {
        applyAccount(health.account);
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
  } catch (error) {
    backendAvailable = false;
    aiAvailable = false;
    backendFailureMessage = backendErrorMessage(error);
    pendingScreen = state.session && state.account ? "workspace" : "auth";
    pendingAuthMessage = state.session && state.account ? "" : backendFailureMessage;
    $("modelLabel").textContent = "本地复习";
    $("statusDot").classList.remove("online");
  }
  applyPendingScreen();
}

function refreshBackendState() {
  if (!backendRefreshPromise) {
    backendRefreshPromise = performBackendRefresh().finally(() => {
      backendRefreshPromise = null;
    });
  }
  return backendRefreshPromise;
}

async function boot() {
  if (state.account?.id) loadAccountLocalState();
  else resetLocalViewState();
  state.quizLanguage = "";

  $("profileInput").value = state.profile;
  $("gradingModeSelect").value = ["strict", "normal", "lenient"].includes(state.gradingMode) ? state.gradingMode : "normal";
  state.gradingMode = $("gradingModeSelect").value;
  state.practiceMode = normalizePracticeMode(state.practiceMode);
  $("practiceModeSelect").value = state.practiceMode;
  updateLanguageUi();
  updatePracticeUi();
  renderAccountUi();

  $("loginForm").addEventListener("submit", login);
  $("registerForm").addEventListener("submit", registerAccount);
  $("showLoginBtn").addEventListener("click", () => showAuthMode("login", true));
  $("showRegisterBtn").addEventListener("click", () => showAuthMode("register", true));
  $("membershipBtn").addEventListener("click", async () => { pushRoute("/recharge"); await openMembershipModal(); });
  $("accountBtn").addEventListener("click", () => { pushRoute("/account"); openModal("accountModal"); });
  $("homeBtn").addEventListener("click", () => showModulePicker(true));
  $("adminBtn").addEventListener("click", () => showAdminPanel(true));
  $("logoutBtn").addEventListener("click", logoutAccount);
  $("submitRechargeBtn").addEventListener("click", submitRechargeRequest);
  $("confirmPaymentBtn").addEventListener("click", confirmRechargePayment);
  $("retryMembershipPlansBtn").addEventListener("click", reloadMembershipPlans);
  $("copyWechatBtn").addEventListener("click", () => copyTextWithFeedback("W2009Y94J", $("copyWechatBtn")));
  $("copyOrderBtn").addEventListener("click", () => copyTextWithFeedback(currentPaymentOrder?.order_number || "", $("copyOrderBtn")));
  $("copyPaymentNoteBtn").addEventListener("click", () => copyTextWithFeedback(currentPaymentOrder?.payment_note || "", $("copyPaymentNoteBtn")));
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => closeModal(button.dataset.closeModal)));
  document.querySelectorAll(".modal-layer").forEach((modal) => modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal.id);
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const openModals = [...document.querySelectorAll(".modal-layer:not(.hidden)")];
    const modal = openModals[openModals.length - 1];
    if (!modal) return;
    if (modal.id === "confirmModal") confirmAction = null;
    closeModal(modal.id);
  });
  $("changeSecretForm").addEventListener("submit", changeOwnSecret);
  $("openDeleteAccountBtn").addEventListener("click", () => openModal("deleteAccountModal"));
  $("deleteAccountForm").addEventListener("submit", deleteOwnAccount);
  $("refreshAdminBtn").addEventListener("click", loadAdminData);
  $("leaveAdminBtn").addEventListener("click", leaveAdminPanel);
  $("adminUserSearch").addEventListener("input", () => renderAdminUsers());
  document.querySelectorAll("[data-admin-view]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-admin-view]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".admin-view").forEach((view) => view.classList.toggle("active", view.id === button.dataset.adminView));
  }));
  $("saveAdminMembershipBtn").addEventListener("click", saveAdminMembership);
  $("adminMembershipSelect").addEventListener("change", () => updateAdminMembershipFields(true));
  $("adminMembershipAction").addEventListener("change", () => updateAdminMembershipFields(true));
  $("adminDisableToolsBtn").addEventListener("click", () => updateAdminToolsOverride(false));
  $("adminEnableToolsBtn").addEventListener("click", () => updateAdminToolsOverride(null));
  $("saveAdminSecretBtn").addEventListener("click", saveAdminSecret);
  $("adminToggleBanBtn").addEventListener("click", () => adminUserAction("ban"));
  $("adminForceLogoutBtn").addEventListener("click", () => adminUserAction("logout"));
  $("adminDeleteUserBtn").addEventListener("click", () => adminUserAction("delete"));
  $("cancelConfirmBtn").addEventListener("click", () => { confirmAction = null; closeModal("confirmModal"); });
  $("acceptConfirmBtn").addEventListener("click", runConfirmedAction);
  $("roundRetryBtn").addEventListener("click", retryLastRound);
  $("roundWrongBtn").addEventListener("click", () => {
    closeModal("roundSummaryModal", true);
    setView("wrongView");
  });
  $("roundSetupBtn").addEventListener("click", () => {
    closeModal("roundSummaryModal", true);
    setView("setupView");
  });
  window.addEventListener("popstate", () => routeCurrent());
  $("offlineReviewBtn").addEventListener("click", () => {
    pendingScreen = "workspace";
    showWorkspace();
    setView("wrongView");
  });
  $("answerForm").addEventListener("submit", submitAnswer);
  $("answerInput").addEventListener("input", clearAnswerValidation);
  $("startBtn").addEventListener("click", () => startQuiz(parseWords()));
  $("aiSuggestBtn").addEventListener("click", generateAiVocabulary);
  ["aiLevelSelect", "aiSuggestCount", "aiSuggestMode"].forEach((id) => {
    $(id).addEventListener("change", saveAiSuggestionSettings);
  });
  $("shuffleBtn").addEventListener("click", () => {
    $("wordInput").value = formatWordsForInput(shuffle(analyzeWordList(parseWords(), state.quizLanguage).valid));
    saveCurrentWordDraft();
    updateStats();
  });
  $("clearBtn").addEventListener("click", confirmClearWords);
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
  $("clearWrongBtn").addEventListener("click", () => confirmClearWrongBook("current"));
  $("clearHistoryBtn").addEventListener("click", () => confirmClearWrongBook("history"));
  $("studyGoalInput").addEventListener("change", saveStudyGoal);
  $("exportStudyBtn").addEventListener("click", exportStudyRecords);
  $("clearStudyBtn").addEventListener("click", confirmClearStudyRecords);
  $("currentWrongTab").addEventListener("click", () => setWrongScope("current"));
  $("historyWrongTab").addEventListener("click", () => setWrongScope("history"));
  $("wrongSearchInput").addEventListener("input", renderWrongBook);
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
  document.querySelectorAll("[data-module]").forEach((button) => button.addEventListener("click", async () => {
    if (button.dataset.module === "language") showProjectPicker(true);
    else await showTools("/tools", true);
  }));
  $("languageBackBtn").addEventListener("click", () => showModulePicker(true));
  $("backProjectBtn").addEventListener("click", () => showProjectPicker(true));
  $("leaveToolsBtn").addEventListener("click", () => showModulePicker(true));
  $("toolsAccountBtn").addEventListener("click", () => { pushRoute("/account"); openModal("accountModal"); });
  $("shareLoginBtn").addEventListener("click", () => state.session && state.account ? showModulePicker(true) : showAuth("", { path: "/login" }));
  $("gradingModeSelect").addEventListener("change", (event) => {
    state.gradingMode = event.target.value;
    saveState();
  });
  document.querySelectorAll(".tabs button").forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.view)));
  document.querySelectorAll("[data-achievement-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      achievementFilter = ["all", "progress", "unlocked"].includes(button.dataset.achievementFilter)
        ? button.dataset.achievementFilter
        : "all";
      renderAchievements();
    });
  });

  saveState();
  updateStats();
  renderWrongBook();
  renderAchievements();

  if (window.WYJTools && !toolsInitialized) {
    window.WYJTools.init({
      api,
      apiGet,
      publicApi,
      copyText: writeClipboardText,
      formatDate: formatLocalDateTime,
      navigate: (path) => pushRoute(path),
    });
    toolsInitialized = true;
  }
  loadMembershipPlans().catch(() => {});

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`).catch(() => {});
  }
  window.addEventListener("online", () => refreshBackendState());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (state.session || !backendAvailable)) refreshBackendState();
  });
  window.setInterval(() => {
    if (document.visibilityState === "visible" && navigator.onLine !== false) refreshBackendState();
  }, BACKEND_REFRESH_INTERVAL_MS);

  const initialPath = location.pathname;
  const backendPromise = refreshBackendState();
  await runSplashSequence(() => {
    $("appShell").classList.remove("app-shell-pending");
    $("appShell").classList.add("app-shell-ready");
    $("appShell").setAttribute("aria-hidden", "false");
    if (initialPath.startsWith("/share/") && showShareRoute(initialPath)) return;
    showAuth(state.session ? "正在验证登录状态…" : "", {
      mode: initialPath === "/register" ? "register" : "login",
      path: initialPath,
      skipRoute: true,
    });
  });
  await backendPromise;
  await routeCurrent();
}

boot();

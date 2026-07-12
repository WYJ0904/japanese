const APP_VERSION = "2026-07-12-accounts4";
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
let selectedRechargePlan = "";
let adminUsers = [];
let confirmAction = null;
let lastLimitPromptKey = "";
let projectRuntimeNeedsRestore = false;
const projectRuntime = {
  english: null,
  japanese: null,
};
const BACKEND_OFFLINE_MESSAGE = "未连接本地后端，请先运行本地服务并配置 Cloudflare Pages 的 LOCAL_API_BASE。";

const restoredSession = localStorage.getItem("wyjAccountSession") || sessionStorage.getItem("vocabSession") || "";
if (restoredSession) localStorage.setItem("wyjAccountSession", restoredSession);
sessionStorage.removeItem("vocabSession");
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
  account: loadJson("wyjAccountCache", null),
  quizSession: "",
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
  state.account = null;
  state.quizSession = "";
  sessionStorage.removeItem("vocabSession");
  localStorage.removeItem("vocabSession");
  localStorage.removeItem("wyjAccountSession");
  localStorage.removeItem("wyjAccountCache");
  renderAccountUi();
}

function membershipLabel(value) {
  return {
    free: "普通用户",
    trial_single_language: "单语言体验版",
    monthly: "包月会员",
    lifetime: "永久会员",
  }[value] || "普通用户";
}

function isSuperAdmin(account = state.account) {
  return Boolean(
    account && account.username === "wyj" && account.role === "super_admin" && account.is_super_admin === true,
  );
}

function applyAccount(account) {
  state.account = account || null;
  if (state.account) localStorage.setItem("wyjAccountCache", JSON.stringify(state.account));
  else localStorage.removeItem("wyjAccountCache");
  renderAccountUi();
  updateStats();
}

function accountWordLimit(language = state.quizLanguage) {
  const account = state.account;
  if (!account) return 15;
  if (isSuperAdmin(account) || ["monthly", "lifetime"].includes(account.membership)) return Infinity;
  if (account.membership === "trial_single_language" && account.trial_language === language) return Infinity;
  return 15;
}

function renderAccountUi() {
  const account = state.account;
  const badge = $("accountBadge");
  if (!badge) return;
  badge.textContent = account ? `${account.username} · ${membershipLabel(account.membership)}` : "未登录";
  $("accountBtn")?.classList.toggle("hidden", !account);
  $("logoutBtn")?.classList.toggle("hidden", !account);
  $("adminBtn")?.classList.toggle("hidden", !isSuperAdmin(account));
  renderAccountDetails();
}

function renderAccountDetails() {
  const details = $("accountDetails");
  if (!details || !state.account) return;
  const account = state.account;
  const rows = [
    ["用户名", account.username],
    ["用户 ID", account.id],
    ["账户类型", isSuperAdmin(account) ? "超级管理员" : "普通账户"],
    ["会员等级", membershipLabel(account.membership)],
    ["体验语言", account.trial_language ? quizLanguageLabel(account.trial_language) : "无"],
    ["会员开始", account.membership_start || "无"],
    ["会员到期", account.membership === "lifetime" ? "永久" : account.membership_expires || "无"],
    ["注册时间", account.registered_at || ""],
    ["最后登录", account.last_login_at || ""],
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

async function apiGet(path) {
  const response = await fetchWithTimeout(path, {
    method: "GET",
    cache: "no-store",
    headers: { "X-Session-Token": state.session },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      throw new Error("登录已失效，请重新登录");
    }
    const error = new Error(data.error || "请求失败");
    error.code = data.code || "request_failed";
    throw error;
  }
  return data;
}

function openModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.classList.remove("hidden", "is-closing");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  modal.querySelector("button, input, select")?.focus();
}

function closeModal(id, immediate = false) {
  const modal = $(id);
  if (!modal || modal.classList.contains("hidden")) return;
  const finish = () => {
    modal.classList.add("hidden");
    modal.classList.remove("is-closing");
    modal.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal-layer:not(.hidden)")) document.body.classList.remove("modal-open");
  };
  if (immediate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) finish();
  else {
    modal.classList.add("is-closing");
    window.setTimeout(finish, 180);
  }
}

function showAuthMode(mode) {
  const register = mode === "register";
  $("loginForm").classList.toggle("hidden", register);
  $("registerForm").classList.toggle("hidden", !register);
  $("showLoginBtn").classList.toggle("active", !register);
  $("showRegisterBtn").classList.toggle("active", register);
  $("authTitle").textContent = register ? "注册账户" : "账户登录";
  $("loginError").textContent = "";
}

async function registerAccount(event) {
  event.preventDefault();
  const button = $("registerSubmitBtn");
  if (button.disabled) return;
  $("loginError").textContent = "";
  button.disabled = true;
  try {
    const username = $("registerUsernameInput").value.trim();
    const secret = $("registerSecretInput").value;
    const confirmSecret = $("registerConfirmInput").value;
    await api("/api/register", { username, secret, confirm_secret: confirmSecret });
    $("usernameInput").value = username;
    $("secretInput").value = secret;
    showAuthMode("login");
    $("loginError").textContent = "注册成功，请登录";
  } catch (error) {
    $("loginError").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function logoutAccount() {
  const session = state.session;
  try {
    if (session) await api("/api/logout");
  } catch (_) {
    // Local cleanup still signs the browser out when the network is unavailable.
  }
  clearSession();
  pendingScreen = "auth";
  pendingAuthMessage = "已退出登录";
  if (location.pathname === "/admin") history.replaceState({}, "", "/");
  showAuth(pendingAuthMessage);
}

function planDetails(plan) {
  return {
    trial_single_language: ["单语言体验版", "5 CNY", "30 天内一门语言无限使用"],
    monthly: ["包月会员", "10 CNY", "30 天内英语和日语无限使用"],
    lifetime: ["永久会员", "70 CNY", "英语和日语永久无限使用"],
  }[plan] || ["请选择套餐", "", ""];
}

function selectRechargePlan(plan) {
  selectedRechargePlan = plan;
  document.querySelectorAll("[data-plan]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.plan === plan);
  });
  $("trialLanguageField").classList.toggle("hidden", plan !== "trial_single_language");
  const [name, price, description] = planDetails(plan);
  $("purchaseSummary").textContent = `${name} · ${price} · ${description}`;
  $("submitRechargeBtn").disabled = !plan;
  $("rechargeMessage").textContent = "";
}

function openMembershipModal() {
  selectRechargePlan(selectedRechargePlan);
  openModal("membershipModal");
}

async function submitRechargeRequest() {
  if (!state.account || !state.session) {
    closeModal("membershipModal", true);
    if (!currentProject) enterProject("english");
    showAuth("请先登录后再提交充值申请");
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
    $("rechargeMessage").textContent = data.created ? "申请已提交，等待管理员人工处理" : "你已有待处理申请，请勿重复提交";
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
    await api("/api/account/delete", { secret: $("deleteSecretInput").value });
    closeModal("deleteAccountModal", true);
    closeModal("accountModal", true);
    clearSession();
    showProjectPicker();
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

function adminUserById(id) {
  return adminUsers.find((user) => user.id === id);
}

function renderAdminUsers(users) {
  adminUsers = users || [];
  const list = $("adminUserList");
  list.innerHTML = adminUsers.map((user) => {
    const protectedUser = user.is_super_admin;
    const stateClass = user.banned ? "account-state-bad" : "account-state-good";
    return `<article class="admin-user-card" data-user-id="${escapeHtml(user.id)}">
      <div><h3>${escapeHtml(user.username)}</h3><p>${escapeHtml(user.id)}</p><p class="${stateClass}">${user.banned ? "已永久封禁" : "正常"}</p></div>
      <div><p>${escapeHtml(membershipLabel(user.membership))}</p><p>${escapeHtml(user.trial_language || "无体验语言")}</p><p>${escapeHtml(user.membership_expires || (user.membership === "lifetime" ? "永久" : "无到期时间"))}</p></div>
      <div><p class="secret-value" data-secret-value>${"•".repeat(Math.max(6, String(user.secret || "").length))}</p><div class="action-row compact"><button data-admin-secret-toggle type="button">查看密钥</button><button data-admin-secret-copy type="button">复制密钥</button></div><p>最后登录：${escapeHtml(user.last_login_at || "从未")}</p></div>
      <div class="action-row compact"><button data-admin-edit type="button" ${protectedUser ? "disabled" : ""}>编辑</button></div>
    </article>`;
  }).join("");
  list.querySelectorAll("[data-admin-secret-toggle]").forEach((button) => button.addEventListener("click", () => {
    const card = button.closest("[data-user-id]");
    const user = adminUserById(card.dataset.userId);
    const value = card.querySelector("[data-secret-value]");
    const showing = button.dataset.showing === "1";
    value.textContent = showing ? "•".repeat(Math.max(6, String(user.secret || "").length)) : user.secret;
    button.textContent = showing ? "查看密钥" : "隐藏密钥";
    button.dataset.showing = showing ? "0" : "1";
  }));
  list.querySelectorAll("[data-admin-secret-copy]").forEach((button) => button.addEventListener("click", async () => {
    const user = adminUserById(button.closest("[data-user-id]").dataset.userId);
    await navigator.clipboard.writeText(user.secret);
    button.textContent = "已复制";
  }));
  list.querySelectorAll("[data-admin-edit]").forEach((button) => button.addEventListener("click", () => openAdminEditor(button.closest("[data-user-id]").dataset.userId)));
}

function renderAdminRecharge(requests) {
  const list = $("adminRechargeList");
  list.innerHTML = (requests || []).map((request) => `<article class="admin-user-card" data-request-id="${escapeHtml(request.id)}">
    <div><h3>${escapeHtml(request.username)}</h3><p>${escapeHtml(request.requested_at)}</p></div>
    <div><p>${escapeHtml(membershipLabel(request.plan))}</p><p>${escapeHtml(request.trial_language || "两种语言")}</p></div>
    <div><p>${escapeHtml(request.status)}</p></div>
    <div class="action-row compact">${request.status === "pending" ? '<button data-recharge-approve type="button">开通</button><button data-recharge-reject type="button">拒绝</button>' : ""}</div>
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

async function loadAdminData() {
  if (!isSuperAdmin()) return;
  $("adminError").textContent = "";
  try {
    const [users, recharge] = await Promise.all([apiGet("/api/admin/users"), apiGet("/api/admin/recharge")]);
    renderAdminUsers(users.users);
    renderAdminRecharge(recharge.requests);
  } catch (error) {
    $("adminError").textContent = error.message;
  }
}

async function showAdminPanel(pushHistory = true) {
  if (!state.session || !state.account) {
    if (!currentProject) enterProject("english");
    showAuth("请先登录管理员账户");
    return;
  }
  if (!isSuperAdmin()) {
    history.replaceState({}, "", "/");
    showProjectPicker();
    alert("无管理员权限");
    return;
  }
  if (pushHistory && location.pathname !== "/admin") history.pushState({}, "", "/admin");
  $("projectPicker").classList.add("hidden");
  $("projectApp").classList.add("hidden");
  $("adminPanel").classList.remove("hidden");
  $("adminPanel").setAttribute("aria-hidden", "false");
  await loadAdminData();
}

function leaveAdminPanel() {
  if (location.pathname === "/admin") history.pushState({}, "", "/");
  showProjectPicker();
}

function openAdminEditor(userId) {
  const user = adminUserById(userId);
  if (!user || user.is_super_admin) return;
  $("adminEditUserId").value = user.id;
  $("adminEditTitle").textContent = `编辑 ${user.username}`;
  $("adminMembershipSelect").value = user.membership;
  $("adminTrialLanguageSelect").value = user.trial_language || "";
  $("adminMembershipStart").value = user.membership_start || "";
  $("adminMembershipExpires").value = user.membership_expires || "";
  $("adminNewSecretInput").value = "";
  $("adminToggleBanBtn").textContent = user.banned ? "解除封禁" : "永久封禁";
  $("adminEditMessage").textContent = "";
  openModal("adminEditModal");
}

async function saveAdminMembership() {
  const userId = $("adminEditUserId").value;
  try {
    await api("/api/admin/membership", {
      user_id: userId,
      membership: $("adminMembershipSelect").value,
      membership_start: $("adminMembershipStart").value.trim(),
      membership_expires: $("adminMembershipExpires").value.trim(),
      trial_language: $("adminTrialLanguageSelect").value,
    });
    $("adminEditMessage").textContent = "会员设置已保存并立即生效";
    await loadAdminData();
  } catch (error) { $("adminEditMessage").textContent = error.message; }
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

function showProjectPicker() {
  if (!state.session || !state.account) {
    showAuth(pendingAuthMessage || "请先登录后选择测试项目");
    return;
  }
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
  $("adminPanel")?.classList.add("hidden");
  $("adminPanel")?.setAttribute("aria-hidden", "true");
  document.body.classList.add("project-picker-active");
}

function showMainShell() {
  if (!currentProject) return;
  $("adminPanel")?.classList.add("hidden");
  $("adminPanel")?.setAttribute("aria-hidden", "true");
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
  if (currentProject) {
    saveCurrentWordDraft();
    saveProjectRuntime();
  }
  currentProject = "";
  state.quizLanguage = "";
  if (judgeController) judgeController.abort();
  clearNextTimer();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  showAuthMode("login");
  $("adminPanel")?.classList.add("hidden");
  $("adminPanel")?.setAttribute("aria-hidden", "true");
  $("projectPicker").classList.add("hidden");
  $("projectPicker").setAttribute("aria-hidden", "true");
  $("projectApp").classList.remove("hidden");
  $("projectApp").setAttribute("aria-hidden", "false");
  $("topbar").classList.add("hidden");
  $("projectNameLabel").textContent = "";
  $("authPanel").classList.remove("hidden");
  $("workspace").classList.add("hidden");
  $("loginError").textContent = message;
  $("offlineReviewBtn").classList.add("hidden");
  document.body.classList.add("project-picker-active");
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
  const limit = accountWordLimit(state.quizLanguage);
  const exceeded = Number.isFinite(limit) && eligibleWords.length > limit;
  $("wordInput")?.classList.toggle("limit-exceeded", exceeded);
  if ($("wordLimitHint")) {
    $("wordLimitHint").textContent = Number.isFinite(limit)
      ? `当前账户每次最多测试 ${limit} 个单词${exceeded ? "，请开通会员后继续" : ""}`
      : "当前语言不限单次测试数量";
  }
  const promptKey = `${state.quizLanguage}:${eligibleWords.length}`;
  if (exceeded && promptKey !== lastLimitPromptKey && !$("entryScreen")) {
    lastLimitPromptKey = promptKey;
    openMembershipModal();
  }
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

async function startQuiz(words, mode = "normal") {
  const language = ensureQuizLanguage();
  if (!language) return;

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

  state.quizSession = "";
  if (backendAvailable && state.session) {
    setBusy(true);
    try {
      const authorization = await api("/api/quiz/start", { language, words: quizWords });
      state.quizSession = authorization.quiz_session;
      applyAccount(authorization.account);
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
  state.quizSession = "";
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
        const data = await api("/api/rubric", { word, quiz_session: state.quizSession });
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
      quiz_session: state.quizSession,
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
  const button = $("loginSubmitBtn");
  if (button.disabled) return;
  button.disabled = true;
  try {
    const data = await api("/api/login", {
      username: $("usernameInput").value.trim(),
      secret: $("secretInput").value,
    });
    state.session = data.session;
    localStorage.setItem("wyjAccountSession", state.session);
    applyAccount(data.account);
    pendingScreen = "workspace";
    pendingAuthMessage = "";
    $("modelLabel").textContent = data.model || "qwen3:8b";
    if (location.pathname === "/admin") await showAdminPanel(false);
    else showProjectPicker();
    updateStats();
  } catch (error) {
    $("loginError").textContent = error.message;
  } finally {
    button.disabled = false;
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
  } catch (_) {
    backendAvailable = false;
    aiAvailable = false;
    pendingScreen = state.session && state.account ? "workspace" : "auth";
    pendingAuthMessage = state.session && state.account ? "" : BACKEND_OFFLINE_MESSAGE;
    $("modelLabel").textContent = "本地复习";
    $("statusDot").classList.remove("online");
  }
  applyPendingScreen();
}

async function boot() {
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
  renderAccountUi();

  $("loginForm").addEventListener("submit", login);
  $("registerForm").addEventListener("submit", registerAccount);
  $("showLoginBtn").addEventListener("click", () => showAuthMode("login"));
  $("showRegisterBtn").addEventListener("click", () => showAuthMode("register"));
  $("membershipBtn").addEventListener("click", openMembershipModal);
  $("accountBtn").addEventListener("click", () => openModal("accountModal"));
  $("adminBtn").addEventListener("click", () => showAdminPanel(true));
  $("logoutBtn").addEventListener("click", logoutAccount);
  $("submitRechargeBtn").addEventListener("click", submitRechargeRequest);
  $("copyWechatBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText("W2009Y94J");
    $("copyWechatBtn").textContent = "已复制";
  });
  document.querySelectorAll("[data-plan]").forEach((button) => button.addEventListener("click", () => selectRechargePlan(button.dataset.plan)));
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => closeModal(button.dataset.closeModal)));
  document.querySelectorAll(".modal-layer").forEach((modal) => modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal.id);
  }));
  $("changeSecretForm").addEventListener("submit", changeOwnSecret);
  $("openDeleteAccountBtn").addEventListener("click", () => openModal("deleteAccountModal"));
  $("deleteAccountForm").addEventListener("submit", deleteOwnAccount);
  $("refreshAdminBtn").addEventListener("click", loadAdminData);
  $("leaveAdminBtn").addEventListener("click", leaveAdminPanel);
  document.querySelectorAll("[data-admin-view]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-admin-view]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".admin-view").forEach((view) => view.classList.toggle("active", view.id === button.dataset.adminView));
  }));
  $("saveAdminMembershipBtn").addEventListener("click", saveAdminMembership);
  $("saveAdminSecretBtn").addEventListener("click", saveAdminSecret);
  $("adminToggleBanBtn").addEventListener("click", () => adminUserAction("ban"));
  $("adminForceLogoutBtn").addEventListener("click", () => adminUserAction("logout"));
  $("adminDeleteUserBtn").addEventListener("click", () => adminUserAction("delete"));
  $("cancelConfirmBtn").addEventListener("click", () => { confirmAction = null; closeModal("confirmModal"); });
  $("acceptConfirmBtn").addEventListener("click", runConfirmedAction);
  window.addEventListener("popstate", () => {
    if (location.pathname === "/admin") showAdminPanel(false);
    else showProjectPicker();
  });
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

  const backendPromise = refreshBackendState();
  if (state.session && state.account) showProjectPicker();
  else showAuth();
  await runSplashSequence(() => {
    $("appShell").classList.remove("app-shell-pending");
    $("appShell").classList.add("app-shell-ready");
    $("appShell").setAttribute("aria-hidden", "false");
  });
  await backendPromise;
  if (location.pathname === "/admin") await showAdminPanel(false);
  else if (state.session && state.account) showProjectPicker();
  else showAuth(pendingAuthMessage);
}

boot();

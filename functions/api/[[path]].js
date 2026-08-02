const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const NO_BODY_METHODS = new Set(["GET", "HEAD"]);
const RETRYABLE_STATUS = new Set([502, 503, 504, 530]);
const MAX_PROXY_BODY_BYTES = 600 * 1024;
const MAX_TEMP_FILE_PROXY_BODY_BYTES = 28 * 1024 * 1024;
const IDEMPOTENT_RETRY_BASE_DELAYS_MS = [0, 250, 900];
const UPSTREAM_GET_TIMEOUT_MS = 10000;
const UPSTREAM_DEFAULT_TIMEOUT_MS = 30000;
const UPSTREAM_AI_TIMEOUT_MS = 125000;
const UPSTREAM_VOCABULARY_TIMEOUT_MS = 245000;
const UPSTREAM_UPLOAD_TIMEOUT_MS = 185000;
const CLIENT_CONTEXT_HEADERS = new Set([
  "x-wyj-proxy",
  "x-wyj-client-ip",
  "x-wyj-client-country",
  "x-wyj-client-region",
  "x-wyj-client-city",
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeBase(value) {
  const base = String(value || "").trim();
  if (!base) return "";

  const url = new URL(base);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("LOCAL_API_BASE must start with http:// or https://");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

function joinPaths(basePath, requestPath) {
  const cleanBase = basePath.replace(/\/+$/, "");
  const cleanRequest = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  return `${cleanBase}${cleanRequest}` || "/";
}

function targetUrlFor(request, base) {
  const incoming = new URL(request.url);
  const target = new URL(base.toString());
  target.pathname = joinPaths(base.pathname, incoming.pathname);
  target.search = incoming.search;
  return target;
}

function uniqueBases(items) {
  const seen = new Set();
  return items.filter((base) => {
    const key = base.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function configuredBases(env) {
  const rawBases = [
    env.LOCAL_API_BASE || env.VOCAB_LOCAL_API_BASE,
    env.LOCAL_API_FALLBACK || env.VOCAB_LOCAL_API_FALLBACK,
  ].filter(Boolean);
  return uniqueBases(rawBases.map((base) => normalizeBase(base)));
}

function encodedContextHeader(value, maxLength = 120) {
  return encodeURIComponent(String(value || "").slice(0, maxLength));
}

function requestHeadersFor(request, requestContext = {}) {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(normalized) && !CLIENT_CONTEXT_HEADERS.has(normalized)) {
      headers.set(key, value);
    }
  });
  headers.set("X-Forwarded-Host", new URL(request.url).host);
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");
  headers.set("X-WYJ-Proxy", "pages");
  headers.set("X-WYJ-Client-IP", encodedContextHeader(request.headers.get("CF-Connecting-IP"), 80));
  headers.set("X-WYJ-Client-Country", encodedContextHeader(requestContext.country || request.headers.get("CF-IPCountry"), 80));
  headers.set("X-WYJ-Client-Region", encodedContextHeader(requestContext.region || requestContext.regionCode, 120));
  headers.set("X-WYJ-Client-City", encodedContextHeader(requestContext.city, 120));
  return headers;
}

function responseHeadersFor(response) {
  const headers = new Headers(response.headers);
  for (const name of HOP_BY_HOP_HEADERS) {
    headers.delete(name);
  }
  headers.set("Cache-Control", "no-store");
  return headers;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelayWithJitter(baseMilliseconds) {
  if (!baseMilliseconds) return 0;
  return baseMilliseconds + Math.floor(Math.random() * Math.max(50, baseMilliseconds * 0.35));
}

function upstreamTimeoutFor(requestPath, method) {
  if (requestPath === "/api/vocabulary/suggest") return UPSTREAM_VOCABULARY_TIMEOUT_MS;
  if (requestPath === "/api/temporary/file") return UPSTREAM_UPLOAD_TIMEOUT_MS;
  if (["/api/judge", "/api/rubric", "/api/japanese/readings", "/api/export-pdf"].includes(requestPath)) {
    return UPSTREAM_AI_TIMEOUT_MS;
  }
  if (NO_BODY_METHODS.has(method)) return UPSTREAM_GET_TIMEOUT_MS;
  return UPSTREAM_DEFAULT_TIMEOUT_MS;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function onRequest(context) {
  const { env, request } = context;

  let bases;
  try {
    bases = configuredBases(env);
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }

  if (!bases.length) {
    return json(
      {
        ok: false,
        error: "LOCAL_API_BASE is not configured. Start the local backend and set this to the Cloudflare Tunnel URL.",
      },
      503,
    );
  }

  const requestPath = new URL(request.url).pathname;
  const maxBodyBytes = requestPath === "/api/temporary/file" ? MAX_TEMP_FILE_PROXY_BODY_BYTES : MAX_PROXY_BODY_BYTES;
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > maxBodyBytes) {
    return json({ ok: false, error: requestPath === "/api/temporary/file" ? "请求内容过大，临时文件最大支持 20 MB。" : "请求内容过大。" }, 413);
  }

  const method = request.method.toUpperCase();
  const idempotent = NO_BODY_METHODS.has(method);
  const body = idempotent ? undefined : await request.arrayBuffer();
  if (body && body.byteLength > maxBodyBytes) {
    return json({ ok: false, error: requestPath === "/api/temporary/file" ? "请求内容过大，临时文件最大支持 20 MB。" : "请求内容过大。" }, 413);
  }
  const rounds = idempotent ? IDEMPOTENT_RETRY_BASE_DELAYS_MS : [0];
  const candidateBases = idempotent ? bases : bases.slice(0, 1);
  const timeoutMs = upstreamTimeoutFor(requestPath, method);
  for (let round = 0; round < rounds.length; round += 1) {
    const delay = retryDelayWithJitter(rounds[round]);
    if (delay) await sleep(delay);
    for (let baseIndex = 0; baseIndex < candidateBases.length; baseIndex += 1) {
      const base = candidateBases[baseIndex];
      const target = targetUrlFor(request, base);
      const init = {
        method: request.method,
        headers: requestHeadersFor(request, request.cf || context.cf || {}),
        redirect: "manual",
      };
      if (body) init.body = body;
      const hasMoreAttempts = round < rounds.length - 1 || baseIndex < candidateBases.length - 1;
      try {
        const response = await fetchWithTimeout(target.toString(), init, timeoutMs);
        if (hasMoreAttempts && RETRYABLE_STATUS.has(response.status)) {
          if (response.body) await response.body.cancel().catch(() => {});
          continue;
        }
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeadersFor(response),
        });
      } catch (_) {
        // GET/HEAD may continue to a fallback; writes are deliberately never replayed.
      }
    }
  }

  return json(
    {
      ok: false,
      error: "Could not reach the local backend through configured Cloudflare Tunnel URLs.",
      code: "upstream_unreachable",
      retryable: true,
    },
    502,
  );
}

export const __testing = {
  configuredBases,
  fetchWithTimeout,
  retryDelayWithJitter,
  upstreamTimeoutFor,
};

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

function requestHeadersFor(request, target) {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  headers.set("X-Forwarded-Host", new URL(request.url).host);
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");
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

export async function onRequest(context) {
  const { env, request } = context;

  let base;
  try {
    base = normalizeBase(env.LOCAL_API_BASE || env.VOCAB_LOCAL_API_BASE);
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }

  if (!base) {
    return json(
      {
        ok: false,
        error: "LOCAL_API_BASE is not configured. Start the local backend and set this to the Cloudflare Tunnel URL.",
      },
      503,
    );
  }

  const target = targetUrlFor(request, base);
  const init = {
    method: request.method,
    headers: requestHeadersFor(request, target),
    redirect: "manual",
  };

  if (!NO_BODY_METHODS.has(request.method.toUpperCase())) {
    init.body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(target.toString(), init);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeadersFor(response),
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: "Could not reach the local backend through LOCAL_API_BASE.",
        detail: error.message,
      },
      502,
    );
  }
}

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(HERE, "..", "functions", "api", "[[path]].js");
const source = fs.readFileSync(SOURCE_PATH, "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { onRequest, __testing } = await import(moduleUrl);

async function withMockFetch(mock, action) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await action();
  } finally {
    globalThis.fetch = original;
  }
}

let completed = 0;

await withMockFetch(async (url) => {
  const calls = globalThis.__proxyCalls;
  calls.push(url);
  if (calls.length === 1) return new Response(JSON.stringify({ ok: false }), { status: 530 });
  return new Response(JSON.stringify({ ok: true, source: "fallback" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}, async () => {
  globalThis.__proxyCalls = [];
  const response = await onRequest({
    env: {
      LOCAL_API_BASE: "https://primary.example",
      LOCAL_API_FALLBACK: "https://fallback.example",
    },
    request: new Request("https://thewyj.uk/api/status"),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(globalThis.__proxyCalls.map((url) => new URL(url).host), ["primary.example", "fallback.example"]);
  assert.equal((await response.json()).source, "fallback");
  delete globalThis.__proxyCalls;
  completed += 1;
});

await withMockFetch(async (_url, init) => {
  globalThis.__postAttempts.push(init.method);
  throw new TypeError("simulated transport failure");
}, async () => {
  globalThis.__postAttempts = [];
  const response = await onRequest({
    env: {
      LOCAL_API_BASE: "https://primary.example",
      LOCAL_API_FALLBACK: "https://fallback.example",
    },
    request: new Request("https://thewyj.uk/api/recharge/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  });
  assert.equal(response.status, 502);
  assert.equal(globalThis.__postAttempts.length, 1, "non-idempotent requests must never be replayed");
  assert.equal((await response.json()).code, "upstream_unreachable");
  delete globalThis.__postAttempts;
  completed += 1;
});

await withMockFetch((_url, init) => new Promise((_resolve, reject) => {
  init.signal.addEventListener("abort", () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    reject(error);
  }, { once: true });
}), async () => {
  await assert.rejects(
    __testing.fetchWithTimeout("https://slow.example", {}, 15),
    (error) => error?.name === "AbortError",
  );
  completed += 1;
});

assert.equal(__testing.upstreamTimeoutFor("/api/status", "GET"), 10000);
assert.equal(__testing.upstreamTimeoutFor("/api/recharge/request", "POST"), 30000);
assert.equal(__testing.upstreamTimeoutFor("/api/vocabulary/suggest", "POST"), 245000);
assert.equal(__testing.upstreamTimeoutFor("/api/temporary/file", "POST"), 185000);
completed += 1;

console.log(`Proxy resilience checks passed: ${completed}`);

#!/usr/bin/env bun
// Lightweight proxy that retries on 429 from upstream qwen-proxy

const UPSTREAM = "http://localhost:8080";
const PORT = 8081;
const MAX_RETRIES = 5;
const RETRY_DELAY = 2; // Fixed 2 seconds between retries

async function retryRequest(url: string, options: RequestInit, retries = 0): Promise<Response> {
  const resp = await fetch(url, options);

  if (resp.status === 429 && retries < MAX_RETRIES) {
    console.error(`[retry] 429 hit, waiting ${RETRY_DELAY}s (attempt ${retries + 1}/${MAX_RETRIES})`);
    await new Promise(r => setTimeout(r, RETRY_DELAY * 1000));
    return retryRequest(url, options, retries + 1);
  }

  return resp;
}

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const upstreamUrl = UPSTREAM + url.pathname + (url.search || "");

    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => headers[k] = v);

    // Add keepalive for connection reuse
    headers["Connection"] = "keep-alive";

    return retryRequest(upstreamUrl, {
      method: req.method,
      headers,
      body: req.body,
      keepAlive: true,
    });
  },
});

console.log(`Retry proxy running on port ${PORT} -> ${UPSTREAM}`);
console.log(`Retry config: max=${MAX_RETRIES}, delay=${RETRY_DELAY}s`);

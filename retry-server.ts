#!/usr/bin/env bun
// Lightweight proxy that retries on 429, 5xx errors, and connection failures

const UPSTREAM = "http://localhost:8080";
const PORT = 8081;
const MAX_RETRIES = 5;
const RETRY_DELAY = 2000; // 2s fixed delay

// Status codes that trigger retry
const RETRY_STATUSES = [429, 502, 503, 504];

async function retryRequest(
  url: string,
  options: RequestInit,
  retries = 0
): Promise<Response> {
  let resp: Response;

  try {
    resp = await fetch(url, options);

    // Check if status code should trigger retry
    if (RETRY_STATUSES.includes(resp.status) && retries < MAX_RETRIES) {
      console.error(
        `[retry] ${resp.status} from upstream, waiting ${RETRY_DELAY}ms (attempt ${retries + 1}/${MAX_RETRIES})`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
      return retryRequest(url, options, retries + 1);
    }

    return resp;
  } catch (err: any) {
    // Connection failure (network error, timeout, ECONNREFUSED, etc.)
    if (retries < MAX_RETRIES) {
      console.error(
        `[retry] Connection failed: ${err.message || err}, waiting ${RETRY_DELAY}ms (attempt ${retries + 1}/${MAX_RETRIES})`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
      return retryRequest(url, options, retries + 1);
    }

    // Max retries exceeded, return error response
    console.error(`[retry] Max retries exceeded, returning 502`);
    return new Response(
      JSON.stringify({
        error: {
          message: "Upstream connection failed after max retries",
          type: "upstream_error",
          retries: retries + 1,
        },
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const upstreamUrl = UPSTREAM + url.pathname + (url.search || "");

    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => (headers[k] = v));

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
console.log(`Retries: ${MAX_RETRIES}x with ${RETRY_DELAY}ms delay on 429/5xx/connection errors`);

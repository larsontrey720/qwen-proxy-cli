#!/usr/bin/env bun
/**
 * Qwen Proxy Management CLI
 * 
 * Commands:
 *   setup   - Install qwen-proxy and extract credentials from qwen-code
 *   start   - Start the proxy server
 *   stop    - Stop the proxy server
 *   restart - Restart the proxy server
 *   status  - Check proxy and account status
 *   test    - Test the proxy with a sample request
 *   models  - List available models
 *   usage   - Show daily usage count
 *   tunnel  - Create a cloudflare tunnel for public access
 */

const PROXY_PORT = 8080;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;
const CLOUDFLARED_LOG = "/dev/shm/cloudflared.log";
const QWEN_PROXY_LOG = "/dev/shm/qwen-proxy.log";
const QWEN_DIR = `${process.env.HOME}/.qwen`;
const ACCOUNT_ID = "myqwen";
const LOG_FILE = "/dev/shm/qwen-proxy.log";

const COLORS = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
};

function log(color: keyof typeof COLORS, msg: string) {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

async function run(cmd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const result = Bun.spawnSync(["bash", "-c", cmd], { stdout: "pipe", stderr: "pipe" });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    code: result.exitCode,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function isProxyRunning(): Promise<boolean> {
  try {
    const resp = await fetch(`${PROXY_URL}/health`);
    return resp.ok;
  } catch {
    return false;
  }
}

async function setup() {
  log("cyan", "=== Qwen Proxy Setup ===\n");

  // Check if qwen-proxy is installed
  const { code: whichCode } = await run("which qwen-proxy");
  if (whichCode !== 0) {
    log("yellow", "Installing qwen-proxy...");
    const { code: installCode, stderr } = await run("npm install -g qwen-proxy");
    if (installCode !== 0) {
      log("red", `Failed to install: ${stderr}`);
      process.exit(1);
    }
    log("green", "✓ qwen-proxy installed");
  } else {
    log("green", "✓ qwen-proxy already installed");
  }

  // Check for qwen-code OAuth credentials
  const credFile = `${QWEN_DIR}/oauth_creds.json.bak`;
  const { code: lsCode } = await run(`ls ${credFile}`);
  
  if (lsCode !== 0) {
    log("red", "No qwen-code credentials found. Please authenticate with qwen-code first:");
    log("cyan", "  qwen-code");
    process.exit(1);
  }
  log("green", "✓ Found qwen-code credentials");

  // Copy credentials for qwen-proxy
  const targetFile = `${QWEN_DIR}/oauth_creds_${ACCOUNT_ID}.json`;
  await run(`cp ${credFile} ${targetFile}`);
  log("green", `✓ Credentials copied to ${targetFile}`);

  // Check if account is recognized
  const { stdout: authList } = await run("qwen-proxy auth list");
  console.log(authList);

  // If invalid/expired, trigger a refresh by starting the proxy briefly
  if (authList.includes("Invalid") || authList.includes("Expired")) {
    log("yellow", "Refreshing token...");
    await run(`timeout 5 qwen-proxy serve --headless 2>&1 || true`);
    
    const { stdout: newList } = await run("qwen-proxy auth list");
    console.log(newList);
  }

  log("green", "\n✓ Setup complete! Run 'start' to begin the proxy server.");
}

async function start() {
  if (await isProxyRunning()) {
    log("yellow", "Proxy is already running");
    return;
  }

  log("cyan", "Starting qwen-proxy server...");
  
  // Start in background
  await run(`nohup qwen-proxy serve --headless > ${LOG_FILE} 2>&1 &`);
  
  // Wait for it to start
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isProxyRunning()) {
      log("green", `✓ Proxy running at ${PROXY_URL}`);
      log("cyan", `  OpenAI endpoint: ${PROXY_URL}/v1`);
      log("cyan", `  Health check: ${PROXY_URL}/health`);
      return;
    }
  }
  
  log("red", "Failed to start proxy. Check logs:");
  console.log(await run(`cat ${LOG_FILE}`).then(r => r.stdout));
  process.exit(1);
}

async function stop() {
  log("cyan", "Stopping qwen-proxy...");
  
  const { stdout: pgrep } = await run("pgrep -f 'qwen-proxy serve'");
  if (!pgrep.trim()) {
    log("yellow", "Proxy is not running");
    return;
  }
  
  await run("pkill -f 'qwen-proxy serve'");
  await new Promise(r => setTimeout(r, 1000));
  
  if (!(await isProxyRunning())) {
    log("green", "✓ Proxy stopped");
  } else {
    log("red", "Failed to stop proxy");
  }
}

async function restart() {
  await stop();
  await start();
}

async function status() {
  log("cyan", "=== Qwen Proxy Status ===\n");

  // Check proxy
  const running = await isProxyRunning();
  log(running ? "green" : "red", `Proxy: ${running ? "Running" : "Stopped"}`);

  // Check accounts
  const { stdout: authList } = await run("qwen-proxy auth list");
  console.log("\n" + authList);

  // If running, show health
  if (running) {
    try {
      const resp = await fetch(`${PROXY_URL}/health`);
      const health = await resp.json() as any;
      console.log("Health Summary:");
      console.log(`  Total accounts: ${health.summary?.total}`);
      console.log(`  Healthy: ${health.summary?.healthy}`);
      console.log(`  Requests today: ${health.summary?.total_requests_today}`);
    } catch {}
  }
}

async function test() {
  log("cyan", "Testing proxy with sample request...\n");

  if (!(await isProxyRunning())) {
    log("red", "Proxy is not running. Start it first with 'start'");
    process.exit(1);
  }

  try {
    const resp = await fetch(`${PROXY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen3-coder-flash",
        messages: [{ role: "user", content: "Say hello in exactly 3 words" }],
        max_tokens: 20,
      }),
    });

    const data = await resp.json() as any;
    
    if (data.error) {
      log("red", `Error: ${data.error.message || JSON.stringify(data.error)}`);
      process.exit(1);
    }

    log("green", "✓ Request successful!\n");
    console.log("Model:", data.model);
    console.log("Response:", data.choices?.[0]?.message?.content);
    console.log("Usage:", JSON.stringify(data.usage));
  } catch (err) {
    log("red", `Request failed: ${err}`);
    process.exit(1);
  }
}

async function models() {
  if (!(await isProxyRunning())) {
    log("red", "Proxy is not running. Start it first with 'start'");
    process.exit(1);
  }

  try {
    const resp = await fetch(`${PROXY_URL}/v1/models`);
    const data = await resp.json() as any;
    
    log("cyan", "Available Models:\n");
    for (const model of data.data || []) {
      console.log(`  ${model.id}`);
    }
  } catch (err) {
    log("red", `Failed to fetch models: ${err}`);
  }
}

async function usage() {
  const { stdout } = await run("qwen-proxy usage");
  console.log(stdout);
}

async function tunnel() {
  console.log(`${COLORS.cyan}Creating Cloudflare tunnel...${COLORS.reset}`);
  
  // Check if tunnel already running
  const { stdout: pgrep } = await run("pgrep -f 'cloudflared tunnel'");
  if (pgrep.trim()) {
    const logFile = Bun.file(CLOUDFLARED_LOG);
    if (await logFile.exists()) {
      const content = await logFile.text();
      const match = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match) {
        console.log(`${COLORS.green}Tunnel already running${COLORS.reset}`);
        console.log(`\n  Public URL: ${COLORS.cyan}${match[0]}${COLORS.reset}`);
        console.log(`  OpenAI Endpoint: ${COLORS.cyan}${match[0]}/v1${COLORS.reset}`);
        console.log(`\n  Use in Zo BYOK:`);
        console.log(`    Base URL: ${match[0]}/v1`);
        console.log(`    API Key: any`);
        console.log(`    Model: qwen3-coder-flash`);
        return;
      }
    }
  }
  
  // Start new tunnel
  await run("pkill -f 'cloudflared tunnel' 2>/dev/null || true");
  await run(`nohup cloudflared tunnel --url http://localhost:${PROXY_PORT} > ${CLOUDFLARED_LOG} 2>&1 &`);
  
  // Wait for tunnel to be ready
  console.log("  Waiting for tunnel to initialize...");
  await sleep(5);
  
  const logFile = Bun.file(CLOUDFLARED_LOG);
  const content = await logFile.text();
  const match = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  
  if (match) {
    console.log(`${COLORS.green}✓ Tunnel created successfully!${COLORS.reset}`);
    console.log(`\n  Public URL: ${COLORS.cyan}${match[0]}${COLORS.reset}`);
    console.log(`  OpenAI Endpoint: ${COLORS.cyan}${match[0]}/v1${COLORS.reset}`);
    console.log(`\n  Use in Zo BYOK:`);
    console.log(`    Base URL: ${match[0]}/v1`);
    console.log(`    API Key: any`);
    console.log(`    Model: qwen3-coder-flash`);
  } else {
    console.log(`${COLORS.red}✗ Failed to create tunnel${COLORS.reset}`);
    console.log("  Check log:", CLOUDFLARED_LOG);
  }
}

// CLI
const [,, cmd] = process.argv;

switch (cmd) {
  case "setup":
    setup();
    break;
  case "start":
    start();
    break;
  case "stop":
    stop();
    break;
  case "restart":
    restart();
    break;
  case "status":
    status();
    break;
  case "test":
    test();
    break;
  case "models":
    models();
    break;
  case "usage":
    usage();
    break;
  case "tunnel":
    tunnel();
    break;
  default:
    console.log(`
Qwen Proxy Management CLI

Usage: bun proxy.ts <command>

Commands:
  setup    Install qwen-proxy and extract credentials from qwen-code
  start    Start the proxy server
  stop     Stop the proxy server
  restart  Restart the proxy server
  status   Check proxy and account status
  test     Test the proxy with a sample request
  models   List available models
  usage    Show daily usage count
  tunnel   Create a cloudflare tunnel for public access
`);
}

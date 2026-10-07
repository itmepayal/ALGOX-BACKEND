const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const names = ["auth", "problems", "submissions", "leaderboard", "evaluation", "analytics", "discussion", "content", "realtime"];
const prefixes = ["auth", "problems", "submissions", "leaderboard", "evaluation", "analytics", "discussion", "content", "realtime"];
const vars = ["AUTH", "PROBLEM", "SUBMISSION", "LEADERBOARD", "EVALUATION", "ANALYTICS", "DISCUSSION", "CONTENT", "REALTIME"];
const upstreams = [];
const upstreamPorts = {};
let gateway;
let gatewayPort;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

async function startUpstreams() {
  for (const name of names) {
    const server = http.createServer((req, res) => {
      if (req.url.includes("/slow")) return setTimeout(() => res.end("late"), 300);
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        res.statusCode = 201;
        res.setHeader("content-type", "application/json");
        res.setHeader("set-cookie", "gateway_test=ok; Path=/; HttpOnly");
        res.setHeader("location", `http://127.0.0.1:${server.address().port}/api/v1/redirected`);
        res.end(JSON.stringify({ name, url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString("base64") }));
      });
    });
    server.on("upgrade", (req, socket) => {
      const accept = crypto.createHash("sha1").update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      socket.end();
    });
    upstreams.push(server);
    upstreamPorts[name] = await listen(server);
  }
}

async function startGateway() {
  const probe = net.createServer();
  gatewayPort = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const gatewayDir = path.resolve(__dirname, "..");
  const env = {
    ...process.env,
    NODE_ENV: "test",
    GATEWAY_PORT: String(gatewayPort),
    GATEWAY_TIMEOUT_MS: "100",
    GATEWAY_SUBMISSION_TIMEOUT_MS: "100",
    GATEWAY_EVALUATION_TIMEOUT_MS: "100",
    GATEWAY_MAX_BODY_BYTES: "1024",
    CLIENT_URL: "http://localhost:5173",
  };
  for (let i = 0; i < names.length; i++) env[`${vars[i]}_SERVICE_URL`] = `http://127.0.0.1:${upstreamPorts[names[i]]}`;
  gateway = spawn(process.execPath, ["src/server.js"], { cwd: gatewayDir, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  gateway.stdout.on("data", (chunk) => { output += chunk; });
  gateway.stderr.on("data", (chunk) => { output += chunk; });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited during startup: ${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Gateway did not start: ${output}`);
}

async function testRoutingAndHeaders() {
  for (let i = 0; i < names.length; i++) {
    const pathPrefix = `/api/${prefixes[i]}`;
    const response = await fetch(`http://127.0.0.1:${gatewayPort}${pathPrefix}/api/v1/probe?q=ok`, {
      headers: { authorization: "Bearer unchanged", cookie: "session=secret", "x-request-id": `req-${names[i]}` },
    });
    assert.equal(response.status, 201, `${names[i]} response status`);
    assert.equal(response.headers.get("x-request-id"), `req-${names[i]}`);
    assert.equal(response.headers.get("x-correlation-id"), `req-${names[i]}`);
    assert.match(response.headers.get("set-cookie") || "", /gateway_test=ok/);
    assert.equal(response.headers.get("location"), `/api/${prefixes[i]}/api/v1/redirected`, "internal redirect is mapped to the public namespace");
    const body = await response.json();
    assert.equal(body.name, names[i]);
    assert.equal(body.url, "/api/v1/probe?q=ok");
    assert.equal(body.headers.authorization, "Bearer unchanged");
    assert.equal(body.headers.cookie, "session=secret");
    assert.equal(body.headers["x-request-id"], `req-${names[i]}`);
    assert.equal(body.headers["x-correlation-id"], `req-${names[i]}`);
  }
}

async function testMultipart() {
  const boundary = "----algopath-gateway-boundary";
  const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="asset"; filename="x.bin"\r\nContent-Type: application/octet-stream\r\n\r\n\u0000\u0001bytes\r\n--${boundary}--\r\n`, "binary");
  const response = await fetch(`http://127.0.0.1:${gatewayPort}/api/content/api/v1/upload-probe`, {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(body.length) },
    body,
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(Buffer.from(result.body, "base64").compare(body), 0, "multipart bytes are unchanged");
  assert.equal(result.headers["content-type"], `multipart/form-data; boundary=${boundary}`);
}

async function testTimeoutAndLimit() {
  const timed = await fetch(`http://127.0.0.1:${gatewayPort}/api/analytics/api/v1/slow`);
  assert.equal(timed.status, 504);
  const oversize = await fetch(`http://127.0.0.1:${gatewayPort}/api/auth/api/v1/large`, {
    method: "POST", headers: { "content-length": "2048", "content-type": "application/octet-stream" }, body: Buffer.alloc(2048),
  });
  assert.equal(oversize.status, 413);
}

async function testCorsAndSocketUpgrade() {
  const preflight = await fetch(`http://127.0.0.1:${gatewayPort}/api/problems/api/v1/probe`, {
    method: "OPTIONS", headers: { origin: "http://localhost:5173", "access-control-request-method": "GET", "access-control-request-headers": "authorization,content-type" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:5173");
  const denied = await fetch(`http://127.0.0.1:${gatewayPort}/api/problems/api/v1/probe`, { headers: { origin: "https://attacker.invalid" } });
  assert.equal(denied.status, 403);
  const missing = await fetch(`http://127.0.0.1:${gatewayPort}/not-a-route`);
  assert.equal(missing.status, 404);

  const key = crypto.randomBytes(16).toString("base64");
  const socket = net.connect(gatewayPort, "127.0.0.1");
  let received = "";
  socket.on("data", (chunk) => { received += chunk.toString("latin1"); });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  socket.write(`GET /api/realtime/socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: localhost:${gatewayPort}\r\nOrigin: http://localhost:5173\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  await new Promise((resolve) => { socket.once("close", resolve); setTimeout(resolve, 1000); });
  assert.match(received, /^HTTP\/1\.1 101 Switching Protocols/, `Socket.IO WebSocket upgrade proxied: ${received.slice(0, 120)}`);
}

async function testGatewayDocsAndHealth() {
  const [health, services, openapi, docs] = await Promise.all([
    fetch(`http://127.0.0.1:${gatewayPort}/health`),
    fetch(`http://127.0.0.1:${gatewayPort}/health/services`),
    fetch(`http://127.0.0.1:${gatewayPort}/openapi.json`),
    fetch(`http://127.0.0.1:${gatewayPort}/api-docs`),
  ]);
  assert.equal(health.status, 200);
  assert.equal(services.status, 200);
  assert.equal(Object.keys((await services.json()).services).length, 9);
  assert.equal(openapi.status, 200);
  assert.equal((await openapi.json()).openapi, "3.0.3");
  assert.equal(docs.status, 200);
  assert.match(await docs.text(), /SwaggerUIBundle/);
}

async function testUnavailableUpstream() {
  const realtime = upstreams[names.indexOf("realtime")];
  await new Promise((resolve) => realtime.close(resolve));
  const response = await fetch(`http://127.0.0.1:${gatewayPort}/api/realtime/health`);
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.equal(result.message, "Upstream service is unavailable");
}

async function cleanup() {
  if (gateway && gateway.exitCode === null) {
    gateway.kill("SIGTERM");
    await new Promise((resolve) => gateway.once("exit", resolve));
  }
  await Promise.all(upstreams.map((server) => new Promise((resolve) => server.close(resolve))));
}

(async () => {
  try {
    await startUpstreams();
    await startGateway();
    const live = await fetch(`http://127.0.0.1:${gatewayPort}/health`);
    assert.equal(live.status, 200);
    await testGatewayDocsAndHealth();
    await testRoutingAndHeaders();
    await testMultipart();
    await testTimeoutAndLimit();
    await testCorsAndSocketUpgrade();
    await testUnavailableUpstream();
    console.log("PASS gateway liveness/docs/upstream health, nine routes, status/header/cookie/auth forwarding, internal redirect rewrite, multipart preservation, timeout, body limit, CORS allow/deny, 404/503 errors, and WebSocket upgrade");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
})();

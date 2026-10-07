const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { io } = require(path.resolve(__dirname, "../../../client/node_modules/socket.io-client"));
const jwt = require(path.resolve(__dirname, "../../RealtimeService/node_modules/jsonwebtoken"));

const gatewayDir = path.resolve(__dirname, "..");
const realtimeDir = path.resolve(__dirname, "../../RealtimeService");
const secret = "algopath-gateway-realtime-integration-test-secret";
let gatewayPort;
let realtimePort;
let gateway;
let realtime;
const children = [];

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function start(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  child.output = "";
  child.stdout.on("data", (chunk) => { child.output += chunk; });
  child.stderr.on("data", (chunk) => { child.output += chunk; });
  children.push(child);
  return child;
}

async function waitHttp(url, child) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Service exited before ready: ${child.output.slice(-3000)}`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Service did not become ready: ${child.output.slice(-3000)}`);
}

async function startServices() {
  gatewayPort = await freePort();
  realtimePort = await freePort();
  const realtimeEnv = {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(realtimePort),
    JWT_SECRET: secret,
    MONGO_URL: "",
    REDIS_URL: "",
    CORS_ORIGIN: "http://localhost:5173",
  };
  realtime = start(process.execPath, ["-r", "ts-node/register/transpile-only", "src/server.ts"], realtimeDir, realtimeEnv);
  await waitHttp(`http://127.0.0.1:${realtimePort}/health`, realtime);

  const gatewayEnv = {
    ...process.env,
    NODE_ENV: "test",
    GATEWAY_PORT: String(gatewayPort),
    GATEWAY_TIMEOUT_MS: "10000",
    REALTIME_SERVICE_URL: `http://127.0.0.1:${realtimePort}`,
    CLIENT_URL: "http://localhost:5173",
  };
  gateway = start(process.execPath, ["src/server.js"], gatewayDir, gatewayEnv);
  await waitHttp(`http://127.0.0.1:${gatewayPort}/health`, gateway);
}

async function connectThroughGateway(transport) {
  const token = jwt.sign({ userId: "507f1f77bcf86cd799439011", email: "gateway-test@example.invalid", role: "user" }, secret, { expiresIn: "2m" });
  const socket = io(`http://127.0.0.1:${gatewayPort}`, {
    path: "/api/realtime/socket.io",
    transports: [transport],
    auth: { token },
    extraHeaders: { Origin: "http://localhost:5173" },
    timeout: 8000,
    reconnection: false,
  });
  try {
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
      setTimeout(() => reject(new Error(`Socket.IO ${transport} connection timed out`)), 9000).unref();
    });
    assert.equal(socket.connected, true);
  } finally {
    socket.disconnect();
  }
}

async function cleanup() {
  for (const child of children.reverse()) {
    if (child.exitCode !== null) continue;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

(async () => {
  try {
    await startServices();
    await connectThroughGateway("polling");
    await connectThroughGateway("websocket");
    console.log("PASS actual RealtimeService Socket.IO authentication and polling/WebSocket connections through the gateway");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
})();

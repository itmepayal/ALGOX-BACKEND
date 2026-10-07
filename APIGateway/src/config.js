const fs = require("node:fs");
const path = require("node:path");

// Load this service's local env file without adding a runtime dependency.
const envFile = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    process.env[match[1]] = value;
  }
}

const serviceDefinitions = [
  ["auth", "AUTH_SERVICE_URL", 3001, "/api/auth", "/api/v1/health"],
  ["problems", "PROBLEM_SERVICE_URL", 3003, "/api/problems", "/api/v1/health"],
  [
    "submissions",
    "SUBMISSION_SERVICE_URL",
    3004,
    "/api/submissions",
    "/api/v1/health",
  ],
  [
    "leaderboard",
    "LEADERBOARD_SERVICE_URL",
    3005,
    "/api/leaderboard",
    "/api/v1/health",
  ],
  ["evaluation", "EVALUATION_SERVICE_URL", 3006, "/api/evaluation", "/health"],
  [
    "analytics",
    "ANALYTICS_SERVICE_URL",
    3007,
    "/api/analytics",
    "/api/v1/health",
  ],
  ["discussion", "DISCUSSION_SERVICE_URL", 3008, "/api/discussion", "/health"],
  ["content", "CONTENT_SERVICE_URL", 3009, "/api/content", "/health"],
  ["realtime", "REALTIME_SERVICE_URL", 3010, "/api/realtime", "/health"],
];

function serviceUrl(envName, port) {
  const value = process.env[envName] || `http://localhost:${port}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${envName} must be an absolute HTTP(S) URL`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${envName} must be an HTTP(S) origin/base URL without credentials, query, or fragment`,
    );
  }
  return url;
}

const services = serviceDefinitions.map(
  ([name, envName, port, prefix, healthPath]) => ({
    name,
    envName,
    prefix,
    healthPath,
    url: serviceUrl(envName, port),
  }),
);

const positiveInt = (name, fallback) => {
  const n = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(n) || n <= 0)
    throw new Error(`${name} must be a positive integer`);
  return n;
};

const production = process.env.NODE_ENV === "production";
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  process.env.CLIENT_URL ||
  "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (allowedOrigins.includes("*"))
  throw new Error("Gateway CORS does not allow wildcard origins");
if (production && !process.env.ALLOWED_ORIGINS && !process.env.CLIENT_URL) {
  throw new Error("Production gateway requires ALLOWED_ORIGINS or CLIENT_URL");
}

module.exports = {
  port: positiveInt("GATEWAY_PORT", 3000),
  timeoutMs: positiveInt("GATEWAY_TIMEOUT_MS", 30000),
  submissionTimeoutMs: positiveInt("GATEWAY_SUBMISSION_TIMEOUT_MS", 120000),
  evaluationTimeoutMs: positiveInt("GATEWAY_EVALUATION_TIMEOUT_MS", 120000),
  maxBodyBytes: positiveInt("GATEWAY_MAX_BODY_BYTES", 52428800),
  shutdownGraceMs: positiveInt("GATEWAY_SHUTDOWN_GRACE_MS", 10000),
  allowedOrigins,
  production,
  services,
};

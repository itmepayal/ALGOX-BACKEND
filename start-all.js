import { spawn, execSync } from "child_process";

console.log("==================================================");
console.log("🚀 Launching All LeetCode Microservices...");
console.log("==================================================\n");

const services = [
  { name: "AuthService", port: 3001, path: "AuthService" },
  { name: "ProblemService", port: 3003, path: "ProblemService" },
  { name: "SubmissionService", port: 3004, path: "SubmissionService" },
  { name: "LeaderboardService", port: 3005, path: "LeaderboardService" },
  { name: "EvaluationService", port: 3006, path: "EvaluationService" },
  { name: "AnalyticsService", port: 3007, path: "AnalyticsService" },
  { name: "DiscussionService", port: 3008, path: "DiscussionService" },
  { name: "ContentService", port: 3009, path: "ContentService" },
  { name: "RealtimeService", port: 3010, path: "RealtimeService" },
];

const children = new Map();
let shuttingDown = false;

function freePort(port) {
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: "ignore" });
  } catch {
    // ignore
  }
}

function startService(s, attempt = 0) {
  if (shuttingDown) return;

  console.log(
    `[+] Starting ${s.name} on http://localhost:${s.port}` +
      (attempt > 0 ? ` (retry ${attempt})` : "") +
      "..."
  );

  const child = spawn("npm", ["run", "dev"], {
    cwd: `./${s.path}`,
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(s.port),
    },
  });

  children.set(s.name, child);

  child.on("error", (err) => {
    console.error(`[-] ${s.name} error:`, err.message);
  });

  child.on("exit", (code, signal) => {
    children.delete(s.name);
    if (shuttingDown) return;
    console.error(
      `[-] ${s.name} exited (code=${code}, signal=${signal}). Auto-restarting in ${Math.min(2 + attempt, 15)}s...`
    );
    const delay = Math.min(2000 * (attempt + 1), 15000);
    setTimeout(() => startService(s, attempt + 1), delay);
  });
}

// Kill stale listeners so hung processes cannot swallow requests
for (const s of services) {
  console.log(`[~] Freeing port ${s.port}...`);
  freePort(s.port);
}

for (const s of services) {
  startService(s);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n[~] Stopping all microservices...");
  for (const child of children.values()) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("\n✅ All Microservices launched! Press Ctrl+C to stop all.\n");

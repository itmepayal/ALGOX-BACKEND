import { spawn, execSync } from "child_process";

console.log("==================================================");
console.log("🚀 Launching All LeetCode Microservices...");
console.log("==================================================\n");

const services = [
  { name: "AuthService", port: 3001, path: "AuthService" },
  { name: "ProblemService", port: 3003, path: "ProblemService" },
  { name: "SubmissionService", port: 3004, path: "SubmissionService" },
  { name: "EvaluationService", port: 3006, path: "EvaluationService" },
];

function freePort(port) {
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: "ignore" });
  } catch {
    // ignore
  }
}

// Kill stale listeners so hung processes cannot swallow requests
for (const s of services) {
  console.log(`[~] Freeing port ${s.port}...`);
  freePort(s.port);
}

services.forEach((s) => {
  console.log(`[+] Starting ${s.name} on http://localhost:${s.port}...`);
  const child = spawn("npm", ["run", "dev"], {
    cwd: `./${s.path}`,
    shell: true,
    stdio: "inherit",
  });

  child.on("error", (err) => {
    console.error(`[-] ${s.name} error:`, err.message);
  });
});

console.log("\n✅ All Microservices launched! Press Ctrl+C to stop all.\n");

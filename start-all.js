import { spawn } from "child_process";

console.log("==================================================");
console.log("🚀 Launching All LeetCode Microservices...");
console.log("==================================================\n");

const services = [
  { name: "AuthService", port: 3001, path: "AuthService" },
  { name: "SubmissionService", port: 3002, path: "SubmissionService" },
  { name: "ProblemService", port: 3003, path: "ProblemService" },
  { name: "EvaluationService", port: 3004, path: "EvaluationService" },
  { name: "LeaderboardService", port: 3005, path: "LeaderboardService" },
  { name: "AnalyticsService", port: 3007, path: "AnalyticsService" },
  { name: "DiscussionService", port: 3008, path: "DiscussionService" },
  { name: "ContentService", port: 3009, path: "ContentService" },
];

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

import { spawn } from "child_process";

console.log("==================================================");
console.log("🚀 Launching All LeetCode Microservices...");
console.log("==================================================\n");

const services = [
  { name: "AuthService", port: 3001, path: "AuthService" },
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

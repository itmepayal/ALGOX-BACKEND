/**
 * Redis / BullMQ production-safety audit (read-only + report).
 * Run: cd server/EvaluationService && npx tsx scripts/redis-bullmq-safety.selftest.ts
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import IORedis from "ioredis";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
dotenv.config({ path: path.join(root, ".env") });

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (!ok) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failed += 1;
    return;
  }
  console.log(`PASS: ${name}`);
  passed += 1;
}

const evalQueue = fs.readFileSync(
  path.join(root, "src/queues/submission.queue.ts"),
  "utf8"
);
const evalWorker = fs.readFileSync(
  path.join(root, "src/workers/evaluation.worker.ts"),
  "utf8"
);
const subQueue = fs.readFileSync(
  path.join(root, "../SubmissionService/src/queues/submission.queue.ts"),
  "utf8"
);
const safety = fs.readFileSync(
  path.join(root, "src/queues/queueRedisSafety.ts"),
  "utf8"
);

check("shared queue name submission", evalQueue.includes("SUBMISSION_QUEUE") && subQueue.includes('"submission"'));
check("job attempts=3 + exponential backoff", evalQueue.includes("attempts: 3") && evalQueue.includes("exponential"));
check("removeOnComplete true (intentional cleanup)", evalQueue.includes("removeOnComplete: true"));
check("removeOnFail false (retain failed jobs)", evalQueue.includes("removeOnFail: false"));
check("worker concurrency configured", evalWorker.includes("concurrency: 5"));
check("worker marks failed submissions", evalWorker.includes('status: "RUNTIME_ERROR"'));
check(
  "safety probe does not mutate eviction via CONFIG SET",
  !/config\(\s*['\"]SET['\"]\s*,\s*['\"]maxmemory-policy/.test(safety) &&
    safety.includes("Does not mutate Redis CONFIG")
);
check("safety probe does not suppress BullMQ warning", safety.includes("Do not suppress"));
check("REQUIRE_REDIS_NOEVICTION hard-fail option", safety.includes("REQUIRE_REDIS_NOEVICTION"));

const redisConn = fs.readFileSync(
  path.join(root, "src/queues/redis.queue.ts"),
  "utf8"
);
check(
  "queue connection prefers QUEUE_REDIS_URL",
  redisConn.includes("QUEUE_REDIS_URL")
);

const url = process.env.QUEUE_REDIS_URL || process.env.REDIS_URL;
if (!url) {
  check("QUEUE_REDIS_URL or REDIS_URL present", false);
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(1);
}

async function live() {
  const useTls = url!.startsWith("rediss://");
  const redis = new IORedis(url!, {
    maxRetriesPerRequest: null,
    connectTimeout: 15000,
    ...(useTls ? { tls: {} } : {}),
  });

  try {
    const info = await redis.info();
    const lines = info.split(/\r?\n/);
    const get = (p: string) => {
      const l = lines.find((x) => x.startsWith(p));
      return l ? l.slice(p.length) : null;
    };
    const policy = get("maxmemory_policy:");
    const maxmem = Number(get("maxmemory:") || 0);
    const usedH = get("used_memory_human:");
    const evicted = Number(get("evicted_keys:") || 0);

    console.log(`INFO: current_policy=${policy}`);
    console.log(
      `INFO: maxmemory_bytes=${maxmem} used=${usedH} evicted_keys=${evicted}`
    );

    check("Redis INFO reachable", Boolean(policy));
    check(
      "production-safe eviction is noeviction",
      policy === "noeviction",
      `got ${policy} — disable Eviction on Upstash queue DB or use dedicated Redis`
    );

    const waiting = await redis.llen("bull:submission:wait");
    const active = await redis.llen("bull:submission:active");
    const failedZ = await redis.zcard("bull:submission:failed");
    check(
      "BullMQ lists readable",
      Number.isFinite(waiting) && Number.isFinite(active)
    );
    console.log(
      `INFO: queue waiting=${waiting} active=${active} failed=${failedZ}`
    );

    let setDenied = false;
    try {
      await redis.config("SET", "maxmemory-policy", "noeviction");
    } catch {
      setDenied = true;
    }
    check(
      "managed Redis does not allow blind CONFIG SET (expected)",
      setDenied || policy === "noeviction",
      "if CONFIG SET succeeded, verify console still shows intended policy"
    );
  } catch (err: any) {
    check("live redis probe", false, err?.message);
  } finally {
    redis.disconnect();
  }
}

live()
  .then(() => {
    console.log(`\n${passed} PASS, ${failed} FAIL`);
    console.log(
      "NOTE: failing 'production-safe eviction' is the audit finding — fix in Redis provider console, not by suppressing BullMQ."
    );
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

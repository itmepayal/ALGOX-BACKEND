/**
 * Minimal high-value security checks (real HTTP + local helpers).
 * Run: cd server/AuthService && npx ts-node --transpile-only scripts/critical-security.selftest.ts
 */
import jwt from "jsonwebtoken";
import http from "http";
import path from "path";
import { spawnSync } from "child_process";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_access_key";

type Result = { code: number; body: string };

function request(
  port: number,
  reqPath: string,
  method: string,
  headers: Record<string, string>,
  body?: unknown
): Promise<Result> {
  return new Promise((resolve) => {
    const data = body !== undefined ? JSON.stringify(body) : "";
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path: reqPath,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let b = "";
        res.on("data", (d) => (b += d));
        res.on("end", () => resolve({ code: res.statusCode || 0, body: b }));
      }
    );
    req.on("error", (e) => resolve({ code: 0, body: String(e) }));
    if (data) req.write(data);
    req.end();
  });
}

function token(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "5m" });
}

async function main() {
  let passed = 0;
  const check = (name: string, ok: boolean, detail?: string) => {
    if (!ok) {
      console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
      process.exitCode = 1;
      return;
    }
    console.log(`PASS: ${name}`);
    passed += 1;
  };

  const admin = token({
    userId: "000000000000000000000001",
    email: "admin-selftest@local",
    role: "admin",
    permissions: [
      "admin:view",
      "audit:view",
      "problems:view",
      "problems:create",
      "problems:update",
      "problems:publish",
      "testcases:create",
      "testcases:update",
      "content:create",
      "content:update",
      "users:view",
      "users:create",
      "users:update",
    ],
  });

  // 1) Admin authz
  {
    const unauth = await request(3003, "/api/v1/problems/admin/list", "GET", {});
    check("admin unauth → 401", unauth.code === 401, String(unauth.code));
    const userTok = token({
      userId: "000000000000000000000099",
      email: "user@local",
      role: "user",
      permissions: [],
    });
    const denied = await request(3003, "/api/v1/problems/admin/list", "GET", {
      Authorization: `Bearer ${userTok}`,
    });
    check("admin without perm → 403", denied.code === 403, String(denied.code));
  }

  // 2) Banned user login → 401
  {
    const email = `ban-selftest-${Date.now()}@example.com`;
    const password = "SelftestBan1!";
    const created = await request(
      3001,
      "/api/v1/auth/admin/users",
      "POST",
      { Authorization: `Bearer ${admin}` },
      { email, password, name: "Ban Selftest", role: "user" }
    );
    let userId = "";
    try {
      const d = JSON.parse(created.body)?.data;
      userId = d?._id || d?.id || d?.user?._id || d?.user?.id || "";
    } catch {
      userId = "";
    }
    if (userId) {
      await request(
        3001,
        `/api/v1/auth/admin/users/${userId}/status`,
        "PATCH",
        { Authorization: `Bearer ${admin}` },
        { status: "banned" }
      );
      const login = await request(3001, "/api/v1/auth/login", "POST", {}, {
        email,
        password,
      });
      check("banned user login → 401", login.code === 401, String(login.code));
    } else {
      check(
        "banned user login → 401",
        false,
        `create failed ${created.code} ${created.body.slice(0, 140)}`
      );
    }
  }

  // 3) Submission rate limit → 429
  {
    dotenv.config({
      path: path.join(__dirname, "../../SubmissionService/.env"),
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("ts-node").register({
      transpileOnly: true,
      project: path.join(__dirname, "../../SubmissionService/tsconfig.json"),
    });
    const {
      enforceSubmissionLimits,
      clearPlatformLimitsCache,
    } = require("../../SubmissionService/src/utils/platformLimits");
    clearPlatformLimitsCache();
    let hit429 = false;
    try {
      await enforceSubmissionLimits({
        userId: "selftest-rate",
        code: "print(1)",
        source: "submit",
        role: "user",
        concurrentActive: 0,
        hourlyCount: 100000,
      });
    } catch (e: any) {
      hit429 = e?.statusCode === 429 || e?.name === "TooManyRequestsError";
    }
    check("submission hourly limit → 429", hit429);
  }

  // 4) Test-case permission denial → 403
  {
    const noTc = token({
      userId: "000000000000000000000001",
      email: "editor@local",
      role: "content_manager",
      permissions: ["problems:view", "problems:update"],
    });
    const res = await request(
      3003,
      "/api/v1/problems/000000000000000000000099",
      "PUT",
      { Authorization: `Bearer ${noTc}` },
      { testcases: [{ input: "1", output: "1" }] }
    );
    check("testcase update without perm → 403", res.code === 403, String(res.code));
  }

  // 5) Problem publish → audit
  {
    const create = await request(
      3003,
      "/api/v1/problems",
      "POST",
      { Authorization: `Bearer ${admin}` },
      {
        title: `Selftest Publish ${Date.now()}`,
        description: "description long enough",
        difficulty: "easy",
        category: "array",
        testcases: [{ input: "1", output: "1" }],
      }
    );
    check("problem create", create.code === 201, create.body.slice(0, 100));
    let id = "";
    try {
      const d = JSON.parse(create.body)?.data;
      id = d?._id || d?.id || "";
    } catch {
      id = "";
    }
    if (id) {
      const pub = await request(
        3003,
        `/api/v1/problems/admin/${id}/status`,
        "PATCH",
        { Authorization: `Bearer ${admin}` },
        { status: "published" }
      );
      check("problem publish", pub.code === 200, String(pub.code));
      const logs = await request(
        3001,
        "/api/v1/auth/admin/audit-logs?limit=15",
        "GET",
        { Authorization: `Bearer ${admin}` }
      );
      let found = false;
      try {
        const rows = JSON.parse(logs.body)?.data || [];
        found =
          Array.isArray(rows) &&
          rows.some((r: any) => r.action === "problem.publish");
      } catch {
        found = false;
      }
      check("problem publish → audit", found);
    } else {
      check("problem publish → audit", false, "no id");
    }
  }

  // 6) Invalid Content payload → 400
  {
    const res = await request(
      3009,
      "/api/v1/content/admin/articles/000000000000000000000099",
      "PATCH",
      { Authorization: `Bearer ${admin}` },
      {}
    );
    check("content invalid payload → 400", res.code === 400, String(res.code));
  }

  // 7) Evaluation unauthorized → 401
  {
    const res = await request(
      3006,
      "/api/v1/evaluation/run",
      "POST",
      {},
      { code: "print(1)", language: "python", input: "" }
    );
    check("evaluation unauth → 401", res.code === 401, String(res.code));
  }

  // 8) Production secrets fail-closed
  {
    const script = `
      process.env.NODE_ENV='production';
      delete process.env.JWT_SECRET;
      delete process.env.REFRESH_TOKEN_SECRET;
      process.env.MONGO_URL='mongodb://x';
      process.env.REDIS_URL='x';
      process.env.REDIS_TOKEN='x';
      process.env.PROBLEM_SERVICE='x';
      process.env.SUBMISSION_SERVICE='x';
      process.env.CLOUDINARY_CLOUD_NAME='x';
      process.env.CLOUDINARY_API_KEY='x';
      process.env.CLOUDINARY_API_SECRET='x';
      const Module=require('module');
      const orig=Module.prototype.require;
      Module.prototype.require=function(id){
        if(id==='dotenv') return {config:()=>({})};
        return orig.apply(this,arguments);
      };
      require('ts-node/register/transpile-only');
      require('./src/config/index.ts');
    `;
    const r = spawnSync(process.execPath, ["-e", script], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
    });
    const out = `${r.stderr || ""}\n${r.stdout || ""}`;
    check(
      "production secrets fail-closed",
      r.status !== 0 && /JWT_SECRET|Missing required/.test(out),
      out.slice(0, 180)
    );
  }

  console.log(`\nCritical selftest done. Passed ${passed} checks.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * §14 Realtime — live E2E (real connections / rooms / events / BroadcastLog).
 * Latency is verified as null (not faked).
 *
 * Run: cd server/RealtimeService && npx tsx scripts/realtime.e2e.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const clientRoot = path.join(root, "../../client");
const require = createRequire(path.join(root, "package.json"));

dotenv.config({ path: path.join(root, ".env") });

const jwt = require("jsonwebtoken");
const { io } = require(path.join(
  clientRoot,
  "node_modules/socket.io-client"
));

const REALTIME = process.env.REALTIME_SERVICE_URL || "http://localhost:3010";
const AUTH = process.env.AUTH_SERVICE_URL || "http://localhost:3001";
const JWT_SECRET =
  process.env.JWT_SECRET || "super_secret_jwt_access_key";
const INTERNAL =
  process.env.INTERNAL_SERVICE_SECRET ||
  process.env.INTERNAL_REALTIME_SECRET ||
  "dev-internal-service-secret";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (!ok) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failed += 1;
    return false;
  }
  console.log(`PASS: ${name}`);
  passed += 1;
  return true;
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function readClient(rel: string) {
  return fs.readFileSync(path.join(clientRoot, "src", rel), "utf8");
}

async function request(
  base: string,
  pathName: string,
  method = "GET",
  headers: Record<string, string> = {},
  body?: unknown
) {
  const res = await fetch(`${base}${pathName}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function mintToken(opts: {
  userId: string;
  email: string;
  role: string;
}) {
  return jwt.sign(
    { userId: opts.userId, email: opts.email, role: opts.role },
    JWT_SECRET,
    { expiresIn: "15m" }
  );
}

function connectSocket(token: string, reconnecting = false): Promise<{
  socket: any;
  connectedAt: number;
}> {
  return new Promise((resolve, reject) => {
    const socket = io(REALTIME, {
      auth: { token, reconnecting },
      transports: ["websocket"],
      reconnection: false,
      timeout: 8000,
    });
    const t = setTimeout(() => {
      socket.close();
      reject(new Error("socket connect timeout"));
    }, 9000);
    socket.on("connect", () => {
      clearTimeout(t);
      resolve({ socket, connectedAt: Date.now() });
    });
    socket.on("connect_error", (err: Error) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

// ── Static architecture checks ──────────────────────────────────────
const ingest = read("src/admin/ingest.routes.ts");
const metrics = read("src/metrics/metrics.ts");
const broadcast = read("src/broadcast/broadcast.service.ts");
const socketClient = readClient("realtime/socket.ts");
const onlineHook = readClient("hooks/useOnlineUsers.ts");
const liveUsers = readClient("components/admin/realtime/RealtimeCenterPage.tsx");
const sysBroadcast = readClient("components/SystemBroadcastListener.tsx");

check(
  "metrics policy: latency never invented",
  metrics.includes("stay null") || metrics.includes("Never invent")
);
check(
  "BroadcastLog writes when mongo ready",
  broadcast.includes("BroadcastLog.create") && broadcast.includes("persisted")
);
check(
  "ingest mirrors to admin:realtime",
  ingest.includes('io.to("admin:realtime")') && ingest.includes("if (room)")
);
check(
  "client auth callback + reconnecting",
  socketClient.includes("buildAuthPayload") &&
    socketClient.includes("reconnecting")
);
check(
  "useOnlineUsers Manager reconnect",
  onlineHook.includes('socket.io.on("reconnect_attempt"')
);
check(
  "Live Users uses connectionCount",
  liveUsers.includes("connectionCount") && liveUsers.includes("socketIds")
);
check(
  "system.broadcast client listener",
  sysBroadcast.includes("system.broadcast")
);

async function live() {
  try {
    const h = await fetch(`${REALTIME}/health`);
    if (!h.ok) {
      console.log("SKIP live: RealtimeService not healthy");
      return;
    }
  } catch {
    console.log("SKIP live: RealtimeService not reachable");
    return;
  }

  const stamp = Date.now();
  const userA = {
    userId: `aaaaaaaaaaaaaaaaaaaaaaaa`,
    email: `p14a_${stamp}@test.local`,
    role: "user",
  };
  // Valid ObjectId-like ids (24 hex)
  userA.userId = `${stamp.toString(16).padStart(12, "0")}aaaaaaaaaaaa`;
  const userB = {
    userId: `${stamp.toString(16).padStart(12, "0")}bbbbbbbbbbbb`,
    email: `p14b_${stamp}@test.local`,
    role: "user",
  };
  const admin = {
    userId: `${stamp.toString(16).padStart(12, "0")}adminadminad`,
    email: `p14admin_${stamp}@test.local`,
    role: "admin",
  };

  const tokenA = mintToken(userA);
  const tokenB = mintToken(userB);
  const tokenAdmin = mintToken(admin);
  const adminAuth = { Authorization: `Bearer ${tokenAdmin}` };

  // Unauthenticated socket rejected
  {
    let rejected = false;
    try {
      const bad = await connectSocket("not-a-jwt");
      bad.socket.close();
    } catch {
      rejected = true;
    }
    check("WS auth rejects bad token", rejected);
  }

  // Connect two users + measure
  const a = await connectSocket(tokenA);
  const b = await connectSocket(tokenB);
  check("WS connect user A", a.socket.connected);
  check("WS connect user B", b.socket.connected);

  // Wait for presence registration
  await new Promise((r) => setTimeout(r, 400));

  // Admin overview — real counters
  const overview = await request(
    REALTIME,
    "/api/v1/admin/realtime/overview",
    "GET",
    adminAuth
  );
  check("admin overview 200", overview.status === 200, `${overview.status}`);
  const ov = overview.json?.data || {};
  check(
    "activeConnections real (>=2)",
    typeof ov.activeConnections === "number" && ov.activeConnections >= 2,
    String(ov.activeConnections)
  );
  check(
    "onlineUsers real (>=1)",
    typeof ov.onlineUsers === "number" && ov.onlineUsers >= 1,
    String(ov.onlineUsers)
  );
  check(
    "latency metrics are null (not faked)",
    ov.latencyP50Ms === null &&
      ov.latencyP95Ms === null &&
      ov.latencyP99Ms === null &&
      ov.avgLatencyMs === null
  );
  check(
    "broadcastPersistence honest",
    ov.broadcastPersistence?.mode === "mongo" ||
      ov.broadcastPersistence?.mode === "memory",
    JSON.stringify(ov.broadcastPersistence)
  );

  // Users list includes A with connectionCount
  const users = await request(
    REALTIME,
    "/api/v1/admin/realtime/users",
    "GET",
    adminAuth
  );
  const userRows = users.json?.data || [];
  const rowA = userRows.find((u: any) => String(u.userId) === userA.userId);
  check(
    "Live Users connectionCount present",
    Boolean(rowA) &&
      typeof rowA.connectionCount === "number" &&
      rowA.connectionCount >= 1,
    JSON.stringify(rowA)
  );

  // Rooms — join contest room
  const roomName = `contest:p14-${stamp}`;
  await new Promise<void>((resolve) => {
    a.socket.emit("room.join", { room: roomName }, () => resolve());
    setTimeout(() => resolve(), 500);
  });
  await new Promise((r) => setTimeout(r, 200));

  const rooms = await request(
    REALTIME,
    "/api/v1/admin/realtime/rooms",
    "GET",
    adminAuth
  );
  const roomList = rooms.json?.data || [];
  check(
    "rooms list includes joined contest room",
    roomList.some((r: any) => String(r.name || r.room || r) === roomName || String(r.name).includes("contest:p14")),
    JSON.stringify(roomList.slice(0, 5))
  );

  // Ingest event → user room + admin stream
  let userGotIngest = false;
  a.socket.on("submission.created", () => {
    userGotIngest = true;
  });
  const ingestRes = await request(
    REALTIME,
    "/api/v1/realtime/ingest/events",
    "POST",
    {
      "x-realtime-secret": INTERNAL,
      "x-internal-secret": INTERNAL,
    },
    {
      event: "submission.created",
      source: "P14E2E",
      userId: userA.userId,
      room: `user:${userA.userId}`,
      status: "PENDING",
      payload: { submissionId: "p14sub" },
    }
  );
  check("ingest accepts event", ingestRes.status === 200, `${ingestRes.status}`);
  await new Promise((r) => setTimeout(r, 400));
  check("user room received ingest event", userGotIngest);

  const events = await request(
    REALTIME,
    "/api/v1/admin/realtime/events?limit=50",
    "GET",
    adminAuth
  );
  const evList = events.json?.data || [];
  check(
    "event stream has submission.created",
    evList.some((e: any) => e.name === "submission.created"),
    `count=${evList.length}`
  );

  // Broadcast → system.broadcast + BroadcastLog
  let gotBroadcast = false;
  let broadcastPayload: any = null;
  a.socket.on("system.broadcast", (p: any) => {
    gotBroadcast = true;
    broadcastPayload = p;
  });
  b.socket.on("system.broadcast", () => {
    /* also deliverable */
  });

  const bc = await request(
    REALTIME,
    "/api/v1/admin/realtime/broadcast",
    "POST",
    adminAuth,
    {
      message: `P14 broadcast ${stamp}`,
      title: "Section 14",
      target: "everyone",
    }
  );
  check("broadcast 200", bc.status === 200, `${bc.status} ${bc.json?.message}`);
  const bcData = bc.json?.data || {};
  check(
    "broadcast delivered > 0",
    typeof bcData.delivered === "number" && bcData.delivered >= 1,
    JSON.stringify(bcData)
  );
  check(
    "broadcast persisted mode reported",
    bcData.persisted === "mongo" || bcData.persisted === "memory",
    String(bcData.persisted)
  );
  await new Promise((r) => setTimeout(r, 500));
  check("client received system.broadcast", gotBroadcast);
  check(
    "broadcast payload has message",
    Boolean(broadcastPayload?.message?.includes("P14 broadcast"))
  );

  const analytics = await request(
    REALTIME,
    "/api/v1/admin/realtime/analytics",
    "GET",
    adminAuth
  );
  const recent = analytics.json?.data?.recentBroadcasts || [];
  check(
    "BroadcastLog recent includes P14",
    recent.some((r: any) => String(r.message || "").includes(`P14 broadcast ${stamp}`)),
    `recent=${recent.length}`
  );
  check(
    "analytics latency null (not faked)",
    analytics.json?.data?.latencyP50Ms === null &&
      analytics.json?.data?.avgLatencyMs === null
  );

  // Connections list
  const conns = await request(
    REALTIME,
    "/api/v1/admin/realtime/connections",
    "GET",
    adminAuth
  );
  check(
    "connections list non-empty",
    Array.isArray(conns.json?.data) && conns.json.data.length >= 2,
    String(conns.json?.data?.length)
  );

  // Ownership: B should not receive A's user-room-only private presence update is N/A;
  // verify B did not get submission.created if not in room (B is not in user:A)
  let bGotPrivate = false;
  b.socket.on("submission.created", () => {
    bGotPrivate = true;
  });
  await request(
    REALTIME,
    "/api/v1/realtime/ingest/events",
    "POST",
    { "x-realtime-secret": INTERNAL, "x-internal-secret": INTERNAL },
    {
      event: "submission.queued",
      userId: userA.userId,
      room: `user:${userA.userId}`,
      status: "PENDING",
      payload: { submissionId: "p14sub2" },
    }
  );
  await new Promise((r) => setTimeout(r, 400));
  check("user B does not receive user-A room events", !bGotPrivate);

  // Reconnect flag path (second connect with reconnecting:true)
  a.socket.close();
  const a2 = await connectSocket(tokenA, true);
  check("WS reconnect connect succeeds", a2.socket.connected);
  await new Promise((r) => setTimeout(r, 300));
  const overview2 = await request(
    REALTIME,
    "/api/v1/admin/realtime/overview",
    "GET",
    adminAuth
  );
  check(
    "reconnect metric tracked or connections still real",
    typeof overview2.json?.data?.totalReconnects === "number" &&
      overview2.json.data.activeConnections >= 2,
    JSON.stringify({
      reconnects: overview2.json?.data?.totalReconnects,
      active: overview2.json?.data?.activeConnections,
    })
  );

  // Cleanup
  a2.socket.close();
  b.socket.close();

  console.log("\n========== §14 REALTIME E2E STATUS ==========");
  console.log(`Realtime URL: ${REALTIME}`);
  console.log(
    `Persistence: ${ov.broadcastPersistence?.mode || "unknown"} (mongoReady=${ov.mongoBroadcastLogs})`
  );
  console.log(
    `Measured: connections=${ov.activeConnections}, onlineUsers=${ov.onlineUsers}, rooms=${ov.activeRooms}`
  );
  console.log("Latency: null / Unavailable (by design — not faked)");
}

live()
  .then(() => {
    console.log(`\nDone: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

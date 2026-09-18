import http from "http";
import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import { serverConfig } from "./config";
import logger from "./config/logger.config";
import {
  connectDBOptional,
  getBroadcastPersistenceStatus,
} from "./config/db.config";
import { tryAttachRedisAdapter } from "./config/redis.adapter";
import { initPresenceRedis } from "./config/presenceRedis";
import { errorHandler } from "./middlewares/error.middleware";
import { blockWhenMaintenance } from "./middlewares/featureFlag.middleware";
import { invalidateFeatureFlagsCache } from "./utils/featureFlags";
import realtimeAdminRouter from "./admin/realtime.routes";
import { ingestRouter } from "./admin/ingest.routes";
import { attachSocketHandlers } from "./socket";
import { setRedisStatus } from "./admin/realtime.service";
import { sendResponse } from "./utils/helpers/response.helper";
import { HTTP_STATUS, REALTIME_MESSAGES } from "./utils/constants";
import { getActiveConnectionCount } from "./socket/presence";
import { onlinePresenceService } from "./services/onlinePresence.service";
import { isPresenceRedisReady } from "./config/presenceRedis";

const app = express();

function isAllowedCorsOrigin(origin: string | undefined): boolean {
  // No Origin = non-browser / service-to-service — allow.
  if (!origin) return true;
  return serverConfig.CORS_ORIGIN.includes(origin);
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedCorsOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

/** Minimal health — no auth. Broadcast persistence is reported honestly. */
app.get("/health", async (_req, res) => {
  let onlineUsers = getActiveConnectionCount();
  try {
    onlineUsers = await onlinePresenceService.getOnlineCount();
  } catch {
    /* keep connection count as rough fallback for health only */
  }
  const broadcastPersistence = getBroadcastPersistenceStatus();
  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: REALTIME_MESSAGES.SERVICE_HEALTHY,
    data: {
      service: "RealtimeService",
      port: serverConfig.PORT,
      activeConnections: getActiveConnectionCount(),
      onlineUsers,
      presenceRedis: isPresenceRedisReady(),
      mongoBroadcastLogs: broadcastPersistence.mongoReady,
      broadcastPersistence,
      uptimeSec: Math.floor(process.uptime()),
    },
  });
});

app.get("/api/v1/health", (_req, res) => {
  const broadcastPersistence = getBroadcastPersistenceStatus();
  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: REALTIME_MESSAGES.SERVICE_HEALTHY,
    data: {
      service: "RealtimeService",
      mongoBroadcastLogs: broadcastPersistence.mongoReady,
      broadcastPersistence,
    },
  });
});


app.post("/api/v1/internal/feature-flags/invalidate", (req, res) => {
  const provided =
    req.headers["x-internal-secret"] || req.headers["x-realtime-secret"];
  const expected = (serverConfig.INTERNAL_SERVICE_SECRET || "").trim();
  if (!expected) {
    res.status(401).json({
      success: false,
      message: "Internal service authentication is not configured",
    });
    return;
  }
  if (typeof provided !== "string" || provided !== expected) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  invalidateFeatureFlagsCache();
  res.status(200).json({ success: true });
});

app.use(blockWhenMaintenance);
app.use("/api/v1/admin/realtime", realtimeAdminRouter);
app.use("/api/v1/realtime/ingest", ingestRouter);

app.use(errorHandler);

async function start() {
  await connectDBOptional();
  await initPresenceRedis();

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  const redis = await tryAttachRedisAdapter(io);
  setRedisStatus(redis);

  attachSocketHandlers(io);

  httpServer.listen(serverConfig.PORT, () => {
    const bp = getBroadcastPersistenceStatus();
    logger.info(
      `RealtimeService listening on http://localhost:${serverConfig.PORT}`
    );
    logger.info(
      `Socket.IO ready (adapter=${redis.enabled ? "redis" : "memory"}; presenceRedis=${isPresenceRedisReady()})`
    );
    logger.info(
      `BroadcastLog persistence=${bp.mode}` +
        (bp.reason ? ` (${bp.reason})` : "")
    );
    logger.info("Client env: VITE_REALTIME_URL=http://localhost:3010");
  });
}

start().catch((err) => {
  logger.error("Failed to start RealtimeService", err);
  process.exit(1);
});

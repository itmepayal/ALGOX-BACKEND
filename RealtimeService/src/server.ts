import http from "http";
import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import { serverConfig } from "./config";
import logger from "./config/logger.config";
import { connectDBOptional } from "./config/db.config";
import { tryAttachRedisAdapter } from "./config/redis.adapter";
import { initPresenceRedis } from "./config/presenceRedis";
import { errorHandler } from "./middlewares/error.middleware";
import { blockWhenMaintenance } from "./middlewares/featureFlag.middleware";
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

app.use(
  cors({
    origin:
      serverConfig.CORS_ORIGIN.length > 0
        ? serverConfig.CORS_ORIGIN
        : true,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

/** Minimal health — no auth */
app.get("/health", async (_req, res) => {
  let onlineUsers = getActiveConnectionCount();
  try {
    onlineUsers = await onlinePresenceService.getOnlineCount();
  } catch {
    /* keep connection count as rough fallback for health only */
  }
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
      uptimeSec: Math.floor(process.uptime()),
    },
  });
});

app.get("/api/v1/health", (_req, res) => {
  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: REALTIME_MESSAGES.SERVICE_HEALTHY,
  });
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
      origin:
        serverConfig.CORS_ORIGIN.length > 0
          ? serverConfig.CORS_ORIGIN
          : true,
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  const redis = await tryAttachRedisAdapter(io);
  setRedisStatus(redis);

  attachSocketHandlers(io);

  httpServer.listen(serverConfig.PORT, () => {
    logger.info(
      `RealtimeService listening on http://localhost:${serverConfig.PORT}`
    );
    logger.info(
      `Socket.IO ready (adapter=${redis.enabled ? "redis" : "memory"}; presenceRedis=${isPresenceRedisReady()})`
    );
    logger.info("Client env: VITE_REALTIME_URL=http://localhost:3010");
  });
}

start().catch((err) => {
  logger.error("Failed to start RealtimeService", err);
  process.exit(1);
});

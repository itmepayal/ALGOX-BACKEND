import http from "http";
import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import { serverConfig } from "./config";
import logger from "./config/logger.config";
import { connectDBOptional } from "./config/db.config";
import { tryAttachRedisAdapter } from "./config/redis.adapter";
import { errorHandler } from "./middlewares/error.middleware";
import realtimeAdminRouter from "./admin/realtime.routes";
import { ingestRouter } from "./admin/ingest.routes";
import { attachSocketHandlers } from "./socket";
import { setRedisStatus } from "./admin/realtime.service";
import { sendResponse } from "./utils/helpers/response.helper";
import { HTTP_STATUS, REALTIME_MESSAGES } from "./utils/constants";
import { getActiveConnectionCount } from "./socket/presence";

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
app.get("/health", (_req, res) => {
  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: REALTIME_MESSAGES.SERVICE_HEALTHY,
    data: {
      service: "RealtimeService",
      port: serverConfig.PORT,
      activeConnections: getActiveConnectionCount(),
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

app.use("/api/v1/admin/realtime", realtimeAdminRouter);
app.use("/api/v1/realtime/ingest", ingestRouter);

app.use(errorHandler);

async function start() {
  await connectDBOptional();

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
      `Socket.IO ready (adapter=${redis.enabled ? "redis" : "memory"})`
    );
    logger.info("Client env: VITE_REALTIME_URL=http://localhost:3010");
  });
}

start().catch((err) => {
  logger.error("Failed to start RealtimeService", err);
  process.exit(1);
});

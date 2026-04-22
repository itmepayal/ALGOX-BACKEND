import express from "express";
import { serverConfig } from "./config";
import { connectDB } from "./config/db.config";
import v1Router from "./routers/v1/index.router";
import v2Router from "./routers/v2/index.router";
import {
  appErrorHandler,
  genericErrorHandler,
} from "./middlewares/error.middleware";
import logger from "./config/logger.config";
import { attachCorrelationIdMiddleware } from "./middlewares/correlation.middleware";
import { checkRedis } from "./config/redis.config";

const app = express();

app.use(express.json());
app.use(attachCorrelationIdMiddleware);

app.get("/tests", (req, res) => {
  res.json({
    message: "Mesages",
  });
});
app.use("/api/v1", v1Router);
app.use("/api/v2", v2Router);

app.use(appErrorHandler);
app.use(genericErrorHandler);

const startServer = async () => {
  try {
    await connectDB();
    app.listen(serverConfig.PORT, () => {
      logger.info(`Server is running on http://localhost:${serverConfig.PORT}`);
      logger.info(`Press Ctrl+C to stop the server.`);
      checkRedis();
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

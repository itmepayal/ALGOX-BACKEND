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
import { startWorkers } from "./workers/evaluation.worker";
import { pullAllImages } from "./utils/containers/pullImage.util";
import { PYTHON_IMAGE } from "./utils/constants";
import { createNewDockerContainer } from "./utils/containers/createContainer.util";

const app = express();

app.use(express.json());
app.use(attachCorrelationIdMiddleware);

app.use("/api/v1", v1Router);
app.use("/api/v2", v2Router);

app.use(appErrorHandler);
app.use(genericErrorHandler);

const startServer = async () => {
  try {
    await connectDB();
    app.listen(serverConfig.PORT, async () => {
      logger.info(`Server is running on http://localhost:${serverConfig.PORT}`);
      logger.info(`Press Ctrl+C to stop the server.`);
      await startWorkers();
      logger.info("Workers started successfully.");
      await pullAllImages();
      const container = await createNewDockerContainer({
        imageName: PYTHON_IMAGE,
        cmd: ["/bin/bash", "-c", "tail -f /var/log/dmesg"],
        memoryLimit: 1024 * 1024 * 1024,
      });
      await container?.start();
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

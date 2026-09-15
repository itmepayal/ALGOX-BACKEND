import mongoose from "mongoose";
import logger from "./logger.config";
import { serverConfig } from "./index";

const MAX_STARTUP_ATTEMPTS = 5;
const RETRY_DELAY_MS = 3000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const connectDB = async () => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_STARTUP_ATTEMPTS; attempt++) {
    try {
      const conn = await mongoose.connect(serverConfig.MONGO_URL, {
        autoIndex: true,
        serverSelectionTimeoutMS: 10_000,
        // Avoid silent hangs on flaky Atlas links
        connectTimeoutMS: 10_000,
      });

      logger.info(`MongoDB Connected: ${conn.connection.host}`);

      if (mongoose.connection.listenerCount("error") === 0) {
        mongoose.connection.on("error", (err) => {
          logger.error(`MongoDB Error: ${err.message}`);
        });

        mongoose.connection.on("disconnected", () => {
          // Do not exit — mongoose reconnects; exiting leaves nodemon without a listener.
          logger.warn("MongoDB Disconnected");
        });

        mongoose.connection.on("reconnected", () => {
          logger.info("MongoDB Reconnected");
        });
      }
      return;
    } catch (error) {
      lastError = error;
      logger.error(
        `MongoDB Connection Failed (attempt ${attempt}/${MAX_STARTUP_ATTEMPTS}): ${error}`
      );
      if (attempt < MAX_STARTUP_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  logger.error(`MongoDB Connection Failed after retries: ${lastError}`);
  process.exit(1);
};

process.once("SIGINT", async () => {
  await mongoose.connection.close();
  logger.info("MongoDB Connection Closed due to app termination");
  process.exit(0);
});

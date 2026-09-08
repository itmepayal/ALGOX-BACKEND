import express from "express";
import { serverConfig } from "./config";
import { connectDB } from "./config/db.config";
import analyticsRouter from "./routers/v1/analytics.router";

import cors from "cors";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use("/api/v1/analytics", analyticsRouter);

const startServer = async () => {
  try {
    await connectDB();
    app.listen(serverConfig.PORT, () => {
      console.log(`AnalyticsService is running on http://localhost:${serverConfig.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start AnalyticsService server:", error);
    process.exit(1);
  }
};

startServer();

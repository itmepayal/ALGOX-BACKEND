import express from "express";
import { serverConfig } from "./config";
import { connectDB } from "./config/db.config";
import analyticsRouter from "./routers/v1/analytics.router";
import cors from "cors";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "AnalyticsService is healthy",
  });
});

app.use("/api/v1/analytics", analyticsRouter);

// Basic error handler so JWT middleware errors return proper status codes
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const status = err?.statusCode || 500;
    res.status(status).json({
      success: false,
      message: err?.message || "Internal Server Error",
    });
  }
);

const startServer = async () => {
  try {
    await connectDB();
    app.listen(serverConfig.PORT, () => {
      console.log(
        `AnalyticsService is running on http://localhost:${serverConfig.PORT}`
      );
    });
  } catch (error) {
    console.error("Failed to start AnalyticsService server:", error);
    process.exit(1);
  }
};

startServer();

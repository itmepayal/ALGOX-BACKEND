import express from "express";
import { serverConfig } from "./config";
import { connectDB } from "./config/db.config";
import contentRouter from "./routers/v1/content.router";

import cors from "cors";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "ContentService is healthy",
    data: { service: "ContentService", status: "ok" },
  });
});

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "ContentService is healthy",
    data: { service: "ContentService", status: "ok" },
  });
});

app.use("/api/v1/content", contentRouter);

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (err?.name === "ZodError" && Array.isArray(err.errors)) {
      res.status(400).json({
        success: false,
        message: "Validation Error",
        errors: err.errors.map((e: any) => ({
          path: Array.isArray(e.path) ? e.path.join(".") : String(e.path || ""),
          message: e.message,
        })),
      });
      return;
    }
    const status = err?.statusCode || 500;
    res.status(status).json({
      success: false,
      message: err?.message || "Internal server error",
    });
  }
);

const startServer = async () => {
  try {
    await connectDB();
    app.listen(serverConfig.PORT, () => {
      console.log(`ContentService is running on http://localhost:${serverConfig.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start ContentService server:", error);
    process.exit(1);
  }
};

startServer();

import express from "express";
import { serverConfig } from "./config";
import { connectDB } from "./config/db.config";
import analyticsRouter from "./routers/v1/analytics.router";
import { blockWhenMaintenance } from "./middlewares/featureFlag.middleware";
import { invalidateFeatureFlagsCache } from "./utils/featureFlags";
import { requireInternalSecret } from "./middlewares/auth.middleware";
import cors from "cors";

const app = express();
const isProdCors = (process.env.NODE_ENV || "").toLowerCase() === "production";
const devCorsOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
];
const configuredCorsOrigins = (
  process.env.ALLOWED_ORIGINS ||
  process.env.CLIENT_URL ||
  process.env.CORS_ORIGIN ||
  ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (configuredCorsOrigins.some((o) => o === "*")) {
  if (isProdCors) {
    throw new Error(
      "CORS wildcard (*) is not allowed in production — set explicit ALLOWED_ORIGINS / CLIENT_URL"
    );
  }
}

const cleanedConfiguredOrigins = configuredCorsOrigins.filter((o) => o !== "*");

/** Production: only configured frontend origins (required, non-empty). Dev: localhost + configured. */
const corsOrigins = isProdCors
  ? cleanedConfiguredOrigins
  : Array.from(new Set([...devCorsOrigins, ...cleanedConfiguredOrigins]));

if (isProdCors && corsOrigins.length === 0) {
  throw new Error(
    "Production requires ALLOWED_ORIGINS or CLIENT_URL with at least one explicit origin"
  );
}

app.use(cors({
  origin: (origin, callback) => {
    // No Origin = non-browser / service-to-service — allow.
    if (!origin) {
      callback(null, true);
      return;
    }
    if (corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
}));
app.use(express.json());

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "AnalyticsService is healthy",
  });
});


app.post(
  "/api/v1/internal/feature-flags/invalidate",
  requireInternalSecret,
  (_req, res) => {
    invalidateFeatureFlagsCache();
    res.status(200).json({ success: true });
  }
);

app.use("/api/v1/analytics", blockWhenMaintenance, analyticsRouter);

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

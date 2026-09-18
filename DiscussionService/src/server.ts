import express from "express";
import { invalidateFeatureFlagsCache } from "./utils/featureFlags";
import { connectDB } from "./config/db.config";
import { serverConfig } from "./config";
import discussionRouter from "./routers/v1/discussion.router";
import { errorHandler } from "./middlewares/error.middleware";
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
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ success: true, service: "DiscussionService", status: "ok" });
});

app.get("/api/v1/health", (_req, res) => {
  res.json({ success: true, service: "DiscussionService", status: "ok" });
});

app.post(
  "/api/v1/internal/feature-flags/invalidate",
  requireInternalSecret,
  (_req, res) => {
    invalidateFeatureFlagsCache();
    res.status(200).json({ success: true });
  }
);

app.use("/api/v1/discussions", discussionRouter);
app.use(errorHandler);

const startServer = async () => {
  try {
    await connectDB();
    app.listen(serverConfig.PORT, () => {
      console.log(`DiscussionService is running on http://localhost:${serverConfig.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start DiscussionService server:", error);
    process.exit(1);
  }
};

startServer();

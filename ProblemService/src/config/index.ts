import path from "path";
import dotenv from "dotenv";

type ServerConfig = {
  PORT: number;
  MONGO_URL: string;
  JWT_SECRET: string;
  SUBMISSION_SERVICE_URL: string;
  AUTH_SERVICE_URL: string;
  LEADERBOARD_SERVICE_URL: string;
  /**
   * Shared secret for service-to-service calls (hidden testcases, contest checks).
   * Production: set INTERNAL_SERVICE_SECRET. Dev default keeps local workers working.
   */
  INTERNAL_SERVICE_SECRET: string;
  NODE_ENV: string;
};

function loadEnv() {
  // Absolute path so AI keys load even if process cwd differs from ProblemService root.
  // Never log key values — only whether Gemini/OpenAI is configured.
  const envPath = path.resolve(__dirname, "../../.env");
  dotenv.config({ path: envPath });
  const provider = (process.env.AI_PROVIDER || "gemini").trim().toLowerCase();
  const geminiConfigured = Boolean((process.env.GEMINI_API_KEY || "").trim());
  const openaiConfigured = Boolean((process.env.OPENAI_API_KEY || "").trim());
  console.log("Environment variables loaded");
  if (provider === "openai") {
    console.log(
      `OpenAI configuration: ${openaiConfigured ? "configured" : "missing"}`
    );
  } else {
    const model =
      (process.env.GEMINI_MODEL || "gemini-flash-lite-latest").trim() ||
      "gemini-flash-lite-latest";
    console.log(
      `Gemini configuration: ${geminiConfigured ? "configured" : "missing"} model=${model}`
    );
  }
}

loadEnv();

function getEnvVariable(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const INSECURE_SECRET_DEFAULTS = new Set([
  "super_secret_jwt_access_key",
  "super_secret_jwt_refresh_key",
  "dev-internal-service-secret",
]);

function isStrictSecretsMode(): boolean {
  return (
    (process.env.NODE_ENV || "").toLowerCase() === "production" ||
    process.env.REQUIRE_STRICT_SECRETS === "true"
  );
}

/**
 * Dev defaults OK locally. Strict/production rejects missing and known insecure defaults.
 * Never log resolved secret values.
 */
function secretEnv(key: string, devDefault: string): string {
  const value = (process.env[key] || "").trim();
  if (isStrictSecretsMode()) {
    if (!value) {
      throw new Error(`${key} is required in production`);
    }
    if (INSECURE_SECRET_DEFAULTS.has(value) || value === devDefault) {
      throw new Error(
        `${key} must not use a development/default value in production`
      );
    }
    return value;
  }
  return value || devDefault;
}

function resolveInternalSecret(): string {
  const DEV_DEFAULT = "dev-internal-service-secret";
  const fromEnv = (
    process.env.INTERNAL_SERVICE_SECRET ||
    process.env.INTERNAL_REALTIME_SECRET ||
    ""
  ).trim();
  if (isStrictSecretsMode()) {
    if (!fromEnv) {
      throw new Error("INTERNAL_SERVICE_SECRET is required in production");
    }
    if (INSECURE_SECRET_DEFAULTS.has(fromEnv) || fromEnv === DEV_DEFAULT) {
      throw new Error(
        "INTERNAL_SERVICE_SECRET must not use a development/default value in production"
      );
    }
    return fromEnv;
  }
  return fromEnv || DEV_DEFAULT;
}

export const serverConfig: ServerConfig = {
  PORT: Number(process.env.PORT) || 3003,
  MONGO_URL: getEnvVariable("MONGO_URL"),
  JWT_SECRET: secretEnv("JWT_SECRET", "super_secret_jwt_access_key"),
  SUBMISSION_SERVICE_URL: getEnvVariable(
    "SUBMISSION_SERVICE_URL",
    "http://localhost:3004"
  ),
  AUTH_SERVICE_URL: getEnvVariable(
    "AUTH_SERVICE_URL",
    "http://localhost:3001"
  ),
  LEADERBOARD_SERVICE_URL: getEnvVariable(
    "LEADERBOARD_SERVICE_URL",
    "http://localhost:3005/api/v1"
  ),
  INTERNAL_SERVICE_SECRET: resolveInternalSecret(),
  NODE_ENV: process.env.NODE_ENV || "development",
};

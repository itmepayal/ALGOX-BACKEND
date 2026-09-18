import dotenv from "dotenv";

type ServerConfig = {
  /** Documented production default: 3010 */
  PORT: number;
  JWT_SECRET: string;
  /**
   * BroadcastLog Mongo URI.
   * Production requires MONGO_URL unless ALLOW_MEMORY_BROADCAST_LOGS=true.
   * Empty string disables durable persistence (memory-only; health reports honestly).
   */
  MONGO_URL: string;
  /** Optional — Redis for Socket.IO adapter. Empty disables. */
  REDIS_URL: string;
  AUTH_SERVICE_URL: string;
  CORS_ORIGIN: string[];
  EVENT_BUFFER_SIZE: number;
  IDLE_TIMEOUT_MS: number;
  /** Canonical shared S2S secret (same env as other services). */
  INTERNAL_SERVICE_SECRET: string;
  /** @deprecated Alias of INTERNAL_SERVICE_SECRET for older call sites. */
  INTERNAL_SECRET: string;
};

function loadEnv() {
  dotenv.config();
}

loadEnv();

function optionalEnv(key: string, defaultValue = ""): string {
  return process.env[key] ?? defaultValue;
}

function isProduction(): boolean {
  return (process.env.NODE_ENV || "").toLowerCase() === "production";
}

function isStrictSecretsMode(): boolean {
  return isProduction() || process.env.REQUIRE_STRICT_SECRETS === "true";
}

const INSECURE_SECRET_DEFAULTS = new Set([
  "super_secret_jwt_access_key",
  "super_secret_jwt_refresh_key",
  "dev-internal-service-secret",
]);

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

function resolveInternalSecrets(): {
  INTERNAL_SERVICE_SECRET: string;
  INTERNAL_SECRET: string;
} {
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
    return {
      INTERNAL_SERVICE_SECRET: fromEnv,
      INTERNAL_SECRET: fromEnv,
    };
  }
  const value = fromEnv || DEV_DEFAULT;
  return {
    INTERNAL_SERVICE_SECRET: value,
    INTERNAL_SECRET: value,
  };
}

function resolveCorsOrigins(): string[] {
  const isProd = isProduction();
  const configured = (
    process.env.CORS_ORIGIN ||
    process.env.ALLOWED_ORIGINS ||
    process.env.CLIENT_URL ||
    ""
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (configured.some((o) => o === "*")) {
    if (isProd) {
      throw new Error(
        "CORS wildcard (*) is not allowed in production — set explicit ALLOWED_ORIGINS / CLIENT_URL / CORS_ORIGIN"
      );
    }
  }

  const cleaned = configured.filter((o) => o !== "*");
  if (isProd) {
    if (cleaned.length === 0) {
      throw new Error(
        "Production requires ALLOWED_ORIGINS, CLIENT_URL, or CORS_ORIGIN with at least one explicit origin"
      );
    }
    return cleaned;
  }

  const dev = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
  ];
  return Array.from(new Set([...dev, ...cleaned]));
}

function resolveMongoUrl(): string {
  const value = optionalEnv("MONGO_URL").trim();
  const allowMemory =
    (process.env.ALLOW_MEMORY_BROADCAST_LOGS || "").toLowerCase() === "true";

  if (isProduction() && !value && !allowMemory) {
    throw new Error(
      "MONGO_URL is required in production for BroadcastLog persistence. " +
        "Set MONGO_URL, or set ALLOW_MEMORY_BROADCAST_LOGS=true to explicitly opt into non-durable memory logs."
    );
  }

  if (isProduction() && !value && allowMemory) {
    // Config load is early; logger may not be ready — stderr is intentional.
    console.warn(
      "[RealtimeService] ALLOW_MEMORY_BROADCAST_LOGS=true — BroadcastLog will NOT persist to Mongo in production"
    );
  }

  return value;
}

export const serverConfig: ServerConfig = {
  PORT: Number(process.env.PORT) || 3010,
  JWT_SECRET: secretEnv("JWT_SECRET", "super_secret_jwt_access_key"),
  MONGO_URL: resolveMongoUrl(),
  REDIS_URL: optionalEnv("REDIS_URL"),
  AUTH_SERVICE_URL: optionalEnv(
    "AUTH_SERVICE_URL",
    "http://localhost:3001/api/v1"
  ),
  CORS_ORIGIN: resolveCorsOrigins(),
  EVENT_BUFFER_SIZE: Number(process.env.EVENT_BUFFER_SIZE) || 500,
  IDLE_TIMEOUT_MS: Number(process.env.IDLE_TIMEOUT_MS) || 120_000,
  ...resolveInternalSecrets(),
};

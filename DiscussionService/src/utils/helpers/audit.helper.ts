import axios from "axios";

const AUTH_AUDIT_URL =
  process.env.AUTH_AUDIT_URL ||
  "http://localhost:3001/api/v1/auth/admin/audit";

const DEV_DEFAULT = "dev-internal-service-secret";
const INSECURE_SECRET_DEFAULTS = new Set([
  "super_secret_jwt_access_key",
  "super_secret_jwt_refresh_key",
  DEV_DEFAULT,
]);

function resolveInternalSecret(): string {
  const fromEnv = (
    process.env.INTERNAL_SERVICE_SECRET ||
    process.env.INTERNAL_REALTIME_SECRET ||
    ""
  ).trim();
  const strict =
    (process.env.NODE_ENV || "").toLowerCase() === "production" ||
    process.env.REQUIRE_STRICT_SECRETS === "true";
  if (strict) {
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

const INTERNAL_SECRET = resolveInternalSecret();

export async function forwardAdminAudit(opts: {
  authorizationHeader?: string;
  action: string;
  resource: string;
  resourceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}): Promise<void> {
  if (!opts.authorizationHeader) return;
  try {
    await axios.post(
      AUTH_AUDIT_URL,
      {
        action: opts.action,
        resource: opts.resource,
        resourceId: opts.resourceId,
        before: opts.before,
        after: opts.after,
      },
      {
        headers: {
          Authorization: opts.authorizationHeader,
          "x-internal-secret": INTERNAL_SECRET,
        },
        timeout: 4000,
      }
    );
  } catch (err) {
    console.error("[DiscussionService] audit forward failed", err);
  }
}

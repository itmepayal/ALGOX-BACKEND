import { serverConfig } from "../../config";
import logger from "../../config/logger.config";

export interface RemoteAuditInput {
  action: string;
  resource: string;
  resourceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  token: string;
}

/**
 * Forward admin audit to AuthService POST /api/v1/auth/admin/audit.
 * Failures are logged and never throw — disconnect still proceeds.
 */
export async function forwardAdminAudit(
  input: RemoteAuditInput
): Promise<boolean> {
  const url = `${serverConfig.AUTH_SERVICE_URL.replace(/\/$/, "")}/auth/admin/audit`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.token}`,
      },
      body: JSON.stringify({
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        before: input.before,
        after: input.after,
      }),
    });
    if (!res.ok) {
      logger.warn("[Audit] Auth audit endpoint rejected", {
        status: res.status,
        url,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("[Audit] Failed to forward audit to AuthService", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

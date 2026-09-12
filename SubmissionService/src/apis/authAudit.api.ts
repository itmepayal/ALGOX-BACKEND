import axios from "axios";
import { serverConfig } from "../config";
import logger from "../config/logger.config";

export interface RemoteAuditInput {
  action: string;
  resource: string;
  resourceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** Forward admin JWT so Auth attributes the actor correctly. */
  authorizationHeader?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Best-effort write to AuthService admin audit endpoint.
 * Failures never block the primary review action.
 */
export async function writeAuthAdminAudit(
  input: RemoteAuditInput
): Promise<void> {
  const base = serverConfig.AUTH_SERVICE_URL;
  if (!base) return;

  try {
    await axios.post(
      `${base.replace(/\/$/, "")}/api/v1/auth/admin/audit`,
      {
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        before: input.before,
        after: input.after,
        ip: input.ip,
        userAgent: input.userAgent,
      },
      {
        timeout: 4000,
        headers: {
          ...(input.authorizationHeader
            ? { Authorization: input.authorizationHeader }
            : {}),
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: any) {
    logger.warn("[Suspicious] Auth audit write skipped/failed", {
      error: err?.message,
      status: err?.response?.status,
    });
  }
}

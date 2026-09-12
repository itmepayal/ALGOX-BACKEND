import axios from "axios";
import { serverConfig } from "../../config";
import { AdminAuditLog } from "../../models/adminAuditLog.model";

export interface AuditWriteInput {
  actorId: string;
  actorEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  authorization?: string;
}

/**
 * Prefer Auth ingest when available; otherwise console + local collection.
 * Failures never block the primary admin action.
 */
export async function writeAdminAudit(input: AuditWriteInput): Promise<void> {
  const payload = {
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId,
    before: input.before,
    after: input.after,
    ip: input.ip,
    userAgent: input.userAgent,
  };

  console.info("[AdminAudit]", payload.action, {
    resource: payload.resource,
    resourceId: payload.resourceId,
    actorId: payload.actorId,
  });

  const base = serverConfig.AUTH_SERVICE_URL.replace(/\/$/, "");
  const url = `${base}/api/v1/auth/admin/audit`;

  try {
    const res = await axios.post(url, payload, {
      headers: input.authorization
        ? { Authorization: input.authorization }
        : {},
      timeout: 3000,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    if (res.status >= 200 && res.status < 300) return;
  } catch {
    // Auth down or route missing — fall through to local store.
  }

  try {
    await AdminAuditLog.create(payload);
  } catch (err) {
    console.error("[AdminAudit] local write failed", err);
  }
}

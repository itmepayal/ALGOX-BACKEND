import { serverConfig } from "../../config";

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

/** Forward to Auth AdminAuditLog ingest. Failures never block the primary action. */
export async function writeAdminAudit(input: AuditWriteInput): Promise<void> {
  const base = (serverConfig.AUTH_SERVICE_URL || "http://localhost:3001").replace(
    /\/$/,
    ""
  );
  const root = base.replace(/\/api\/v1$/, "");
  const url = `${root}/api/v1/auth/admin/audit`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.authorization
          ? { Authorization: input.authorization }
          : {}),
        "x-internal-secret": serverConfig.INTERNAL_SERVICE_SECRET,
      },
      body: JSON.stringify({
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        before: input.before,
        after: input.after,
        ip: input.ip,
        userAgent: input.userAgent,
      }),
    });
    if (!res.ok) {
      console.error("[ContentService] audit forward rejected", res.status);
    }
  } catch (err) {
    console.error("[ContentService] audit forward failed", err);
  }
}

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
}

/** Append-only audit writer. Failures are logged but never block the primary action. */
export async function writeAdminAudit(input: AuditWriteInput): Promise<void> {
  try {
    await AdminAuditLog.create({
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      before: input.before,
      after: input.after,
      ip: input.ip,
      userAgent: input.userAgent,
    });
  } catch (err) {
    console.error("[AdminAudit] failed to write audit log", err);
  }
}

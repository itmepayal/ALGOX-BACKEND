import axios from "axios";

const AUTH_AUDIT_URL =
  process.env.AUTH_AUDIT_URL ||
  "http://localhost:3001/api/v1/auth/admin/audit";

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
        headers: { Authorization: opts.authorizationHeader },
        timeout: 4000,
      }
    );
  } catch (err) {
    console.error("[DiscussionService] audit forward failed", err);
  }
}

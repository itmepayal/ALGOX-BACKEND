import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { writeAdminAudit } from "../utils/helpers/audit.helper";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";
import { ingestAuditSchema } from "../validators/announcement.validator";

/**
 * Internal audit ingest for other services (Problem/Submission/Discussion/etc.).
 * Requires JWT (router) + x-internal-secret; body is written via writeAdminAudit.
 */
export class AuditIngestController {
  async ingest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required");
      const body = ingestAuditSchema.parse(req.body);

      await writeAdminAudit({
        actorId: req.user.userId,
        actorEmail: req.user.email,
        action: body.action,
        resource: body.resource,
        resourceId: body.resourceId,
        before: body.before,
        after: body.after,
        ip: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Audit event recorded",
      });
    } catch (error) {
      next(error);
    }
  }
}

export const auditIngestController = new AuditIngestController();

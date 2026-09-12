import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { adminUserService } from "../services/adminUser.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { AUTH_MESSAGES, HTTP_STATUS } from "../utils/constants";
import { permissionsForRole, normalizeRole } from "../rbac/permissions";
import { BadRequestError, UnauthorizedError } from "../utils/errors/app.error";
import { writeAdminAudit } from "../utils/helpers/audit.helper";

const roleSchema = z.object({
  role: z.enum([
    "user",
    "moderator",
    "content_manager",
    "admin",
    "super_admin",
  ]),
});

const statusSchema = z.object({
  status: z.enum(["active", "suspended", "banned"]),
});

export class AdminUserController {
  async listUsers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await adminUserService.listUsers({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        search: String(req.query.search || ""),
        role: String(req.query.role || "all"),
        status: String(req.query.status || "all"),
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.USERS_RETRIEVED,
        data: result.users,
        meta: result.meta,
      });
    } catch (err) {
      next(err);
    }
  }

  async getUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const user = await adminUserService.getUserById(String(req.params.id));
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.USERS_RETRIEVED,
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const body = roleSchema.parse(req.body);
      const user = await adminUserService.updateRole(
        {
          userId: req.user.userId,
          email: req.user.email,
          role: String(req.user.role),
        },
        String(req.params.id),
        body.role,
        {
          ip: req.ip,
          userAgent: req.get("user-agent") || undefined,
        }
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.ROLE_UPDATED,
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const body = statusSchema.parse(req.body);
      const user = await adminUserService.updateStatus(
        {
          userId: req.user.userId,
          email: req.user.email,
          role: String(req.user.role),
        },
        String(req.params.id),
        body.status,
        {
          ip: req.ip,
          userAgent: req.get("user-agent") || undefined,
        }
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.STATUS_UPDATED,
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  async myPermissions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const role = normalizeRole(req.user.role);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.PERMISSIONS_RETRIEVED,
        data: {
          role,
          permissions: permissionsForRole(role),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async listAuditLogs(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await adminUserService.listAuditLogs({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        resource: req.query.resource ? String(req.query.resource) : undefined,
        action: req.query.action ? String(req.query.action) : undefined,
        actorId: req.query.actorId ? String(req.query.actorId) : undefined,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.AUDIT_LOGS_RETRIEVED,
        data: result.logs,
        meta: result.meta,
      });
    } catch (err) {
      next(err);
    }
  }

  /** Accept cross-service audit writes (e.g. RealtimeService force-disconnect). */
  async createAudit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const { action, resource, resourceId, before, after } = req.body || {};
      if (!action || !resource) {
        throw new BadRequestError("action and resource are required");
      }
      await writeAdminAudit({
        actorId: req.user.userId,
        actorEmail: req.user.email,
        action: String(action),
        resource: String(resource),
        resourceId: resourceId ? String(resourceId) : undefined,
        before: before && typeof before === "object" ? before : undefined,
        after: after && typeof after === "object" ? after : undefined,
        ip: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: AUTH_MESSAGES.AUDIT_LOG_CREATED,
      });
    } catch (err) {
      next(err);
    }
  }

  async writeAuditLog(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const body = z
        .object({
          action: z.string().min(1).max(200),
          resource: z.string().min(1).max(200),
          resourceId: z.string().optional(),
          before: z.record(z.unknown()).optional(),
          after: z.record(z.unknown()).optional(),
          ip: z.string().optional(),
          userAgent: z.string().optional(),
        })
        .parse(req.body || {});

      await adminUserService.writeAuditLog(
        {
          userId: req.user.userId,
          email: req.user.email,
          role: String(req.user.role),
        },
        {
          action: body.action,
          resource: body.resource,
          resourceId: body.resourceId,
          before: body.before,
          after: body.after,
        },
        {
          ip: body.ip || req.ip,
          userAgent: body.userAgent || req.get("user-agent") || undefined,
        }
      );

      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Audit log written",
      });
    } catch (err) {
      next(err);
    }
  }

  async internalStats(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await adminUserService.internalUserStats();
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.INTERNAL_STATS_OK,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const adminUserController = new AdminUserController();

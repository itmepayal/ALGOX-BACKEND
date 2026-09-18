import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { adminUserService } from "../services/adminUser.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { AUTH_MESSAGES, HTTP_STATUS } from "../utils/constants";
import { normalizeRole } from "../rbac/permissions";
import { permissionsForRoleResolved } from "../services/rolePermission.service";
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

const subscriptionSchema = z.object({
  plan: z.enum(["FREE", "PREMIUM"]),
  status: z.enum([
    "none",
    "active",
    "canceled",
    "past_due",
    "expired",
    "grace",
  ]),
  currentPeriodEnd: z.union([z.string().min(1), z.null()]).optional(),
  gracePeriodEnd: z.union([z.string().min(1), z.null()]).optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
  source: z.enum(["default", "admin_grant", "promo", "billing"]).optional(),
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

  async updateSubscription(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const body = subscriptionSchema.parse(req.body);
      if (body.plan === "FREE" && body.status === "active") {
        // Free tier uses status "none"; coerce for safety
        body.status = "none";
      }
      if (body.plan === "PREMIUM" && body.status === "none") {
        throw new BadRequestError(
          "PREMIUM entitlement requires a non-none status (e.g. active)"
        );
      }
      const user = await adminUserService.updateSubscription(
        {
          userId: req.user.userId,
          email: req.user.email,
          role: String(req.user.role),
        },
        String(req.params.id),
        body,
        {
          ip: req.ip,
          userAgent: req.get("user-agent") || undefined,
        }
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Subscription updated",
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
          permissions: permissionsForRoleResolved(role),
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

  async internalStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const days = Number(req.query.days) || 30;
      const data = await adminUserService.internalUserStats(days);
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

  async createUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const body = z
        .object({
          name: z.string().min(2).max(50),
          email: z.string().email(),
          password: z.string().min(8).max(128).optional(),
          role: z
            .enum([
              "user",
              "moderator",
              "content_manager",
              "admin",
              "super_admin",
            ])
            .optional(),
          status: z.enum(["active", "suspended", "banned"]).optional(),
        })
        .parse(req.body || {});

      const result = await adminUserService.createUser(
        {
          userId: req.user.userId,
          email: req.user.email,
          role: String(req.user.role),
        },
        body,
        { ip: req.ip, userAgent: req.get("user-agent") || undefined }
      );

      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "User created",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async softDeleteUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const user = await adminUserService.softDeleteUser(
        {
          userId: req.user.userId,
          email: req.user.email,
          role: String(req.user.role),
        },
        String(req.params.id),
        { ip: req.ip, userAgent: req.get("user-agent") || undefined }
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "User deleted",
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const body = z
        .object({
          temporaryPassword: z.string().min(8).max(128).optional(),
        })
        .parse(req.body || {});

      const result = await adminUserService.resetPassword(
        {
          userId: req.user.userId,
          email: req.user.email,
          role: String(req.user.role),
        },
        String(req.params.id),
        body,
        { ip: req.ip, userAgent: req.get("user-agent") || undefined }
      );

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Password reset",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getUserActivity(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await adminUserService.getUserActivity(String(req.params.id), {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 30,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "User activity retrieved",
        data: result.activity,
        meta: result.meta,
      });
    } catch (err) {
      next(err);
    }
  }

  async getUserProgress(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await adminUserService.getUserProgress(
        String(req.params.id),
        req.get("authorization") || undefined
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "User progress retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async listUserSessions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await adminUserService.listUserSessions(String(req.params.id));
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Sessions retrieved",
        data: data.sessions,
      });
    } catch (err) {
      next(err);
    }
  }

  async revokeUserSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const data = await adminUserService.revokeUserSession(
        {
          userId: req.user.userId,
          email: req.user.email,
          role: String(req.user.role),
        },
        String(req.params.id),
        String(req.params.sessionId),
        { ip: req.ip, userAgent: req.get("user-agent") || undefined }
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Session revoked",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async revokeAllUserSessions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const data = await adminUserService.revokeAllUserSessions(
        {
          userId: req.user.userId,
          email: req.user.email,
          role: String(req.user.role),
        },
        String(req.params.id),
        { ip: req.ip, userAgent: req.get("user-agent") || undefined }
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "All sessions revoked",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async listPlatformActivity(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const result = await adminUserService.listPlatformActivity({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 30,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Platform activity retrieved",
        data: result.activity,
        meta: result.meta,
      });
    } catch (err) {
      next(err);
    }
  }

  async listPlatformSessions(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const result = await adminUserService.listPlatformSessions({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Platform sessions retrieved",
        data: result.sessions,
        meta: result.meta,
      });
    } catch (err) {
      next(err);
    }
  }

  async listPlatformProgress(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const result = await adminUserService.listPlatformProgress(
        {
          page: Number(req.query.page) || 1,
          limit: Number(req.query.limit) || 20,
          search:
            typeof req.query.search === "string" ? req.query.search : undefined,
        },
        req.get("authorization") || undefined
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Platform progress retrieved",
        data: result.rows,
        meta: result.meta,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const adminUserController = new AdminUserController();

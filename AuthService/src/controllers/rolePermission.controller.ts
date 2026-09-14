import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { rolePermissionService } from "../services/rolePermission.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";
import { ALL_PERMISSIONS } from "../rbac/permissions";

const updateSchema = z.object({
  permissions: z.array(z.string()).min(1),
});

export class RolePermissionController {
  async getMatrix(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await rolePermissionService.getMatrix();
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Role permission matrix",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const body = updateSchema.parse(req.body || {});
      const data = await rolePermissionService.updateRolePermissions({
        role: String(req.params.role),
        permissions: body.permissions,
        actor: {
          userId: req.user.userId,
          email: req.user.email,
          role: String(req.user.role),
        },
        ip: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Role permissions updated",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async resetRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const data = await rolePermissionService.resetRole(
        String(req.params.role),
        {
          userId: req.user.userId,
          email: req.user.email,
          role: String(req.user.role),
        },
        { ip: req.ip, userAgent: req.get("user-agent") || undefined }
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Role permissions reset to defaults",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async listAllPermissions(
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "All permissions",
        data: ALL_PERMISSIONS,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const rolePermissionController = new RolePermissionController();

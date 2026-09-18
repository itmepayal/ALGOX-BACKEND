import { Request, Response, NextFunction } from "express";
import { AnalyticsService } from "../services/analytics.service";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { hasAnyPermission } from "../rbac/permissions";

export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  async getUserAnalytics(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId } = req.params;
      const actor = (req as AuthenticatedRequest).user;
      if (!actor?.userId) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }
      const isStaff = hasAnyPermission(actor.role, ["analytics:view"]);
      if (String(userId) !== actor.userId && !isStaff) {
        res.status(403).json({ success: false, message: "Access forbidden" });
        return;
      }
      const analytics = await this.analyticsService.getUserAnalytics(
        String(userId)
      );
      res.status(200).json({ success: true, data: analytics });
    } catch (error) {
      next(error);
    }
  }

  async recordSubmissionEvent(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const analytics = await this.analyticsService.recordSubmissionEvent(
        req.body
      );
      res
        .status(200)
        .json({ success: true, message: "Analytics recorded", data: analytics });
    } catch (error) {
      next(error);
    }
  }

  async getOverview(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const range = String(req.query.range || "30d");
      const data = await this.analyticsService.getPlatformOverview(
        range,
        req.headers.authorization
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getCharts(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const range = String(req.query.range || "30d");
      const data = await this.analyticsService.getChartSeries(
        range,
        req.headers.authorization
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getDashboard(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const range = String(req.query.range || "30d");
      const data = await this.analyticsService.getAdminDashboard(
        range,
        req.headers.authorization
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async exportDashboard(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const range = String(req.query.range || "30d");
      const format =
        String(req.query.format || "json").toLowerCase() === "csv"
          ? "csv"
          : "json";
      const exported = await this.analyticsService.exportAdminDashboard(
        range,
        req.headers.authorization,
        format
      );
      res.setHeader("Content-Type", exported.contentType);
      if (format === "csv" && exported.filename) {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${exported.filename}"`
        );
        res.status(200).send(exported.body);
        return;
      }
      res.status(200).json({ success: true, data: exported.body });
    } catch (error) {
      next(error);
    }
  }

  async getMyOverview(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }
      const data = await this.analyticsService.getMyOverview(userId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getMyHistory(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }
      const q = req.query as Record<string, string | undefined>;
      const data = await this.analyticsService.getMyHistory(
        userId,
        req.headers.authorization,
        q
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getMyPremium(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }
      const q = req.query as Record<string, string | undefined>;
      const data = await this.analyticsService.getMyPremium(
        userId,
        req.headers.authorization,
        q
      );
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error?.statusCode === 403) {
        res.status(403).json({
          success: false,
          message: error.message,
          code: error.code || "PREMIUM_REQUIRED",
        });
        return;
      }
      next(error);
    }
  }

  async getMyLearning(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }
      const q = req.query as Record<string, string | undefined>;
      const data = await this.analyticsService.getMyLearning(
        userId,
        req.headers.authorization,
        q
      );
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error?.statusCode === 403) {
        res.status(403).json({
          success: false,
          message: error.message,
          code: error.code || "PREMIUM_REQUIRED",
        });
        return;
      }
      next(error);
    }
  }
}

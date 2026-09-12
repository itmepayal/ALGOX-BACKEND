import { Request, Response, NextFunction } from "express";
import { AnalyticsService } from "../services/analytics.service";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";

export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  async getUserAnalytics(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId } = req.params;
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
}

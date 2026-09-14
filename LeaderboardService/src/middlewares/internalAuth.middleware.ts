import { Request, Response, NextFunction } from "express";
import { serverConfig } from "../config";

export class UnauthorizedError extends Error {
  statusCode = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Gate for service-to-service writes (Evaluation worker only).
 * Header: x-internal-secret
 */
export const requireInternalSecret = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const provided =
    req.headers["x-internal-secret"] || req.headers["x-realtime-secret"];
  const expected = serverConfig.INTERNAL_SERVICE_SECRET;
  if (!expected) {
    res.status(401).json({
      success: false,
      message: "Internal service authentication is not configured",
    });
    return;
  }
  if (typeof provided === "string" && provided === expected) {
    next();
    return;
  }
  res.status(401).json({
    success: false,
    message: "Invalid or missing internal service secret",
  });
};

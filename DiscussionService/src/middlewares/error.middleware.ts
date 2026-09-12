import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors/app.error";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  const message = err instanceof Error ? err.message : "Internal Server Error";
  console.error("[DiscussionService]", err);
  res.status(500).json({ success: false, message });
}

import { NextFunction, Request, Response, ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors/app.error";
import logger from "../config/logger.config";

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof ZodError) {
    logger.warn(`[Validation Error] Path: ${req.path} - ${JSON.stringify(err.errors)}`);
    res.status(400).json({
      success: false,
      message: "Validation Error",
      errors: err.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  if (err instanceof AppError) {
    logger.warn(`[AppError] ${err.name} (${err.statusCode}): ${err.message}`);
    const details = err.details;
    const code =
      details && typeof details === "object" && "code" in details
        ? (details as { code?: string }).code
        : undefined;
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(code ? { code } : {}),
      ...(details && { details }),
    });
    return;
  }

  logger.error(`[Unhandled Error] Path: ${req.path} - Error: ${err.message}`, {
    stack: err.stack,
    errorObj: err,
  });

  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
  return;
};
/**
 * @file app.error.ts
 */
export abstract class AppError extends Error {
  abstract statusCode: number;
  public details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class InternalServerError extends AppError {
  statusCode = 500;
  constructor(message = "Internal Server Error", details?: unknown) {
    super(message, details);
    this.name = "InternalServerError";
  }
}

export class BadRequestError extends AppError {
  statusCode = 400;
  constructor(message = "Bad Request", details?: unknown) {
    super(message, details);
    this.name = "BadRequestError";
  }
}

export class NotFoundError extends AppError {
  statusCode = 404;
  constructor(message = "Not Found", details?: unknown) {
    super(message, details);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  statusCode = 401;
  constructor(message = "Unauthorized", details?: unknown) {
    super(message, details);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  statusCode = 403;
  constructor(message = "Forbidden", details?: unknown) {
    super(message, details);
    this.name = "ForbiddenError";
  }
}

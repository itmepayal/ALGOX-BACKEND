/**
 * @file app.error.ts
 */

/**
 * Base custom application error extending native Error.
 */
export abstract class AppError extends Error {
  abstract statusCode: number;
  public details?: any;

  constructor(message: string, details?: any) {
    super(message);
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class InternalServerError extends AppError {
  statusCode = 500;
  constructor(message: string = "Internal Server Error", details?: any) {
    super(message, details);
    this.name = "InternalServerError";
  }
}

export class BadRequestError extends AppError {
  statusCode = 400;
  constructor(message: string = "Bad Request", details?: any) {
    super(message, details);
    this.name = "BadRequestError";
  }
}

export class NotFoundError extends AppError {
  statusCode = 404;
  constructor(message: string = "Not Found", details?: any) {
    super(message, details);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  statusCode = 401;
  constructor(message: string = "Unauthorized", details?: any) {
    super(message, details);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  statusCode = 403;
  constructor(message: string = "Forbidden", details?: any) {
    super(message, details);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  statusCode = 409;
  constructor(message: string = "Conflict", details?: any) {
    super(message, details);
    this.name = "ConflictError";
  }
}

export class NotImplementedError extends AppError {
  statusCode = 501;
  constructor(message: string = "Not Implemented", details?: any) {
    super(message, details);
    this.name = "NotImplementedError";
  }
}


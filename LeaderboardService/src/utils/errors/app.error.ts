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

export class NotFoundError extends AppError {
  statusCode = 404;
  constructor(message: string = "Not Found", details?: any) {
    super(message, details);
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends AppError {
  statusCode = 400;
  constructor(message: string = "Bad Request", details?: any) {
    super(message, details);
    this.name = "BadRequestError";
  }
}

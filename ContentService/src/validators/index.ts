import { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny } from "zod";

/**
 * Request-body Zod middleware (same pattern as SubmissionService validateRequestBody).
 */
export const validateRequestBody = (schema: ZodTypeAny) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body ?? {});
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: "Validation Error",
          errors: error.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
};

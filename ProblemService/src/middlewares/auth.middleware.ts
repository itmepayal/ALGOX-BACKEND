import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { serverConfig } from "../config";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";

export interface AuthenticatedAdminRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

export const authenticateAdmin = (
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      sendResponse({
        res,
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        message: "Authorization token missing. Admin access required.",
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, serverConfig.JWT_SECRET) as {
      userId: string;
      email: string;
      role: string;
    };

    if (decoded.role !== "admin") {
      sendResponse({
        res,
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: "Forbidden. Only Admin users can perform this action.",
      });
      return;
    }

    req.user = decoded;
    next();
  } catch (error: any) {
    sendResponse({
      res,
      statusCode: HTTP_STATUS.UNAUTHORIZED,
      message: "Invalid or expired authorization token.",
    });
  }
};

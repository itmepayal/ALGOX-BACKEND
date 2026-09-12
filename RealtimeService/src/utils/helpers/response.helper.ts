import { Response } from "express";
import { HTTP_STATUS } from "../constants";

export interface ApiResponseOptions<T = unknown> {
  res: Response;
  statusCode?: number;
  message: string;
  data?: T;
  meta?: Record<string, unknown>;
}

export const sendResponse = <T = unknown>({
  res,
  statusCode = HTTP_STATUS.OK,
  message,
  data,
  meta,
}: ApiResponseOptions<T>): Response => {
  return res.status(statusCode).json({
    success: statusCode >= 200 && statusCode < 300,
    message,
    ...(data !== undefined && { data }),
    ...(meta !== undefined && { meta }),
  });
};

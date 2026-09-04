import { Response } from "express";
import { HTTP_STATUS } from "../constants";

export interface ApiResponseOptions<T = any> {
  res: Response;
  statusCode?: number;
  message: string;
  data?: T;
}

export const sendResponse = <T = any>({
  res,
  statusCode = HTTP_STATUS.OK,
  message,
  data,
}: ApiResponseOptions<T>): Response => {
  return res.status(statusCode).json({
    success: statusCode >= 200 && statusCode < 300,
    message,
    ...(data !== undefined && { data }),
  });
};

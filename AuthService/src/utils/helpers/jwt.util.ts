import jwt from "jsonwebtoken";
import { serverConfig } from "../../config";
import type { UserRole } from "../../rbac/permissions";

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole | string;
}

export const generateAccessToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, serverConfig.JWT_SECRET, {
    expiresIn: "15m",
  });
};

export const generateRefreshToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, serverConfig.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
};

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, serverConfig.JWT_SECRET) as JwtPayload;
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, serverConfig.REFRESH_TOKEN_SECRET) as JwtPayload;
};

import jwt from "jsonwebtoken";
import { serverConfig } from "../../config";
import type { UserRole } from "../../rbac/permissions";

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole | string;
  /** Auth-resolved permissions snapshot (source of truth at token issue time). */
  permissions?: string[];
  isEmailVerified?: boolean;
}

export const generateAccessToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, serverConfig.JWT_SECRET, {
    expiresIn: "2h",
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

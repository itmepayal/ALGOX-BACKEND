import jwt from "jsonwebtoken";
import { serverConfig } from "../../config";
import type { UserRole } from "../../rbac/permissions";

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole | string;
  permissions?: string[];
}

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, serverConfig.JWT_SECRET) as JwtPayload;
};

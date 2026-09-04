import jwt from "jsonwebtoken";
import { serverConfig } from "../../config";

export interface JwtPayload {
  userId: string;
  email: string;
  role: "user" | "admin";
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

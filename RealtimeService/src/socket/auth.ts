import type { Socket } from "socket.io";
import { verifyAccessToken, type JwtPayload } from "../utils/helpers/jwt.util";
import { normalizeRole } from "../rbac/permissions";

export interface SocketAuthUser {
  userId: string;
  email: string;
  role: string;
}

declare module "socket.io" {
  interface SocketData {
    user: SocketAuthUser;
  }
}

function extractToken(socket: Socket): string | null {
  const authToken = (socket.handshake.auth as { token?: string } | undefined)
    ?.token;
  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim();
  }

  const header = socket.handshake.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }

  // Query fallback for tooling only — still verified; never trust userId
  const q = socket.handshake.query?.token;
  if (typeof q === "string" && q.trim()) return q.trim();

  return null;
}

/**
 * Socket.IO middleware: verify JWT from handshake.auth.token or Authorization.
 * Never trust client-supplied userId.
 */
export function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): void {
  try {
    const token = extractToken(socket);
    if (!token) {
      return next(new Error("Authentication required"));
    }

    const decoded: JwtPayload = verifyAccessToken(token);
    if (!decoded.userId) {
      return next(new Error("Invalid token payload"));
    }

    socket.data.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: normalizeRole(decoded.role),
    };
    return next();
  } catch {
    return next(new Error("Invalid or expired token"));
  }
}

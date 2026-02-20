import { NextFunction, Request, Response } from "express";
import { prisma } from "../db";
import { verifyAccessToken } from "../lib/jwt";
import { forbidden, unauthorized } from "../lib/errors";

const parseBearer = (header?: string | string[]): string => {
  if (!header || typeof header !== "string") {
    throw unauthorized("Missing Authorization header");
  }

  const [prefix, token] = header.split(" ");
  if (prefix !== "Bearer" || !token) {
    throw unauthorized("Invalid Authorization format");
  }

  return token;
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  (async () => {
    const token = parseBearer(req.headers.authorization);
    const payload = verifyAccessToken(token);

    if (!payload.sessionId) {
      throw unauthorized("Invalid or expired access token");
    }

    const session = await prisma.userSession.findFirst({
      where: {
        id: payload.sessionId,
        tenantId: payload.tenantId,
        userId: payload.userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: {
          select: {
            isActive: true,
            role: true,
          },
        },
      },
    });

    if (!session) {
      throw unauthorized("Invalid or expired access token");
    }

    if (!session.user.isActive) {
      throw unauthorized("User is inactive");
    }

    // Use authoritative role from DB so admin changes take effect immediately.
    req.user = {
      ...payload,
      role: session.user.role,
      sessionId: session.id,
    };
  })()
    .then(() => next())
    .catch(() => next(unauthorized("Invalid or expired access token")));
};

export const requireRole = (...roles: Array<"USER" | "CHAIRMAN" | "ADMIN">) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(unauthorized("Authentication required"));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(forbidden("Insufficient role"));
      return;
    }

    next();
  };
};

import type { NextFunction, Request, Response } from "express";

/** Requires JWT (global middleware) and ADMIN role from email policy. */
export function requireAdmin(request: Request, response: Response, next: NextFunction) {
  if (!request.authUser || request.authUser.role !== "ADMIN") {
    response.status(403).json({ message: "Admin access required." });
    return;
  }
  next();
}

import type { Request, Response } from "express";
import { HttpError } from "../../lib/http-error.js";
import { recordClientError } from "./monitoring.service.js";
import { clientErrorSchema } from "./monitoring.schema.js";

export async function recordClientErrorController(request: Request, response: Response) {
  const parsed = clientErrorSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Client error payload is invalid.");
  }

  const result = await recordClientError(parsed.data, {
    userId: request.authUser?.id,
    userAgent: request.headers["user-agent"],
  });

  response.status(202).json(result);
}

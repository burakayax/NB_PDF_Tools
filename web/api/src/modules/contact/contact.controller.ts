import type { Request, Response } from "express";
import { HttpError } from "../../lib/http-error.js";
import { contactRequestSchema } from "./contact.schema.js";
import { submitContactMessage } from "./contact.service.js";

export async function submitContactController(request: Request, response: Response) {
  const parsed = contactRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Contact request is invalid.");
  }

  const result = await submitContactMessage(parsed.data);
  response.status(200).json(result);
}

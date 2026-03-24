import { prisma } from "../../lib/prisma.js";
import type { ClientErrorInput } from "./monitoring.schema.js";

type ClientErrorContext = {
  userId?: string;
  userAgent?: string;
};

export async function recordClientError(input: ClientErrorInput, context: ClientErrorContext = {}) {
  await prisma.clientErrorLog.create({
    data: {
      message: input.message,
      level: input.level,
      source: input.source || null,
      stack: input.stack || null,
      url: input.url || null,
      language: input.language,
      userAgent: context.userAgent || null,
      userId: context.userId || null,
    },
  });

  return {
    success: true,
  };
}

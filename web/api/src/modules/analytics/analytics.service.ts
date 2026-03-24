import { prisma } from "../../lib/prisma.js";
import type { PageViewInput } from "./analytics.schema.js";

type PageViewContext = {
  userId?: string;
  userAgent?: string;
};

export async function recordPageView(input: PageViewInput, context: PageViewContext = {}) {
  await prisma.pageView.create({
    data: {
      view: input.view,
      path: input.path,
      sessionId: input.sessionId,
      language: input.language,
      referrer: input.referrer || null,
      userAgent: context.userAgent || null,
      userId: context.userId || null,
    },
  });

  return {
    success: true,
  };
}

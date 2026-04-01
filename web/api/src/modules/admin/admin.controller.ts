import type { Request, Response } from "express";
import type { Express } from "express";
import { HttpError } from "../../lib/http-error.js";
import {
  adminBlockedEmailBodySchema,
  adminBlockedEmailQuerySchema,
  adminCreateUserSchema,
  adminDeleteUserQuerySchema,
  adminListUsersQuerySchema,
  adminPatchSettingsSchema,
  adminPaymentPricesBodySchema,
  adminUpdateUserSchema,
  adminUsageExportQuerySchema,
  adminUsageSeriesQuerySchema,
} from "./admin.schema.js";
import {
  adminAddBlockedEmailRaw,
  adminListBlockedEmails,
  adminPutPaymentPrices,
  adminRemoveBlockedEmailRaw,
  buildUsageExportCsv,
  createUserForAdmin,
  deleteUserForAdmin,
  getAdminOverview,
  getAllSiteSettings,
  getCmsContent,
  getPlansAdminPayload,
  getToolsAdminPayload,
  getUsageSeries,
  listUsersForAdmin,
  patchSiteSettings,
  putCmsContent,
  putPackagesMarketing,
  putPlansOverride,
  putToolsConfig,
  updateUserForAdmin,
} from "./admin.service.js";
import { createMediaAsset, listMediaAssets } from "./media.service.js";

function requireUserId(request: Request): string {
  const userId = request.authUser?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication is required.");
  }
  return userId;
}

export async function adminOverviewController(_request: Request, response: Response) {
  const stats = await getAdminOverview();
  response.json(stats);
}

export async function adminListUsersController(request: Request, response: Response) {
  const parsed = adminListUsersQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid query.");
  }
  const result = await listUsersForAdmin(parsed.data);
  response.json(result);
}

export async function adminUpdateUserController(request: Request, response: Response) {
  const raw = request.params.id;
  const userId = Array.isArray(raw) ? raw[0] : raw;
  if (!userId) {
    throw new HttpError(400, "User id is required.");
  }
  const parsed = adminUpdateUserSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  }
  const acting = requireUserId(request);
  const updated = await updateUserForAdmin(userId, parsed.data, acting);
  response.json(updated);
}

export async function adminDeleteUserController(request: Request, response: Response) {
  const raw = request.params.id;
  const userId = Array.isArray(raw) ? raw[0] : raw;
  if (!userId) {
    throw new HttpError(400, "User id is required.");
  }
  const q = adminDeleteUserQuerySchema.safeParse(request.query);
  const blockEmail = q.success ? q.data.blockEmail : false;
  const acting = requireUserId(request);
  await deleteUserForAdmin(userId, acting, blockEmail);
  response.json({ ok: true });
}

export async function adminListBlockedEmailsController(_request: Request, response: Response) {
  const items = await adminListBlockedEmails();
  response.json({ items });
}

export async function adminAddBlockedEmailController(request: Request, response: Response) {
  const parsed = adminBlockedEmailBodySchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  }
  await adminAddBlockedEmailRaw(parsed.data.email, parsed.data.reason ?? null);
  response.status(201).json({ ok: true });
}

export async function adminRemoveBlockedEmailController(request: Request, response: Response) {
  const parsed = adminBlockedEmailQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    throw new HttpError(400, "Query parameter email is required.");
  }
  await adminRemoveBlockedEmailRaw(parsed.data.email);
  response.json({ ok: true });
}

export async function adminPutPaymentPricesController(request: Request, response: Response) {
  const parsed = adminPaymentPricesBodySchema.safeParse(request.body?.prices ?? request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  }
  await adminPutPaymentPrices(parsed.data);
  response.json({ ok: true });
}

export async function adminCreateUserController(request: Request, response: Response) {
  const parsed = adminCreateUserSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  }
  const user = await createUserForAdmin(parsed.data);
  response.status(201).json(user);
}

export async function adminGetSettingsController(_request: Request, response: Response) {
  const settings = await getAllSiteSettings();
  response.json({ settings });
}

export async function adminPatchSettingsController(request: Request, response: Response) {
  const parsed = adminPatchSettingsSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  }
  await patchSiteSettings(parsed.data.patches);
  response.json({ ok: true });
}

export async function adminGetCmsController(_request: Request, response: Response) {
  const content = await getCmsContent();
  response.json({ content });
}

export async function adminPutCmsController(request: Request, response: Response) {
  await putCmsContent(request.body?.content ?? request.body);
  response.json({ ok: true });
}

export async function adminPlansController(_request: Request, response: Response) {
  const payload = await getPlansAdminPayload();
  response.json(payload);
}

export async function adminPutPackagesMarketingController(request: Request, response: Response) {
  await putPackagesMarketing(request.body?.marketing ?? request.body);
  response.json({ ok: true });
}

export async function adminToolsController(_request: Request, response: Response) {
  const payload = await getToolsAdminPayload();
  response.json(payload);
}

export async function adminPutToolsController(request: Request, response: Response) {
  await putToolsConfig(request.body?.config ?? request.body);
  response.json({ ok: true });
}

export async function adminPutPlansOverrideController(request: Request, response: Response) {
  await putPlansOverride(request.body?.override ?? request.body);
  response.json({ ok: true });
}

export async function adminUploadMediaController(request: Request, response: Response) {
  const file = (request as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    throw new HttpError(400, "No file uploaded.");
  }
  const row = await createMediaAsset({
    storageKey: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    byteSize: file.size,
  });
  response.status(201).json({
    id: row.id,
    storageKey: row.storageKey,
    originalName: row.originalName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    createdAt: row.createdAt.toISOString(),
    url: `/api/media/files/${row.storageKey}`,
  });
}

export async function adminListMediaController(_request: Request, response: Response) {
  const items = await listMediaAssets();
  response.json({
    items: items.map((a) => ({
      id: a.id,
      storageKey: a.storageKey,
      originalName: a.originalName,
      mimeType: a.mimeType,
      byteSize: a.byteSize,
      createdAt: a.createdAt.toISOString(),
      url: `/api/media/files/${a.storageKey}`,
    })),
  });
}

export async function adminUsageSeriesController(request: Request, response: Response) {
  const parsed = adminUsageSeriesQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid query.");
  }
  const series = await getUsageSeries(parsed.data.days);
  response.json({ series });
}

export async function adminUsageExportController(request: Request, response: Response) {
  const parsed = adminUsageExportQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid query.");
  }
  const csv = await buildUsageExportCsv(parsed.data.from, parsed.data.to);
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="usage-${parsed.data.from}-${parsed.data.to}.csv"`);
  response.send("\uFEFF" + csv);
}

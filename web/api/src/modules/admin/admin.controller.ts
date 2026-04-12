import type { Request, Response } from "express";
import type { Express } from "express";
import { HttpError } from "../../lib/http-error.js";
import {
  adminAuditQuerySchema,
  adminBlockedEmailBodySchema,
  adminBlockedEmailQuerySchema,
  adminCreateUserSchema,
  adminDeleteUserQuerySchema,
  adminListUsersQuerySchema,
  adminPatchSettingsSchema,
  adminPaymentPricesBodySchema,
  adminResetBodySchema,
  adminRevisionsQuerySchema,
  adminRollbackBodySchema,
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
  getPLARTFORMAdminPayload,
  getUsageSeries,
  listUsersForAdmin,
  patchSiteSettings,
  putCmsContent,
  putPackagesMarketing,
  putPlansOverride,
  putPLARTFORMConfig,
  updateUserForAdmin,
} from "./admin.service.js";
import { buildPublicMediaUrl, listMediaAssets, persistMediaUpload } from "./media.service.js";
import {
  listAdminAuditLogs,
  listSettingRevisions,
  rollbackSettingRevision,
  type AdminActor,
  logAdminAudit,
} from "./admin-audit.service.js";
import { resetAdminScopesToDefaults } from "./admin-reset.service.js";
import {
  BETA_FLAG_CATALOG,
  FEATURE_FLAG_CATALOG,
  RESETTABLE_SCOPES,
} from "./admin-system-defaults.js";

function requireUserId(request: Request): string {
  const userId = request.authUser?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication is required.");
  }
  return userId;
}

function adminActor(request: Request): AdminActor {
  const u = request.authUser;
  if (!u?.id || !u?.email) {
    throw new HttpError(401, "Authentication is required.");
  }
  return { userId: u.id, email: u.email };
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
  const actor = adminActor(request);
  const updated = await updateUserForAdmin(userId, parsed.data, actor);
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
  const actor = adminActor(request);
  await deleteUserForAdmin(userId, actor, blockEmail);
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
  const actor = adminActor(request);
  await logAdminAudit(actor, "blocked_email.add", parsed.data.email, `E-posta engellendi: ${parsed.data.email}`);
  response.status(201).json({ ok: true });
}

export async function adminRemoveBlockedEmailController(request: Request, response: Response) {
  const parsed = adminBlockedEmailQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    throw new HttpError(400, "Query parameter email is required.");
  }
  await adminRemoveBlockedEmailRaw(parsed.data.email);
  const actor = adminActor(request);
  await logAdminAudit(actor, "blocked_email.remove", parsed.data.email, `Engel kaldırıldı: ${parsed.data.email}`);
  response.json({ ok: true });
}

export async function adminPutPaymentPricesController(request: Request, response: Response) {
  const parsed = adminPaymentPricesBodySchema.safeParse(request.body?.prices ?? request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  }
  await adminPutPaymentPrices(parsed.data, adminActor(request));
  response.json({ ok: true });
}

export async function adminCreateUserController(request: Request, response: Response) {
  const parsed = adminCreateUserSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  }
  const user = await createUserForAdmin(parsed.data);
  const actor = adminActor(request);
  await logAdminAudit(actor, "user.create", user.id, `Yeni kullanıcı: ${user.email}`);
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
  await patchSiteSettings(parsed.data.patches, adminActor(request));
  response.json({ ok: true });
}

export async function adminGetCmsController(_request: Request, response: Response) {
  const content = await getCmsContent();
  response.json({ content });
}

export async function adminPutCmsController(request: Request, response: Response) {
  await putCmsContent(request.body?.content ?? request.body, adminActor(request));
  response.json({ ok: true });
}

export async function adminPlansController(_request: Request, response: Response) {
  const payload = await getPlansAdminPayload();
  response.json(payload);
}

export async function adminPutPackagesMarketingController(request: Request, response: Response) {
  await putPackagesMarketing(request.body?.marketing ?? request.body, adminActor(request));
  response.json({ ok: true });
}

export async function adminPLARTFORMController(_request: Request, response: Response) {
  const payload = await getPLARTFORMAdminPayload();
  response.json(payload);
}

export async function adminPutPLARTFORMController(request: Request, response: Response) {
  await putPLARTFORMConfig(request.body?.config ?? request.body, adminActor(request));
  response.json({ ok: true });
}

export async function adminPutPlansOverrideController(request: Request, response: Response) {
  await putPlansOverride(request.body?.override ?? request.body, adminActor(request));
  response.json({ ok: true });
}

export async function adminControlMetaController(_request: Request, response: Response) {
  response.json({
    featureFlagCatalog: FEATURE_FLAG_CATALOG,
    betaFlagCatalog: BETA_FLAG_CATALOG,
    resettableScopes: RESETTABLE_SCOPES,
  });
}

export async function adminAuditLogController(request: Request, response: Response) {
  const parsed = adminAuditQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid query.");
  }
  const rows = await listAdminAuditLogs(parsed.data.limit);
  response.json({
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      userId: r.userId,
      userEmail: r.userEmail,
      action: r.action,
      targetKey: r.targetKey,
      summary: r.summary,
      meta: r.metaJson ? (JSON.parse(r.metaJson) as unknown) : null,
    })),
  });
}

export async function adminSettingRevisionsController(request: Request, response: Response) {
  const parsed = adminRevisionsQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid query.");
  }
  const rows = await listSettingRevisions(parsed.data.scope, parsed.data.limit);
  response.json({
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      scope: r.scope,
      userEmail: r.userEmail,
      summary: r.summary,
    })),
  });
}

export async function adminRollbackRevisionController(request: Request, response: Response) {
  const parsed = adminRollbackBodySchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  }
  const result = await rollbackSettingRevision(parsed.data.revisionId, adminActor(request));
  response.json(result);
}

export async function adminSystemResetController(request: Request, response: Response) {
  const parsed = adminResetBodySchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  }
  const result = await resetAdminScopesToDefaults(parsed.data.scopes, adminActor(request));
  response.json(result);
}

export async function adminUploadMediaController(request: Request, response: Response) {
  const file = (request as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    throw new HttpError(400, "No file uploaded.");
  }
  const buf = file.buffer as Buffer | undefined;
  if (!buf) {
    throw new HttpError(500, "Upload buffer missing; check multer memory storage.");
  }
  const row = await persistMediaUpload({
    buffer: buf,
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
    url: buildPublicMediaUrl(row.storageKey),
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
      url: buildPublicMediaUrl(a.storageKey),
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

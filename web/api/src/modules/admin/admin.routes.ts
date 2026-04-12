import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAdmin } from "../../middleware/admin.middleware.js";
import {
  adminAddBlockedEmailController,
  adminAuditLogController,
  adminControlMetaController,
  adminCreateUserController,
  adminDeleteUserController,
  adminGetCmsController,
  adminGetSettingsController,
  adminListBlockedEmailsController,
  adminListMediaController,
  adminListUsersController,
  adminOverviewController,
  adminPatchSettingsController,
  adminPlansController,
  adminPutCmsController,
  adminPutPackagesMarketingController,
  adminPutPaymentPricesController,
  adminPutPlansOverrideController,
  adminPutTOOLSController,
  adminRemoveBlockedEmailController,
  adminRollbackRevisionController,
  adminSettingRevisionsController,
  adminSystemResetController,
  adminTOOLSController,
  adminUpdateUserController,
  adminUploadMediaController,
  adminUsageExportController,
  adminUsageSeriesController,
} from "./admin.controller.js";
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okMime = /^image\//.test(file.mimetype) || file.mimetype === "application/pdf";
    const okExt = /\.(png|jpe?g|gif|webp|svg|pdf)$/i.test(file.originalname);
    if (okMime || okExt) {
      cb(null, true);
      return;
    }
    cb(new Error("Unsupported file type"));
  },
});

export const adminRouter = Router();

adminRouter.use(requireAdmin);

adminRouter.get("/overview", asyncHandler(adminOverviewController));
adminRouter.get("/stats", asyncHandler(adminOverviewController));

adminRouter.get("/users", asyncHandler(adminListUsersController));
adminRouter.post("/users", asyncHandler(adminCreateUserController));
adminRouter.delete("/users/:id", asyncHandler(adminDeleteUserController));
adminRouter.patch("/users/:id", asyncHandler(adminUpdateUserController));

adminRouter.get("/blocked-emails", asyncHandler(adminListBlockedEmailsController));
adminRouter.post("/blocked-emails", asyncHandler(adminAddBlockedEmailController));
adminRouter.delete("/blocked-emails", asyncHandler(adminRemoveBlockedEmailController));

adminRouter.get("/settings", asyncHandler(adminGetSettingsController));
adminRouter.put("/settings", asyncHandler(adminPatchSettingsController));

adminRouter.get("/control/meta", asyncHandler(adminControlMetaController));
adminRouter.get("/audit-log", asyncHandler(adminAuditLogController));
adminRouter.get("/revisions", asyncHandler(adminSettingRevisionsController));
adminRouter.post("/revisions/rollback", asyncHandler(adminRollbackRevisionController));
adminRouter.post("/system/reset", asyncHandler(adminSystemResetController));

adminRouter.get("/cms", asyncHandler(adminGetCmsController));
adminRouter.put("/cms", asyncHandler(adminPutCmsController));

adminRouter.get("/plans", asyncHandler(adminPlansController));
adminRouter.put("/plans/pricing", asyncHandler(adminPutPaymentPricesController));
adminRouter.put("/plans/override", asyncHandler(adminPutPlansOverrideController));
adminRouter.put("/packages/marketing", asyncHandler(adminPutPackagesMarketingController));

adminRouter.post("/media", mediaUpload.single("file"), asyncHandler(adminUploadMediaController));
adminRouter.get("/media", asyncHandler(adminListMediaController));

adminRouter.get("/TOOLS", asyncHandler(adminTOOLSController));
adminRouter.put("/TOOLS/config", asyncHandler(adminPutTOOLSController));

adminRouter.get("/reports/usage-series", asyncHandler(adminUsageSeriesController));
adminRouter.get("/reports/usage-export", asyncHandler(adminUsageExportController));

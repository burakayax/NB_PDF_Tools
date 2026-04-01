import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAdmin } from "../../middleware/admin.middleware.js";
import {
  adminAddBlockedEmailController,
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
  adminPutToolsController,
  adminRemoveBlockedEmailController,
  adminToolsController,
  adminUpdateUserController,
  adminUploadMediaController,
  adminUsageExportController,
  adminUsageSeriesController,
} from "./admin.controller.js";
import { getMediaUploadRoot } from "./media.service.js";

function ensureMediaDir(): string {
  const root = getMediaUploadRoot();
  fs.mkdirSync(root, { recursive: true });
  return root;
}

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, ensureMediaDir());
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 12).toLowerCase();
      cb(null, `${randomUUID()}${ext || ""}`);
    },
  }),
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

adminRouter.get("/cms", asyncHandler(adminGetCmsController));
adminRouter.put("/cms", asyncHandler(adminPutCmsController));

adminRouter.get("/plans", asyncHandler(adminPlansController));
adminRouter.put("/plans/pricing", asyncHandler(adminPutPaymentPricesController));
adminRouter.put("/plans/override", asyncHandler(adminPutPlansOverrideController));
adminRouter.put("/packages/marketing", asyncHandler(adminPutPackagesMarketingController));

adminRouter.post("/media", mediaUpload.single("file"), asyncHandler(adminUploadMediaController));
adminRouter.get("/media", asyncHandler(adminListMediaController));

adminRouter.get("/tools", asyncHandler(adminToolsController));
adminRouter.put("/tools/config", asyncHandler(adminPutToolsController));

adminRouter.get("/reports/usage-series", asyncHandler(adminUsageSeriesController));
adminRouter.get("/reports/usage-export", asyncHandler(adminUsageExportController));

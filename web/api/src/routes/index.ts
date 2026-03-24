import { Router } from "express";
import { analyticsRouter } from "../modules/analytics/analytics.routes.js";
import { authRouter } from "../modules/auth/auth.routes.js";
import { contactRouter } from "../modules/contact/contact.routes.js";
import { licenseRouter } from "../modules/license/license.routes.js";
import { monitoringRouter } from "../modules/monitoring/monitoring.routes.js";
import { subscriptionRouter } from "../modules/subscription/subscription.routes.js";
import { userRouter } from "../modules/user/user.routes.js";

export const apiRouter = Router();

apiRouter.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "nb-pdf-tools-auth-api",
  });
});

apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/contact", contactRouter);
apiRouter.use("/errors", monitoringRouter);
apiRouter.use("/license", licenseRouter);
apiRouter.use("/subscription", subscriptionRouter);
apiRouter.use("/user", userRouter);

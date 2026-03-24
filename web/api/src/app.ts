import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { logError } from "./lib/app-logger.js";
import { asyncHandler } from "./lib/async-handler.js";
import { HttpError } from "./lib/http-error.js";
import { verifyEmailController } from "./modules/auth/auth.controller.js";
import { submitContactController } from "./modules/contact/contact.controller.js";
import { contactPostLimiter } from "./modules/contact/contact.rate-limit.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.get("/verify-email", (request, response, next) => {
  void verifyEmailController(request, response).catch(next);
});

// İletişim formunu kök URL altında da kabul eder; gövde POST /api/contact ile aynı denetleyicidir.
// Eski veya kısa URL sözleşmeleri ve CDN yönlendirmeleri için esnek giriş noktası sağlar.
// Yol veya handler ayrılırsa istemciler yanlış uç noktaya yazıp 404 alabilir.
app.post("/contact", contactPostLimiter, asyncHandler(submitContactController));

app.use("/api", apiRouter);

// İstek yolunu sorgu dizesi olmadan döndürür; günlük ve hata kayıtlarında tutarlı anahtar üretir.
// Express'te path ve originalUrl farklı bağlamlarda farklı değerler verebileceği için tek yerde toplanır.
// Yanlış alan seçilirse aynı uç nokta farklı path anahtarlarıyla loglanır ve korelasyon zorlaşır.
function requestPath(request: express.Request) {
  return request.originalUrl?.split("?")[0] ?? request.url?.split("?")[0] ?? "";
}

// Şifre ile giriş ve kayıt için 4xx HttpError'ları dosya günlüğünde iki kez yazmayı engeller (controller zaten yazar).
// Gürültüyü azaltır; 5xx ve diğer rotalar etkilenmez.
// Bu filtre kaldırılırsa aynı olay hem login_attempt hem error satırında tekrarlanır.
function skipDuplicateHttpErrorLog(request: express.Request, statusCode: number) {
  if (statusCode >= 500) {
    return false;
  }
  if (request.method !== "POST") {
    return false;
  }
  const p = requestPath(request);
  const authFormRoutes =
    p === "/api/auth/login" ||
    p.endsWith("/auth/login") ||
    p === "/api/auth/register" ||
    p.endsWith("/auth/register");
  return authFormRoutes;
}

// Merkezi hata işleyici: HttpError, Zod doğrulama ve beklenmeyen hataları JSON yanıtına çevirir ve dosyaya loglar.
// Tüm API için tutarlı hata sözleşmesi ve üretim izlenebilirliği sağlamak zorundadır.
// Sıra bozulursa veya middleware atlanırsa istemciye ham hata sızdırılabilir veya loglar eksik kalır.
app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const ip = request.ip || request.socket?.remoteAddress;
  const path = requestPath(request);

  if (error instanceof HttpError) {
    if (!skipDuplicateHttpErrorLog(request, error.statusCode)) {
      logError({
        category: "http",
        message: error.message,
        status: error.statusCode,
        method: request.method,
        path,
        ip,
      });
    }
    response.status(error.statusCode).json({ message: error.message });
    return;
  }

  if (error instanceof ZodError) {
    logError({
      category: "validation",
      message: error.issues[0]?.message ?? "Validation failed.",
      status: 400,
      method: request.method,
      path,
      ip,
      issues: error.issues.map((i) => i.message),
    });
    response.status(400).json({ message: error.issues[0]?.message ?? "Validation failed." });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    logError({
      category: "prisma",
      message: error.message,
      status: 400,
      method: request.method,
      path,
      ip,
      prismaCode: error.code,
      meta: error.meta,
    });
    console.error("[prisma]", error.code, error.message, error.meta);

    if (error.code === "P2002") {
      const targets = (error.meta?.target as string[] | undefined) ?? [];
      const label = targets.length ? targets.join(", ") : "field";
      response.status(409).json({
        message: `A record with this ${label} already exists.`,
      });
      return;
    }

    if (error.code === "P2021" || error.code === "P2010") {
      response.status(503).json({
        message:
          env.NODE_ENV === "development"
            ? `[${error.code}] ${error.message}`
            : "Database schema is out of sync. From the web/api folder run: npx prisma db push && npx prisma generate",
      });
      return;
    }

    response.status(400).json({
      message:
        env.NODE_ENV === "development"
          ? `[Prisma ${error.code}] ${error.message}`
          : "Database request failed. If this persists, run prisma db push and restart the API.",
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    logError({
      category: "prisma",
      message: error.message,
      status: 400,
      method: request.method,
      path,
      ip,
    });
    console.error("[prisma] validation", error.message);
    response.status(400).json({
      message:
        env.NODE_ENV === "development" ? error.message : "Invalid data sent to the server.",
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    logError({
      category: "prisma",
      message: error.message,
      status: 503,
      method: request.method,
      path,
      ip,
    });
    console.error("[prisma] init", error.message);
    response.status(503).json({
      message:
        env.NODE_ENV === "development"
          ? error.message
          : "Cannot connect to the database. Check DATABASE_URL in web/api/.env.",
    });
    return;
  }

  const stack = error instanceof Error ? error.stack : undefined;
  logError({
    category: "unhandled",
    message: error instanceof Error ? error.message : String(error),
    status: 500,
    method: request.method,
    path,
    ip,
    stack,
  });
  console.error(error);
  if (env.NODE_ENV === "development") {
    response.status(500).json({
      message: error instanceof Error ? error.message : "An unexpected server error occurred.",
      ...(error instanceof Error && stack ? { detail: stack.split("\n").slice(0, 6).join("\n") } : {}),
    });
    return;
  }
  response.status(500).json({ message: "An unexpected server error occurred." });
});

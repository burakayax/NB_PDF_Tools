import rateLimit from "express-rate-limit";

/**
 * İletişim uç noktası: aynı IP için dakikada en fazla 5 POST (express-rate-limit).
 * Üretimde doğru IP için `app.set("trust proxy", …)` ayarı gerekir (ters proxy arkasında).
 */
export const contactPostLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: {
    message: "Too many contact requests from this IP. Please try again in a minute.",
  },
});

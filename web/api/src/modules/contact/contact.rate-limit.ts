import rateLimit from "express-rate-limit";

export const contactPostLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many contact requests from this IP. Please try again in a minute.",
  },
});

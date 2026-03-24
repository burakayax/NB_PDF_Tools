declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        email: string;
        plan: "FREE" | "PRO" | "BUSINESS";
        role: "USER" | "ADMIN";
      };
    }
  }
}

export {};

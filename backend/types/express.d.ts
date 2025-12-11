declare namespace Express {
  interface Request {
    user?: {
      userId: number;
      role: string;
      sntId: number;
    };
  }
}


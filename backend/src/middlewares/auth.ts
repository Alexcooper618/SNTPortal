import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const auth = (roles?: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      if (!header) return res.status(401).json({ error: "No token" });

      const token = header.split(" ")[1];
      if (!token) return res.status(401).json({ error: "Invalid token format" });

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      req.user = decoded;

      if (roles && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      next();
    } catch (err) {
      console.error(err);
      res.status(401).json({ error: "Unauthorized" });
    }
  };
};


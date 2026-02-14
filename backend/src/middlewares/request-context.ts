import { NextFunction, Request, Response } from "express";
import crypto from "crypto";

export const requestContext = (req: Request, _res: Response, next: NextFunction) => {
  req.requestId = crypto.randomUUID();
  next();
};

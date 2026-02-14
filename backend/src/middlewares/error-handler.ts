import { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/errors";

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    code: "NOT_FOUND",
    message: `Route '${req.path}' not found`,
    requestId: req.requestId,
  });
};

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      code: error.code,
      message: error.message,
      details: error.details,
      requestId: req.requestId,
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "Unexpected server error",
    requestId: req.requestId,
  });
};

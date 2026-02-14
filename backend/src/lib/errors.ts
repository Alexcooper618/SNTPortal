export interface ApiErrorDetails {
  [key: string]: unknown;
}

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: ApiErrorDetails;

  constructor(statusCode: number, code: string, message: string, details?: ApiErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: ApiErrorDetails) =>
  new ApiError(400, "BAD_REQUEST", message, details);

export const unauthorized = (message = "Authentication required") =>
  new ApiError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "Access denied") =>
  new ApiError(403, "FORBIDDEN", message);

export const notFound = (message: string) =>
  new ApiError(404, "NOT_FOUND", message);

export const conflict = (message: string, details?: ApiErrorDetails) =>
  new ApiError(409, "CONFLICT", message, details);

export const customError = (
  statusCode: number,
  code: string,
  message: string,
  details?: ApiErrorDetails
) => new ApiError(statusCode, code, message, details);

import { badRequest } from "./errors";

const PHONE_REGEX = /^\+?[1-9]\d{9,14}$/;

export const normalizePhone = (phone: string): string => {
  const normalized = phone.replace(/[\s()-]/g, "");
  if (!PHONE_REGEX.test(normalized)) {
    throw badRequest("phone must be a valid E.164-like number");
  }
  return normalized;
};

export const assertString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`${fieldName} is required`);
  }
  return value.trim();
};

export const assertNumber = (value: unknown, fieldName: string): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw badRequest(`${fieldName} must be a number`);
  }
  return numeric;
};

export const assertArray = <T>(value: unknown, fieldName: string): T[] => {
  if (!Array.isArray(value)) {
    throw badRequest(`${fieldName} must be an array`);
  }
  return value as T[];
};

import crypto from "crypto";

export const hashValue = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

export const generateOtpCode = (): string =>
  String(Math.floor(100000 + Math.random() * 900000));

export const randomToken = (bytes = 48): string =>
  crypto.randomBytes(bytes).toString("hex");

export const nowPlusMinutes = (minutes: number): Date =>
  new Date(Date.now() + minutes * 60 * 1000);

export const nowPlusDays = (days: number): Date =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000);

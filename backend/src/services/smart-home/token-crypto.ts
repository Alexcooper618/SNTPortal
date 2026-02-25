import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;

const deriveKey = (secret: string): Buffer => {
  return crypto.createHash("sha256").update(secret).digest();
};

const toBase64Url = (value: Buffer): string => value.toString("base64url");
const fromBase64Url = (value: string): Buffer => Buffer.from(value, "base64url");

export const encryptToken = (token: string, secret: string): string => {
  const iv = crypto.randomBytes(IV_BYTES);
  const key = deriveKey(secret);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, toBase64Url(iv), toBase64Url(tag), toBase64Url(encrypted)].join(".");
};

export const decryptToken = (cipherText: string, secret: string): string => {
  const [version, ivRaw, tagRaw, encryptedRaw] = cipherText.split(".");
  if (version !== VERSION || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted token format");
  }

  const key = deriveKey(secret);
  const iv = fromBase64Url(ivRaw);
  const tag = fromBase64Url(tagRaw);
  const encrypted = fromBase64Url(encryptedRaw);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
};

export const maskToken = (token: string): string => {
  if (token.length <= 8) return "********";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
};

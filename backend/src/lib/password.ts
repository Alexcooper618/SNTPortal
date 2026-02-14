import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { badRequest } from "./errors";

const PASSWORD_POLICY = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

const getWorkFactor = () => (process.env.NODE_ENV === "production" ? 12 : 10);

const toScryptN = (workFactor: number) => Math.pow(2, workFactor);

const parseHash = (value: string) => {
  const [scheme, nRaw, rRaw, pRaw, saltHex, derivedHex] = value.split("$");
  if (scheme !== "scrypt" || !nRaw || !rRaw || !pRaw || !saltHex || !derivedHex) {
    return null;
  }

  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return null;
  }

  return {
    N,
    r,
    p,
    salt: Buffer.from(saltHex, "hex"),
    derived: Buffer.from(derivedHex, "hex"),
  };
};

export const validatePasswordPolicy = (password: string) => {
  if (!PASSWORD_POLICY.test(password)) {
    throw badRequest("Password must have at least 8 chars, one letter and one number");
  }
};

export const hashPassword = async (password: string): Promise<string> => {
  validatePasswordPolicy(password);

  const salt = randomBytes(16);
  const workFactor = getWorkFactor();
  const N = toScryptN(workFactor);
  const r = 8;
  const p = 1;

  const derived = scryptSync(password, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${derived.toString("hex")}`;
};

export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const parsed = parseHash(storedHash);
  if (!parsed) {
    return false;
  }

  const derived = scryptSync(password, parsed.salt, parsed.derived.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
  });

  if (derived.length !== parsed.derived.length) {
    return false;
  }

  return timingSafeEqual(derived, parsed.derived);
};

type WithPasswordHash = {
  passwordHash?: unknown;
};

// Preserve extra selected/include fields on User payloads while stripping password hash.
export const sanitizeUser = <T extends WithPasswordHash>(user: T): Omit<T, "passwordHash"> => {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
};

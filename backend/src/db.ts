import { PrismaClient } from "@prisma/client";
import { env } from "./config/env";

export const prisma = new PrismaClient({
  datasourceUrl: env.databaseUrl,
});

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

const DB_URL =
  process.env.DATABASE_URL ?? `file:${path.resolve("prisma/kinetica.db")}`;

function createPrismaClient() {
  const adapter = new PrismaLibSql({ url: DB_URL });
  return new PrismaClient({ adapter });
}

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const db = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}

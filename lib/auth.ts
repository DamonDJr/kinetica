import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // update session every 24h
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "member",
      },
    },
  },
  trustedOrigins: [
    process.env.NEXTAUTH_URL ?? "",
    process.env.TAILSCALE_URL ?? "",
    // Plain `next dev` runs on localhost regardless of the URLs above.
    "http://localhost:3000",
  ].filter(Boolean),
});

export type Auth = typeof auth;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["damonj-pc.tailcc1d47.ts.net"],
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
  },
  // Allow self-signed TLS in dev
  ...(process.env.NODE_ENV === "development" && {
    httpAgentOptions: { keepAlive: true },
  }),
};

export default nextConfig;

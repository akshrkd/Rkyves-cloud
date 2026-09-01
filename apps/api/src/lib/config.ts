import { readFileSync } from "fs";

function parsePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  try {
    return Buffer.from(raw, "base64").toString("utf8");
  } catch {
    return raw;
  }
}

function loadPrivateKey(): string | undefined {
  const keyFile = process.env.GITHUB_APP_PRIVATE_KEY_FILE;
  if (keyFile) {
    try {
      return readFileSync(keyFile, "utf8");
    } catch {
      // Fall back to env var when the mounted file is missing.
    }
  }
  return parsePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY);
}

export const config = {
  port: parseInt(process.env.API_PORT ?? "3001", 10),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  apiPublicUrl: process.env.API_PUBLIC_URL ?? "http://localhost:3001",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  agentToken: process.env.AGENT_TOKEN ?? "agent-secret-token",
  platformDomain: process.env.PLATFORM_DOMAIN ?? "rkyves.com",
  github: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: loadPrivateKey(),
    clientId: process.env.GITHUB_APP_CLIENT_ID,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "dev-github-webhook-secret",
    appSlug: process.env.GITHUB_APP_SLUG ?? "rkyves",
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
    accessKey: process.env.MINIO_ACCESS_KEY ?? "rkyves",
    secretKey: process.env.MINIO_SECRET_KEY ?? "rkyves-secret",
    bucketPrefix: process.env.MINIO_BUCKET_PREFIX ?? "rkyves",
  },
};

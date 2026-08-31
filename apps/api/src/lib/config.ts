export const config = {
  port: parseInt(process.env.API_PORT ?? "3001", 10),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  agentToken: process.env.AGENT_TOKEN ?? "agent-secret-token",
  platformDomain: process.env.PLATFORM_DOMAIN ?? "rkyves.local",
  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
    accessKey: process.env.MINIO_ACCESS_KEY ?? "rkyves",
    secretKey: process.env.MINIO_SECRET_KEY ?? "rkyves-secret",
    bucketPrefix: process.env.MINIO_BUCKET_PREFIX ?? "rkyves",
  },
};

export const agentConfig = {
  apiUrl: process.env.AGENT_API_URL ?? "http://localhost:3001",
  agentToken: process.env.AGENT_TOKEN ?? "agent-secret-token",
  workerId: process.env.WORKER_ID ?? "worker-1",
  hostname: process.env.HOSTNAME ?? "localhost",
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10),
  traefikNetwork: process.env.TRAEFIK_NETWORK ?? "rkyves-platform",
  platformDomain: process.env.PLATFORM_DOMAIN ?? "rkyves.local",
  minioEndpoint: process.env.MINIO_ENDPOINT ?? "http://minio:9000",
  cpuCores: parseInt(process.env.CPU_CORES ?? "4", 10),
  memoryMb: parseInt(process.env.MEMORY_MB ?? "16384", 10),
  diskGb: parseInt(process.env.DISK_GB ?? "100", 10),
};

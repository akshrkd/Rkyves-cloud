import { prisma } from "@rkyves/db";
import { generatePassword, slugify } from "@rkyves/shared";
import { createProjectBucket } from "../lib/minio.js";
import { enqueueProvision } from "../lib/queue.js";

export async function assignWorker(serviceId: string, preferredWorkerId?: string) {
  let worker = preferredWorkerId
    ? await prisma.worker.findUnique({ where: { workerId: preferredWorkerId } })
    : null;

  if (!worker) {
    worker = await prisma.worker.findFirst({
      where: { status: "online" },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  if (!worker) {
    worker = await prisma.worker.findFirst({ orderBy: { createdAt: "asc" } });
  }

  if (!worker) {
    throw new Error("No workers registered");
  }

  await prisma.service.update({
    where: { id: serviceId },
    data: { workerId: worker.id, status: "provisioning" },
  });

  return worker;
}

export async function buildServiceConfig(
  type: string,
  name: string,
  projectSlug: string,
  inputConfig: Record<string, unknown> = {}
) {
  const slug = slugify(name);
  const base = { ...inputConfig };

  switch (type) {
    case "postgres": {
      const database = (base.database as string) ?? `${projectSlug}_${slug}`.replace(/-/g, "_");
      const username = (base.username as string) ?? "rkyves";
      const password = generatePassword(20);
      return {
        config: { ...base, database, username, password, version: base.version ?? "16" },
        secrets: { POSTGRES_PASSWORD: password },
      };
    }
    case "redis": {
      const password = generatePassword(20);
      return {
        config: { ...base, password, version: base.version ?? "7", maxMemory: base.maxMemory ?? "256mb" },
        secrets: { REDIS_PASSWORD: password },
      };
    }
    case "storage": {
      const bucketName = (base.bucketName as string) ?? `rkyves-${projectSlug}`;
      const accessKey = generatePassword(16);
      const secretKey = generatePassword(32);
      await createProjectBucket(projectSlug);
      return {
        config: { ...base, bucketName, accessKey, secretKey, publicRead: base.publicRead ?? false },
        secrets: { MINIO_ACCESS_KEY: accessKey, MINIO_SECRET_KEY: secretKey },
      };
    }
    case "web": {
      return {
        config: {
          gitBranch: "main",
          dockerfilePath: "Dockerfile",
          port: 3000,
          healthCheckPath: "/health",
          ...base,
        },
        secrets: {},
      };
    }
    case "cron": {
      return { config: base, secrets: {} };
    }
    default:
      return { config: base, secrets: {} };
  }
}

export async function queueServiceProvision(serviceId: string, workerId?: string) {
  const worker = await assignWorker(serviceId, workerId);
  await prisma.agentTask.create({
    data: {
      workerId: worker.workerId,
      serviceId,
      type: "provision",
      payload: {},
    },
  });
  await enqueueProvision(serviceId, worker.workerId);
}

export function getNetworkName(projectSlug: string): string {
  return `rkyves-net-${projectSlug}`;
}

export function getContainerName(projectSlug: string, serviceSlug: string): string {
  return `rkyves-${projectSlug}-${serviceSlug}`;
}

import { Hono } from "hono";
import { prisma } from "@rkyves/db";
import { agentRegisterSchema, agentStatusReportSchema } from "@rkyves/shared";
import { requireAgent } from "../middleware/auth.js";
import { decrypt } from "../lib/crypto.js";

export const agentRoutes = new Hono();

agentRoutes.use("*", requireAgent);

agentRoutes.post("/register", async (c) => {
  const body = agentRegisterSchema.parse(await c.req.json());

  const worker = await prisma.worker.upsert({
    where: { workerId: body.workerId },
    update: {
      hostname: body.hostname,
      status: "online",
      cpuCores: body.capacity.cpuCores,
      memoryMb: body.capacity.memoryMb,
      diskGb: body.capacity.diskGb,
      lastSeenAt: new Date(),
    },
    create: {
      workerId: body.workerId,
      hostname: body.hostname,
      status: "online",
      cpuCores: body.capacity.cpuCores,
      memoryMb: body.capacity.memoryMb,
      diskGb: body.capacity.diskGb,
      lastSeenAt: new Date(),
    },
  });

  return c.json({ ok: true, worker });
});

agentRoutes.post("/heartbeat", async (c) => {
  const { workerId } = await c.req.json();
  await prisma.worker.updateMany({
    where: { workerId },
    data: { lastSeenAt: new Date(), status: "online" },
  });
  return c.json({ ok: true });
});

agentRoutes.get("/tasks", async (c) => {
  const workerId = c.req.query("workerId");
  if (!workerId) return c.json({ error: "workerId required" }, 400);

  const tasks = await prisma.agentTask.findMany({
    where: { workerId, status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  if (tasks.length > 0) {
    await prisma.agentTask.updateMany({
      where: { id: { in: tasks.map((t) => t.id) } },
      data: { status: "claimed", claimedAt: new Date() },
    });
  }

  return c.json(tasks);
});

agentRoutes.get("/services/:serviceId", async (c) => {
  const service = await prisma.service.findUnique({
    where: { id: c.req.param("serviceId") },
    include: {
      project: { include: { organization: true } },
      envVars: true,
      domains: true,
      deployments: { where: { status: "queued" }, take: 1, orderBy: { startedAt: "desc" } },
    },
  });
  if (!service) return c.json({ error: "Not found" }, 404);

  const env: Record<string, string> = {};
  for (const v of service.envVars) {
    env[v.key] = decrypt(v.valueEnc);
  }

  return c.json({
    ...service,
    env,
    config: service.config as Record<string, unknown>,
    connectionInfo: service.connectionInfo as Record<string, string> | null,
    pendingDeployment: service.deployments[0] ?? null,
  });
});

agentRoutes.post("/status", async (c) => {
  const body = agentStatusReportSchema.parse(await c.req.json());

  await prisma.service.update({
    where: { id: body.serviceId },
    data: {
      status: body.status,
      connectionInfo: body.connectionInfo ?? undefined,
      containerId: body.containerId ?? undefined,
    },
  });

  await prisma.agentTask.updateMany({
    where: {
      serviceId: body.serviceId,
      workerId: body.workerId,
      status: "claimed",
    },
    data: { status: "completed", completedAt: new Date() },
  });

  return c.json({ ok: true });
});

agentRoutes.post("/deployments/:deploymentId/status", async (c) => {
  const { status, buildLogs, error, imageTag, gitCommit } = await c.req.json();
  await prisma.deployment.update({
    where: { id: c.req.param("deploymentId") },
    data: {
      status,
      buildLogs,
      error,
      imageTag,
      gitCommit,
      completedAt: ["success", "failed"].includes(status) ? new Date() : undefined,
    },
  });
  return c.json({ ok: true });
});

agentRoutes.get("/services/:serviceId/logs", async (c) => {
  const service = await prisma.service.findUnique({
    where: { id: c.req.param("serviceId") },
  });
  if (!service?.containerId) {
    return c.json({ logs: "", message: "No container" });
  }
  return c.json({
    serviceId: service.id,
    containerId: service.containerId,
    message: "Logs retrieved by agent at runtime",
  });
});

agentRoutes.get("/workers", async (c) => {
  const workers = await prisma.worker.findMany({ orderBy: { workerId: "asc" } });
  return c.json(workers);
});

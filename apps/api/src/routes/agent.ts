import { Hono } from "hono";
import { prisma } from "@rkyves/db";
import { agentRegisterSchema, agentStatusReportSchema, agentMetricsSchema, agentRuntimeLogsSchema } from "@rkyves/shared";
import { requireAgent } from "../middleware/auth.js";
import { decrypt } from "../lib/crypto.js";
import { buildAuthenticatedCloneUrl, getInstallationToken } from "../services/github.js";
import { emitOrgEvent } from "../lib/events.js";

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
      githubRepoLink: true,
      deployments: { where: { status: "queued" }, take: 1, orderBy: { startedAt: "desc" } },
    },
  });
  if (!service) return c.json({ error: "Not found" }, 404);

  const env: Record<string, string> = {};
  for (const v of service.envVars) {
    env[v.key] = decrypt(v.valueEnc);
  }

  const serviceConfig = service.config as Record<string, unknown>;
  let cloneUrl: string | undefined;

  const installationId = serviceConfig.gitInstallationId as number | undefined;
  const gitOwner = serviceConfig.gitOwner as string | undefined;
  const gitRepoName = serviceConfig.gitRepoName as string | undefined;

  if (installationId && gitOwner && gitRepoName) {
    try {
      const token = await getInstallationToken(installationId);
      cloneUrl = buildAuthenticatedCloneUrl(gitOwner, gitRepoName, token);
    } catch (err) {
      console.error("Failed to get GitHub clone token:", err);
    }
  }

  return c.json({
    ...service,
    env,
    config: serviceConfig,
    connectionInfo: service.connectionInfo as Record<string, string> | null,
    pendingDeployment: service.deployments[0] ?? null,
    cloneUrl,
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
    include: { project: true },
  });

  const service = await prisma.service.findUnique({
    where: { id: body.serviceId },
    include: { project: true },
  });
  if (service) {
    emitOrgEvent(service.project.organizationId, "service.updated", {
      serviceId: service.id,
      status: body.status,
    });
  }

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
  const deployment = await prisma.deployment.update({
    where: { id: c.req.param("deploymentId") },
    data: {
      status,
      buildLogs,
      error,
      imageTag,
      gitCommit,
      completedAt: ["success", "failed"].includes(status) ? new Date() : undefined,
    },
    include: {
      service: { include: { project: true } },
    },
  });

  emitOrgEvent(deployment.service.project.organizationId, "deployment.updated", {
    deploymentId: deployment.id,
    serviceId: deployment.serviceId,
    status,
  });

  return c.json({ ok: true });
});

agentRoutes.post("/metrics", async (c) => {
  const body = agentMetricsSchema.parse(await c.req.json());
  const worker = await prisma.worker.findUnique({ where: { workerId: body.workerId } });
  if (!worker) return c.json({ error: "Worker not found" }, 404);

  await prisma.serviceMetricSnapshot.create({
    data: {
      workerId: worker.id,
      serviceId: body.serviceId ?? undefined,
      cpuPercent: body.cpuPercent,
      memoryMb: body.memoryMb,
      diskGb: body.diskGb,
    },
  });

  return c.json({ ok: true });
});

agentRoutes.post("/services/:serviceId/logs", async (c) => {
  const body = agentRuntimeLogsSchema.parse(await c.req.json());
  if (body.serviceId !== c.req.param("serviceId")) {
    return c.json({ error: "Service mismatch" }, 400);
  }

  await prisma.service.update({
    where: { id: body.serviceId },
    data: { runtimeLogs: body.logs.slice(-500_000) },
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

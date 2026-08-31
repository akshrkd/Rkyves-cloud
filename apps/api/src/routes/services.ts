import { Hono } from "hono";
import { prisma, Prisma } from "@rkyves/db";
import {
  createServiceSchema,
  createEnvVarSchema,
  createDomainSchema,
  triggerDeploySchema,
  slugify,
} from "@rkyves/shared";
import { encrypt, decrypt } from "../lib/crypto.js";
import { config } from "../lib/config.js";
import { enqueueDeploy } from "../lib/queue.js";
import { requireAuth, requireUser } from "../middleware/auth.js";
import {
  buildServiceConfig,
  queueServiceProvision,
  getNetworkName,
} from "../services/provisioning.js";

export const serviceRoutes = new Hono();

serviceRoutes.use("*", requireAuth, requireUser);

async function getProjectForUser(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { organization: true },
  });
  if (!project) return null;

  const membership = await prisma.orgMember.findFirst({
    where: { userId, organizationId: project.organizationId },
  });
  if (!membership) return null;

  return project;
}

serviceRoutes.get("/projects/:projectId/services", async (c) => {
  const user = c.get("user");
  const project = await getProjectForUser(c.req.param("projectId"), user.id);
  if (!project) return c.json({ error: "Not found" }, 404);

  const services = await prisma.service.findMany({
    where: { projectId: project.id },
    include: {
      domains: true,
      _count: { select: { deployments: true, envVars: true } },
      worker: { select: { workerId: true, hostname: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json(services);
});

serviceRoutes.post("/projects/:projectId/services", async (c) => {
  const user = c.get("user");
  const project = await getProjectForUser(c.req.param("projectId"), user.id);
  if (!project) return c.json({ error: "Not found" }, 404);

  const body = createServiceSchema.parse(await c.req.json());
  const slug = slugify(body.name);

  const existing = await prisma.service.findFirst({
    where: { projectId: project.id, slug },
  });
  if (existing) return c.json({ error: "Service slug already exists" }, 409);

  const { config: serviceConfig, secrets } = await buildServiceConfig(
    body.type,
    body.name,
    project.slug,
    (body.config ?? {}) as Record<string, unknown>
  );

  const networkName = getNetworkName(project.slug);
  const configJson = serviceConfig as Prisma.InputJsonValue;

  const service = await prisma.service.create({
    data: {
      projectId: project.id,
      name: body.name,
      slug,
      type: body.type,
      status: "pending",
      config: configJson,
      networkName,
    },
  });

  for (const [key, value] of Object.entries(secrets)) {
    await prisma.envVar.create({
      data: {
        serviceId: service.id,
        key,
        valueEnc: encrypt(value),
        isSecret: true,
      },
    });
  }

  await queueServiceProvision(service.id);

  const cronConfig = serviceConfig as Record<string, unknown>;
  if (body.type === "cron" && cronConfig.schedule) {
    await prisma.cronJob.create({
      data: {
        serviceId: service.id,
        name: "default",
        schedule: cronConfig.schedule as string,
        targetType: (cronConfig.targetType as "http" | "container") ?? "http",
        targetUrl: cronConfig.targetUrl as string | undefined,
        targetImage: cronConfig.targetImage as string | undefined,
        targetCommand: cronConfig.targetCommand as string | undefined,
        timezone: (cronConfig.timezone as string) ?? "UTC",
      },
    });
  }

  const full = await prisma.service.findUnique({
    where: { id: service.id },
    include: { domains: true, worker: true },
  });

  return c.json(full, 201);
});

serviceRoutes.get("/services/:serviceId", async (c) => {
  const user = c.get("user");
  const service = await prisma.service.findUnique({
    where: { id: c.req.param("serviceId") },
    include: {
      project: { include: { organization: true } },
      domains: true,
      envVars: { select: { id: true, key: true, isSecret: true } },
      deployments: { orderBy: { startedAt: "desc" }, take: 10 },
      worker: true,
      cronJobs: true,
    },
  });
  if (!service) return c.json({ error: "Not found" }, 404);

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id, organizationId: service.project.organizationId },
  });
  if (!membership) return c.json({ error: "Not found" }, 404);

  return c.json({
    ...service,
    connectionInfo: service.connectionInfo,
  });
});

serviceRoutes.delete("/services/:serviceId", async (c) => {
  const user = c.get("user");
  const service = await prisma.service.findUnique({
    where: { id: c.req.param("serviceId") },
    include: { project: true, worker: true },
  });
  if (!service) return c.json({ error: "Not found" }, 404);

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id, organizationId: service.project.organizationId },
  });
  if (!membership || membership.role === "member") {
    return c.json({ error: "Forbidden" }, 403);
  }

  await prisma.service.update({
    where: { id: service.id },
    data: { status: "deleting" },
  });

  if (service.worker) {
    await prisma.agentTask.create({
      data: {
        workerId: service.worker.workerId,
        serviceId: service.id,
        type: "delete",
        payload: {},
      },
    });
  }

  return c.json({ ok: true, status: "deleting" });
});

serviceRoutes.post("/services/:serviceId/deploy", async (c) => {
  const user = c.get("user");
  const body = triggerDeploySchema.parse(await c.req.json().catch(() => ({})));
  const service = await prisma.service.findUnique({
    where: { id: c.req.param("serviceId") },
    include: { project: true },
  });
  if (!service || service.type !== "web") {
    return c.json({ error: "Web service required" }, 400);
  }

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id, organizationId: service.project.organizationId },
  });
  if (!membership) return c.json({ error: "Not found" }, 404);

  const deployment = await prisma.deployment.create({
    data: {
      serviceId: service.id,
      status: "queued",
      gitRef: body.gitRef,
      imageTag: body.imageTag,
    },
  });

  const worker = await prisma.worker.findFirst({
    where: { id: service.workerId ?? undefined },
  });

  if (worker) {
    await prisma.agentTask.create({
      data: {
        workerId: worker.workerId,
        serviceId: service.id,
        type: "deploy",
        payload: { deploymentId: deployment.id },
      },
    });
  }

  await enqueueDeploy(deployment.id, service.id);
  return c.json(deployment, 201);
});

serviceRoutes.get("/services/:serviceId/logs", async (c) => {
  const user = c.get("user");
  const tail = parseInt(c.req.query("tail") ?? "100", 10);
  const service = await prisma.service.findUnique({
    where: { id: c.req.param("serviceId") },
    include: { project: true, worker: true },
  });
  if (!service) return c.json({ error: "Not found" }, 404);

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id, organizationId: service.project.organizationId },
  });
  if (!membership) return c.json({ error: "Not found" }, 404);

  return c.json({
    serviceId: service.id,
    containerId: service.containerId,
    workerId: service.worker?.workerId,
    tail,
    message: "Fetch logs via agent; poll /agent/services/:id/logs from worker",
  });
});

serviceRoutes.get("/services/:serviceId/env", async (c) => {
  const user = c.get("user");
  const service = await prisma.service.findUnique({
    where: { id: c.req.param("serviceId") },
    include: { project: true, envVars: true },
  });
  if (!service) return c.json({ error: "Not found" }, 404);

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id, organizationId: service.project.organizationId },
  });
  if (!membership) return c.json({ error: "Not found" }, 404);

  return c.json(
    service.envVars.map((v) => ({
      id: v.id,
      key: v.key,
      value: v.isSecret ? "••••••••" : decrypt(v.valueEnc),
      isSecret: v.isSecret,
    }))
  );
});

serviceRoutes.post("/services/:serviceId/env", async (c) => {
  const user = c.get("user");
  const body = createEnvVarSchema.parse(await c.req.json());
  const service = await prisma.service.findUnique({
    where: { id: c.req.param("serviceId") },
    include: { project: true },
  });
  if (!service) return c.json({ error: "Not found" }, 404);

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id, organizationId: service.project.organizationId },
  });
  if (!membership) return c.json({ error: "Not found" }, 404);

  const envVar = await prisma.envVar.upsert({
    where: { serviceId_key: { serviceId: service.id, key: body.key } },
    update: { valueEnc: encrypt(body.value), isSecret: body.isSecret },
    create: {
      serviceId: service.id,
      key: body.key,
      valueEnc: encrypt(body.value),
      isSecret: body.isSecret,
    },
  });

  return c.json({ id: envVar.id, key: envVar.key, isSecret: envVar.isSecret }, 201);
});

serviceRoutes.post("/services/:serviceId/domains", async (c) => {
  const user = c.get("user");
  const body = createDomainSchema.parse(await c.req.json());
  const service = await prisma.service.findUnique({
    where: { id: c.req.param("serviceId") },
    include: { project: true },
  });
  if (!service || service.type !== "web") {
    return c.json({ error: "Web service required" }, 400);
  }

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id, organizationId: service.project.organizationId },
  });
  if (!membership) return c.json({ error: "Not found" }, 404);

  const hostname =
    body.hostname.includes(".") ? body.hostname : `${body.hostname}.${config.platformDomain}`;

  const domain = await prisma.domain.create({
    data: {
      serviceId: service.id,
      hostname,
      isPrimary: body.isPrimary,
    },
  });

  return c.json(domain, 201);
});

serviceRoutes.get("/services/:serviceId/connection", async (c) => {
  const user = c.get("user");
  const service = await prisma.service.findUnique({
    where: { id: c.req.param("serviceId") },
    include: { project: true },
  });
  if (!service) return c.json({ error: "Not found" }, 404);

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id, organizationId: service.project.organizationId },
  });
  if (!membership) return c.json({ error: "Not found" }, 404);

  return c.json({
    type: service.type,
    status: service.status,
    connectionInfo: service.connectionInfo,
  });
});

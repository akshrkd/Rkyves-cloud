import { Hono } from "hono";
import { prisma, Prisma } from "@rkyves/db";
import {
  createServiceSchema,
  createEnvVarSchema,
  createDomainSchema,
  triggerDeploySchema,
  webServiceConfigSchema,
  updateServiceSchema,
  slugify,
} from "@rkyves/shared";
import { encrypt, decrypt } from "../lib/crypto.js";
import { config } from "../lib/config.js";
import { requireAuth, requireUser } from "../middleware/auth.js";
import { logAudit, getServiceForUser } from "../lib/audit.js";
import { emitOrgEvent } from "../lib/events.js";
import {
  buildServiceConfig,
  queueServiceProvision,
  getNetworkName,
} from "../services/provisioning.js";
import {
  branchExists,
  generateWebhookSecret,
  registerWebhook,
  removeWebhook,
} from "../services/github.js";
import { triggerServiceDeploy } from "../services/deploy.js";

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

  let inputConfig = (body.config ?? {}) as Record<string, unknown>;
  let githubLink: {
    installationId: number;
    owner: string;
    repo: string;
  } | null = null;

  if (body.type === "web" && body.githubRepo) {
    const installation = await prisma.gitHubInstallation.findUnique({
      where: { organizationId: project.organizationId },
    });
    if (!installation) {
      return c.json({ error: "GitHub not connected for this organization" }, 400);
    }

    const { owner, repo, branch } = body.githubRepo;
    const gitBranch = branch ?? (inputConfig.gitBranch as string) ?? "main";
    const branchOk = await branchExists(installation.installationId, owner, repo, gitBranch);
    if (!branchOk) {
      return c.json({ error: `Branch "${gitBranch}" not found in ${owner}/${repo}` }, 400);
    }

    inputConfig = {
      ...inputConfig,
      gitOwner: owner,
      gitRepoName: repo,
      gitInstallationId: installation.installationId,
      gitRepo: `https://github.com/${owner}/${repo}.git`,
      gitBranch,
    };

    githubLink = { installationId: installation.installationId, owner, repo };
  }

  if (body.type === "web") {
    webServiceConfigSchema.parse(inputConfig);
  }

  const { config: serviceConfig, secrets } = await buildServiceConfig(
    body.type,
    body.name,
    project.slug,
    inputConfig
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

  if (githubLink) {
    const webhookSecret = generateWebhookSecret();
    let webhookId: number | null = null;
    try {
      webhookId = await registerWebhook(
        githubLink.installationId,
        githubLink.owner,
        githubLink.repo,
        service.id,
        webhookSecret
      );
    } catch (err) {
      console.error("Failed to register GitHub webhook:", err);
    }

    await prisma.gitHubRepoLink.create({
      data: {
        serviceId: service.id,
        installationId: githubLink.installationId,
        owner: githubLink.owner,
        repo: githubLink.repo,
        webhookId,
        webhookSecret: encrypt(webhookSecret),
      },
    });
  }

  await queueServiceProvision(service.id);

  await logAudit({
    organizationId: project.organizationId,
    userId: user.id,
    action: "service.created",
    resourceType: "service",
    resourceId: service.id,
    resourceName: service.name,
  });

  emitOrgEvent(project.organizationId, "service.updated", {
    serviceId: service.id,
    status: service.status,
  });

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

  if (body.type === "web" && body.autoDeploy) {
    try {
      await triggerServiceDeploy(service.id);
    } catch (err) {
      console.error("Auto-deploy failed:", err);
    }
  }

  const full = await prisma.service.findUnique({
    where: { id: service.id },
    include: { domains: true, worker: true, githubRepoLink: true },
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
    include: { project: true, worker: true, githubRepoLink: true },
  });
  if (!service) return c.json({ error: "Not found" }, 404);

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id, organizationId: service.project.organizationId },
  });
  if (!membership || membership.role === "member") {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (service.githubRepoLink?.webhookId) {
    await removeWebhook(
      service.githubRepoLink.installationId,
      service.githubRepoLink.owner,
      service.githubRepoLink.repo,
      service.githubRepoLink.webhookId
    );
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

  await logAudit({
    organizationId: service.project.organizationId,
    userId: user.id,
    action: "service.deleted",
    resourceType: "service",
    resourceId: service.id,
    resourceName: service.name,
  });

  emitOrgEvent(service.project.organizationId, "service.updated", {
    serviceId: service.id,
    status: "deleting",
  });

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

  const deployment = await triggerServiceDeploy(service.id, {
    gitRef: body.gitRef,
    imageTag: body.imageTag,
  });

  await logAudit({
    organizationId: service.project.organizationId,
    userId: user.id,
    action: "deployment.triggered",
    resourceType: "deployment",
    resourceId: deployment.id,
    resourceName: service.name,
    metadata: { gitRef: body.gitRef },
  });

  emitOrgEvent(service.project.organizationId, "deployment.updated", {
    deploymentId: deployment.id,
    serviceId: service.id,
    status: deployment.status,
  });

  return c.json(deployment, 201);
});

serviceRoutes.get("/services/:serviceId/logs", async (c) => {
  const user = c.get("user");
  const tail = parseInt(c.req.query("tail") ?? "500", 10);
  const result = await getServiceForUser(c.req.param("serviceId"), user.id);
  if (!result) return c.json({ error: "Not found" }, 404);

  const { service } = result;
  const logs = service.runtimeLogs ?? "";
  const lines = logs.split("\n");
  const trimmed = lines.slice(-tail).join("\n");

  return c.json({
    serviceId: service.id,
    containerId: service.containerId,
    logs: trimmed,
    lineCount: lines.length,
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

serviceRoutes.delete("/services/:serviceId/env/:key", async (c) => {
  const user = c.get("user");
  const result = await getServiceForUser(c.req.param("serviceId"), user.id);
  if (!result) return c.json({ error: "Not found" }, 404);

  const key = decodeURIComponent(c.req.param("key"));
  await prisma.envVar.deleteMany({
    where: { serviceId: result.service.id, key },
  });

  await logAudit({
    organizationId: result.service.project.organizationId,
    userId: user.id,
    action: "env.deleted",
    resourceType: "env_var",
    resourceId: result.service.id,
    resourceName: key,
  });

  return c.json({ ok: true });
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

serviceRoutes.delete("/services/:serviceId/domains/:domainId", async (c) => {
  const user = c.get("user");
  const result = await getServiceForUser(c.req.param("serviceId"), user.id);
  if (!result) return c.json({ error: "Not found" }, 404);

  const domain = await prisma.domain.findFirst({
    where: { id: c.req.param("domainId"), serviceId: result.service.id },
  });
  if (!domain) return c.json({ error: "Not found" }, 404);

  await prisma.domain.delete({ where: { id: domain.id } });

  await logAudit({
    organizationId: result.service.project.organizationId,
    userId: user.id,
    action: "domain.deleted",
    resourceType: "domain",
    resourceId: domain.id,
    resourceName: domain.hostname,
  });

  return c.json({ ok: true });
});

serviceRoutes.patch("/services/:serviceId", async (c) => {
  const user = c.get("user");
  const body = updateServiceSchema.parse(await c.req.json());
  const result = await getServiceForUser(c.req.param("serviceId"), user.id);
  if (!result) return c.json({ error: "Not found" }, 404);
  if (result.membership.role === "member" && body.config) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const updated = await prisma.service.update({
    where: { id: result.service.id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.config
        ? { config: { ...(result.service.config as object), ...body.config } as Prisma.InputJsonValue }
        : {}),
    },
  });

  await logAudit({
    organizationId: result.service.project.organizationId,
    userId: user.id,
    action: "service.updated",
    resourceType: "service",
    resourceId: updated.id,
    resourceName: updated.name,
  });

  return c.json(updated);
});

serviceRoutes.post("/services/:serviceId/restart", async (c) => {
  const user = c.get("user");
  const result = await getServiceForUser(c.req.param("serviceId"), user.id);
  if (!result) return c.json({ error: "Not found" }, 404);
  if (!result.service.workerId) return c.json({ error: "No worker assigned" }, 400);

  const worker = await prisma.worker.findUnique({ where: { id: result.service.workerId } });
  if (!worker) return c.json({ error: "Worker not found" }, 400);

  await prisma.agentTask.create({
    data: {
      workerId: worker.workerId,
      serviceId: result.service.id,
      type: "start",
      payload: { restart: true },
    },
  });

  await logAudit({
    organizationId: result.service.project.organizationId,
    userId: user.id,
    action: "service.restarted",
    resourceType: "service",
    resourceId: result.service.id,
    resourceName: result.service.name,
  });

  return c.json({ ok: true });
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

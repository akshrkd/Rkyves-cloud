import { Hono } from "hono";
import { prisma } from "@rkyves/db";
import { requireAuth, requireUser } from "../middleware/auth.js";
import { getServiceForUser } from "../lib/audit.js";

export const deploymentRoutes = new Hono();

deploymentRoutes.use("*", requireAuth, requireUser);

deploymentRoutes.get("/deployments/:deploymentId", async (c) => {
  const user = c.get("user");
  const deployment = await prisma.deployment.findUnique({
    where: { id: c.req.param("deploymentId") },
    include: {
      service: {
        include: { project: { include: { organization: true } } },
      },
    },
  });
  if (!deployment) return c.json({ error: "Not found" }, 404);

  const membership = await prisma.orgMember.findFirst({
    where: {
      userId: user.id,
      organizationId: deployment.service.project.organizationId,
    },
  });
  if (!membership) return c.json({ error: "Not found" }, 404);

  return c.json(deployment);
});

deploymentRoutes.get("/services/:serviceId/tasks", async (c) => {
  const user = c.get("user");
  const result = await getServiceForUser(c.req.param("serviceId"), user.id);
  if (!result) return c.json({ error: "Not found" }, 404);

  const tasks = await prisma.agentTask.findMany({
    where: { serviceId: result.service.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return c.json(tasks);
});

deploymentRoutes.get("/services/:serviceId/metrics", async (c) => {
  const user = c.get("user");
  const result = await getServiceForUser(c.req.param("serviceId"), user.id);
  if (!result) return c.json({ error: "Not found" }, 404);

  const snapshots = await prisma.serviceMetricSnapshot.findMany({
    where: { serviceId: result.service.id },
    orderBy: { recordedAt: "desc" },
    take: 60,
  });

  return c.json(snapshots.reverse());
});

deploymentRoutes.get("/workers/:workerId/metrics", async (c) => {
  const worker = await prisma.worker.findUnique({
    where: { id: c.req.param("workerId") },
  });
  if (!worker) return c.json({ error: "Not found" }, 404);

  const snapshots = await prisma.serviceMetricSnapshot.findMany({
    where: { workerId: worker.id },
    orderBy: { recordedAt: "desc" },
    take: 60,
  });

  return c.json(snapshots.reverse());
});

import { Hono } from "hono";
import { prisma } from "@rkyves/db";
import { cronServiceConfigSchema } from "@rkyves/shared";
import { requireAuth, requireUser } from "../middleware/auth.js";
import { cronQueue } from "../lib/queue.js";
import { getServiceForUser } from "../lib/audit.js";

export const cronRoutes = new Hono();

cronRoutes.use("*", requireAuth, requireUser);

async function getCronJobForUser(jobId: string, userId: string) {
  const job = await prisma.cronJob.findUnique({
    where: { id: jobId },
    include: { service: { include: { project: true } } },
  });
  if (!job) return null;

  const membership = await prisma.orgMember.findFirst({
    where: { userId, organizationId: job.service.project.organizationId },
  });
  if (!membership) return null;

  return { job, membership };
}

cronRoutes.get("/services/:serviceId/cron", async (c) => {
  const user = c.get("user");
  const result = await getServiceForUser(c.req.param("serviceId"), user.id);
  if (!result) return c.json({ error: "Not found" }, 404);

  const jobs = await prisma.cronJob.findMany({
    where: { serviceId: result.service.id },
    include: { runs: { orderBy: { startedAt: "desc" }, take: 5 } },
  });
  return c.json(jobs);
});

cronRoutes.post("/services/:serviceId/cron", async (c) => {
  const user = c.get("user");
  const result = await getServiceForUser(c.req.param("serviceId"), user.id);
  if (!result) return c.json({ error: "Not found" }, 404);

  const body = cronServiceConfigSchema.parse(await c.req.json());
  if (result.service.type !== "cron") {
    return c.json({ error: "Cron service required" }, 400);
  }

  const name = (body as { name?: string }).name ?? "default";

  const job = await prisma.cronJob.create({
    data: {
      serviceId: result.service.id,
      name,
      schedule: body.schedule,
      targetType: body.targetType,
      targetUrl: body.targetUrl,
      targetImage: body.targetImage,
      targetCommand: body.targetCommand,
      timezone: body.timezone,
    },
  });

  await cronQueue.add(
    `cron-${job.id}`,
    { cronJobId: job.id },
    {
      repeat: { pattern: body.schedule },
      jobId: job.id,
    }
  );

  return c.json(job, 201);
});

cronRoutes.patch("/cron/:jobId", async (c) => {
  const user = c.get("user");
  const ctx = await getCronJobForUser(c.req.param("jobId"), user.id);
  if (!ctx) return c.json({ error: "Not found" }, 404);

  const { enabled } = await c.req.json();
  const job = await prisma.cronJob.update({
    where: { id: ctx.job.id },
    data: { enabled },
  });

  if (!enabled) {
    await cronQueue.removeRepeatableByKey(`cron-${job.id}`);
  }

  return c.json(job);
});

cronRoutes.get("/cron/:jobId/runs", async (c) => {
  const user = c.get("user");
  const ctx = await getCronJobForUser(c.req.param("jobId"), user.id);
  if (!ctx) return c.json({ error: "Not found" }, 404);

  const runs = await prisma.cronRun.findMany({
    where: { cronJobId: ctx.job.id },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return c.json(runs);
});

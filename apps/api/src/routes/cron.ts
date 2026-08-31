import { Hono } from "hono";
import { prisma } from "@rkyves/db";
import { cronServiceConfigSchema } from "@rkyves/shared";
import { requireAuth, requireUser } from "../middleware/auth.js";
import { cronQueue } from "../lib/queue.js";

export const cronRoutes = new Hono();

cronRoutes.use("*", requireAuth, requireUser);

cronRoutes.get("/services/:serviceId/cron", async (c) => {
  const jobs = await prisma.cronJob.findMany({
    where: { serviceId: c.req.param("serviceId") },
    include: { runs: { orderBy: { startedAt: "desc" }, take: 5 } },
  });
  return c.json(jobs);
});

cronRoutes.post("/services/:serviceId/cron", async (c) => {
  const body = cronServiceConfigSchema.parse(await c.req.json());
  const serviceId = c.req.param("serviceId");

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || service.type !== "cron") {
    return c.json({ error: "Cron service required" }, 400);
  }

  const name = (body as { name?: string }).name ?? "default";

  const job = await prisma.cronJob.create({
    data: {
      serviceId,
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
  const { enabled } = await c.req.json();
  const job = await prisma.cronJob.update({
    where: { id: c.req.param("jobId") },
    data: { enabled },
  });

  if (!enabled) {
    await cronQueue.removeRepeatableByKey(`cron-${job.id}`);
  }

  return c.json(job);
});

cronRoutes.get("/cron/:jobId/runs", async (c) => {
  const runs = await prisma.cronRun.findMany({
    where: { cronJobId: c.req.param("jobId") },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return c.json(runs);
});

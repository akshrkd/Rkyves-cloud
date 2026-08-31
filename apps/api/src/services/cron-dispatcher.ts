import { prisma } from "@rkyves/db";
import { createCronWorker } from "../lib/queue.js";
import type { Job } from "bullmq";

export function startCronDispatcher() {
  createCronWorker(async (job: Job<{ cronJobId: string }>) => {
    const { cronJobId } = job.data;
    const cronJob = await prisma.cronJob.findUnique({
      where: { id: cronJobId },
      include: { service: { include: { worker: true } } },
    });

    if (!cronJob || !cronJob.enabled) return;

    const run = await prisma.cronRun.create({
      data: { cronJobId, status: "running" },
    });

    try {
      if (cronJob.targetType === "http" && cronJob.targetUrl) {
        const res = await fetch(cronJob.targetUrl, { method: "POST" });
        const logs = `HTTP ${res.status} ${res.statusText}`;
        await prisma.cronRun.update({
          where: { id: run.id },
          data: { status: res.ok ? "success" : "failed", logs, completedAt: new Date() },
        });
      } else if (cronJob.targetType === "container" && cronJob.service.worker) {
        await prisma.agentTask.create({
          data: {
            workerId: cronJob.service.worker.workerId,
            serviceId: cronJob.serviceId,
            type: "cron_run",
            payload: {
              cronJobId,
              cronRunId: run.id,
              targetImage: cronJob.targetImage,
              targetCommand: cronJob.targetCommand,
            },
          },
        });
        await prisma.cronRun.update({
          where: { id: run.id },
          data: { status: "dispatched", completedAt: new Date() },
        });
      }

      await prisma.cronJob.update({
        where: { id: cronJobId },
        data: { lastRunAt: new Date() },
      });
    } catch (err) {
      await prisma.cronRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
          completedAt: new Date(),
        },
      });
    }
  });

  console.log("Cron dispatcher started");
}

export function scheduleDailyBackups() {
  setInterval(async () => {
    const postgresServices = await prisma.service.findMany({
      where: { type: "postgres", status: "running" },
    });
    for (const svc of postgresServices) {
      if (svc.workerId) {
        await prisma.agentTask.create({
          data: {
            workerId: (await prisma.worker.findUnique({ where: { id: svc.workerId } }))!.workerId,
            serviceId: svc.id,
            type: "backup",
            payload: {},
          },
        });
      }
    }
  }, 24 * 60 * 60 * 1000);
}

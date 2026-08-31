import { Hono } from "hono";
import { prisma } from "@rkyves/db";
import { enqueueDeploy } from "../lib/queue.js";

export const webhookRoutes = new Hono();

webhookRoutes.post("/github/:serviceId", async (c) => {
  const serviceId = c.req.param("serviceId");
  const event = c.req.header("X-GitHub-Event");
  if (event !== "push") return c.json({ ok: true, skipped: true });

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { project: true },
  });
  if (!service || service.type !== "web") {
    return c.json({ error: "Not found" }, 404);
  }

  const payload = await c.req.json();
  const ref = payload.ref as string;
  const gitRef = ref?.replace("refs/heads/", "") ?? "main";
  const config = service.config as Record<string, unknown>;
  const expectedBranch = (config.gitBranch as string) ?? "main";

  if (gitRef !== expectedBranch) {
    return c.json({ ok: true, skipped: true, reason: "branch mismatch" });
  }

  const gitCommit = payload.after as string;

  const deployment = await prisma.deployment.create({
    data: {
      serviceId: service.id,
      status: "queued",
      gitRef,
      gitCommit,
    },
  });

  await enqueueDeploy(deployment.id, service.id);

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

  return c.json({ ok: true, deploymentId: deployment.id });
});

import { prisma } from "@rkyves/db";
import { enqueueDeploy } from "../lib/queue.js";

export async function triggerServiceDeploy(
  serviceId: string,
  options: { gitRef?: string; imageTag?: string } = {}
) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { worker: true },
  });
  if (!service || service.type !== "web") {
    throw new Error("Web service required");
  }

  const config = service.config as Record<string, unknown>;
  const gitRef = options.gitRef ?? (config.gitBranch as string) ?? "main";

  const deployment = await prisma.deployment.create({
    data: {
      serviceId: service.id,
      status: "queued",
      gitRef,
      imageTag: options.imageTag,
    },
  });

  if (service.worker) {
    await prisma.agentTask.create({
      data: {
        workerId: service.worker.workerId,
        serviceId: service.id,
        type: "deploy",
        payload: { deploymentId: deployment.id },
      },
    });
  }

  await enqueueDeploy(deployment.id, service.id);
  return deployment;
}

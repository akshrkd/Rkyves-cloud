import { prisma } from "@rkyves/db";
import { Hono } from "hono";
import { requireAuth, requireUser } from "../middleware/auth.js";

export const workerRoutes = new Hono();

workerRoutes.use("*", requireAuth, requireUser);

workerRoutes.get("/", async (c) => {
  const workers = await prisma.worker.findMany({
    include: { _count: { select: { services: true } } },
    orderBy: { workerId: "asc" },
  });
  return c.json(
    workers.map((w) => ({
      ...w,
      serviceCount: w._count.services,
    }))
  );
});

workerRoutes.post("/:workerId/drain", async (c) => {
  const worker = await prisma.worker.update({
    where: { workerId: c.req.param("workerId") },
    data: { status: "draining" },
  });
  return c.json(worker);
});

workerRoutes.post("/register", async (c) => {
  const { workerId, hostname, cpuCores, memoryMb, diskGb } = await c.req.json();
  const worker = await prisma.worker.upsert({
    where: { workerId },
    update: {
      hostname,
      cpuCores,
      memoryMb,
      diskGb,
      status: "online",
      lastSeenAt: new Date(),
    },
    create: {
      workerId,
      hostname,
      cpuCores,
      memoryMb,
      diskGb,
      status: "online",
      lastSeenAt: new Date(),
    },
  });
  return c.json(worker, 201);
});

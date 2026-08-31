import { agentConfig } from "./config.js";
import {
  registerWorker,
  heartbeat,
  fetchTasks,
  fetchService,
  reportStatus,
} from "./api-client.js";
import { handleTask, getContainerLogs } from "./docker-manager.js";

async function processTask(task: {
  id: string;
  serviceId: string;
  type: string;
  payload: Record<string, unknown>;
}) {
  console.log(`Processing task ${task.type} for service ${task.serviceId}`);

  try {
    const service = await fetchService(task.serviceId, task.payload.deploymentId as string | undefined);

    if (task.type === "deploy" && service.type === "web") {
      const result = await handleTask(task.type, service, task.payload);
      await reportStatus({
        workerId: agentConfig.workerId,
        serviceId: service.id,
        status: result.status ?? "running",
        connectionInfo: "connectionInfo" in result ? result.connectionInfo : undefined,
        containerId: "containerId" in result ? (result.containerId ?? undefined) : undefined,
      });
      return;
    }

    const result = await handleTask(task.type, service, task.payload);

    await reportStatus({
      workerId: agentConfig.workerId,
      serviceId: service.id,
      status: result.status ?? "running",
      connectionInfo: "connectionInfo" in result ? result.connectionInfo : undefined,
      containerId: "containerId" in result ? (result.containerId ?? undefined) : undefined,
    });

    if (task.type === "delete") {
      await reportStatus({
        workerId: agentConfig.workerId,
        serviceId: service.id,
        status: "stopped",
      });
    }
  } catch (err) {
    console.error(`Task failed:`, err);
    await reportStatus({
      workerId: agentConfig.workerId,
      serviceId: task.serviceId,
      status: "failed",
      message: err instanceof Error ? err.message : "Task failed",
    });
  }
}

async function pollLoop() {
  try {
    const tasks = await fetchTasks();
    for (const task of tasks) {
      await processTask(task);
    }
  } catch (err) {
    console.error("Poll error:", err);
  }
}

async function main() {
  console.log(`Rkyves Agent starting (worker: ${agentConfig.workerId})`);

  try {
    await registerWorker();
    console.log("Registered with control plane");
  } catch (err) {
    console.warn("Registration failed, will retry:", err);
  }

  setInterval(async () => {
    try {
      await heartbeat();
    } catch {
      // ignore heartbeat failures
    }
  }, 30000);

  setInterval(pollLoop, agentConfig.pollIntervalMs);
  pollLoop();
}

main().catch(console.error);

export { getContainerLogs };

import { Queue, Worker, type Job } from "bullmq";
import { config } from "./config.js";

const connection = {
  url: config.redisUrl,
  maxRetriesPerRequest: null,
};

export const provisionQueue = new Queue("provision", { connection });
export const deployQueue = new Queue("deploy", { connection });
export const backupQueue = new Queue("backup", { connection });
export const cronQueue = new Queue("cron", { connection });

export async function enqueueProvision(serviceId: string, workerId?: string) {
  await provisionQueue.add("provision", { serviceId, workerId }, { attempts: 3 });
}

export async function enqueueDeploy(deploymentId: string, serviceId: string) {
  await deployQueue.add("deploy", { deploymentId, serviceId }, { attempts: 2 });
}

export async function enqueueBackup(serviceId: string) {
  await backupQueue.add("backup", { serviceId }, { attempts: 2 });
}

export function createCronWorker(
  processor: (job: Job<{ cronJobId: string }>) => Promise<void>
) {
  return new Worker("cron", processor, { connection });
}

export function getRedisConnection() {
  return connection;
}

import Docker from "dockerode";
import {
  postgresContainer,
  pgbouncerContainer,
  redisContainer,
  webContainer,
  buildConnectionString,
} from "@rkyves/docker-templates";
import { agentConfig } from "./config.js";
import type { ServiceDetail } from "./api-client.js";
import { execSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export async function ensureNetwork(networkName: string) {
  const networks = await docker.listNetworks({ filters: { name: [networkName] } });
  if (networks.length === 0) {
    await docker.createNetwork({ Name: networkName, Driver: "bridge" });
  }

  const traefikNetworks = await docker.listNetworks({
    filters: { name: [agentConfig.traefikNetwork] },
  });
  if (traefikNetworks.length > 0) {
    const network = docker.getNetwork(networkName);
    try {
      await network.connect({ Container: traefikNetworks[0].Name });
    } catch {
      // traefik may already be connected
    }
  }
}

export async function ensureVolume(volumeName: string) {
  try {
    await docker.getVolume(volumeName).inspect();
  } catch {
    await docker.createVolume({ Name: volumeName });
  }
}

async function connectToTraefik(containerId: string) {
  try {
    const traefikNetworks = await docker.listNetworks({
      filters: { name: [agentConfig.traefikNetwork] },
    });
    if (traefikNetworks.length > 0) {
      const network = docker.getNetwork(traefikNetworks[0].Id);
      await network.connect({ Container: containerId });
    }
  } catch {
    // ignore if already connected
  }
}

export async function provisionPostgres(service: ServiceDetail) {
  const projectSlug = service.project.slug;
  const networkName = service.networkName ?? `rkyves-net-${projectSlug}`;
  const containerName = `rkyves-${projectSlug}-${service.slug}`;
  const pgbouncerName = `${containerName}-pgbouncer`;
  const volumeName = `${containerName}-data`;

  const config = service.config;
  const database = config.database as string;
  const username = config.username as string;
  const password = config.password as string;

  await ensureNetwork(networkName);
  await ensureVolume(volumeName);

  const pgSpec = postgresContainer({
    containerName,
    networkName,
    database,
    username,
    password,
    version: (config.version as string) ?? "16",
    volumeName,
    pgbouncerName,
  });

  const pgContainer = await docker.createContainer(pgSpec);
  await pgContainer.start();

  await new Promise((r) => setTimeout(r, 3000));

  const pgbSpec = pgbouncerContainer({
    containerName,
    networkName,
    database,
    username,
    password,
    volumeName,
    pgbouncerName,
  });

  const pgbContainer = await docker.createContainer(pgbSpec);
  await pgbContainer.start();

  const connectionInfo = {
    host: pgbouncerName,
    port: "5432",
    database,
    username,
    password,
    internalHost: containerName,
    connectionString: buildConnectionString("postgres", {
      host: pgbouncerName,
      port: "5432",
      database,
      username,
      password,
    }),
  };

  return {
    containerId: pgContainer.id,
    connectionInfo,
    status: "running" as const,
  };
}

export async function provisionRedis(service: ServiceDetail) {
  const projectSlug = service.project.slug;
  const networkName = service.networkName ?? `rkyves-net-${projectSlug}`;
  const containerName = `rkyves-${projectSlug}-${service.slug}`;
  const volumeName = `${containerName}-data`;
  const config = service.config;
  const password = config.password as string;

  await ensureNetwork(networkName);
  await ensureVolume(volumeName);

  const spec = redisContainer({
    containerName,
    networkName,
    password,
    version: (config.version as string) ?? "7",
    maxMemory: (config.maxMemory as string) ?? "256mb",
    volumeName,
  });

  const container = await docker.createContainer(spec);
  await container.start();

  const connectionInfo = {
    host: containerName,
    port: "6379",
    password,
    connectionString: buildConnectionString("redis", {
      host: containerName,
      port: "6379",
      password,
    }),
  };

  return { containerId: container.id, connectionInfo, status: "running" as const };
}

export async function provisionStorage(service: ServiceDetail) {
  const config = service.config;
  const bucketName = config.bucketName as string;

  const connectionInfo = {
    endpoint: agentConfig.minioEndpoint,
    bucket: bucketName,
    accessKey: config.accessKey as string,
    secretKey: config.secretKey as string,
    region: "us-east-1",
  };

  return { containerId: null, connectionInfo, status: "running" as const };
}

export async function provisionWeb(service: ServiceDetail) {
  const projectSlug = service.project.slug;
  const networkName = service.networkName ?? `rkyves-net-${projectSlug}`;
  const containerName = `rkyves-${projectSlug}-${service.slug}`;
  const config = service.config;
  const port = (config.port as number) ?? 3000;
  const imageTag = (config.imageTag as string) ?? "nginx:alpine";

  await ensureNetwork(networkName);

  const primaryDomain =
    service.domains.find((d) => d.isPrimary)?.hostname ??
    service.domains[0]?.hostname ??
    `${service.slug}.${projectSlug}.${agentConfig.platformDomain}`;

  const spec = webContainer({
    containerName,
    networkName,
    image: imageTag,
    port,
    env: service.env,
    hostname: primaryDomain,
    traefikNetwork: agentConfig.traefikNetwork,
  });

  const container = await docker.createContainer(spec);
  await container.start();
  await connectToTraefik(container.id);

  return {
    containerId: container.id,
    connectionInfo: { url: `https://${primaryDomain}`, hostname: primaryDomain },
    status: "running" as const,
  };
}

export async function deployWeb(service: ServiceDetail) {
  const deployment = service.pendingDeployment;
  if (!deployment) throw new Error("No pending deployment");

  const config = service.config;
  const gitRepo = (service.cloneUrl ?? config.gitRepo) as string | undefined;
  const gitBranch = deployment.gitRef ?? (config.gitBranch as string) ?? "main";
  const dockerfilePath = (config.dockerfilePath as string) ?? "Dockerfile";

  const projectSlug = service.project.slug;
  const imageTag = `rkyves/${projectSlug}-${service.slug}:${deployment.id.slice(0, 8)}`;
  const workspace = join("/tmp/rkyves-builds", service.id);

  try {
    await updateDeploymentStatus(deployment.id, { status: "building" });

    if (gitRepo) {
      if (!existsSync(workspace)) mkdirSync(workspace, { recursive: true });
      execSync(`git clone --depth 1 --branch ${gitBranch} ${gitRepo} ${workspace}`, {
        stdio: "pipe",
      });
      execSync(`docker build -f ${dockerfilePath} -t ${imageTag} ${workspace}`, {
        stdio: "pipe",
        cwd: workspace,
      });
    } else if (deployment.imageTag) {
      execSync(`docker pull ${deployment.imageTag}`, { stdio: "pipe" });
    } else {
      throw new Error("gitRepo or imageTag required for deploy");
    }

    await updateDeploymentStatus(deployment.id, { status: "deploying", imageTag });

    const networkName = service.networkName ?? `rkyves-net-${projectSlug}`;
    const containerName = `rkyves-${projectSlug}-${service.slug}`;

    try {
      const old = docker.getContainer(containerName);
      await old.stop();
      await old.remove();
    } catch {
      // no existing container
    }

    const primaryDomain =
      service.domains.find((d) => d.isPrimary)?.hostname ??
      service.domains[0]?.hostname ??
      `${service.slug}.${projectSlug}.${agentConfig.platformDomain}`;

    const port = (config.port as number) ?? 3000;
    const spec = webContainer({
      containerName,
      networkName,
      image: imageTag,
      port,
      env: service.env,
      hostname: primaryDomain,
      traefikNetwork: agentConfig.traefikNetwork,
    });

    const container = await docker.createContainer(spec);
    await container.start();
    await connectToTraefik(container.id);

    await updateDeploymentStatus(deployment.id, {
      status: "success",
      imageTag,
      buildLogs: "Build and deploy completed",
    });

    return {
      containerId: container.id,
      connectionInfo: { url: `https://${primaryDomain}`, hostname: primaryDomain },
      status: "running" as const,
    };
  } catch (err) {
    await updateDeploymentStatus(deployment.id, {
      status: "failed",
      error: err instanceof Error ? err.message : "Deploy failed",
    });
    throw err;
  }
}

async function updateDeploymentStatus(deploymentId: string, data: Record<string, unknown>) {
  const { updateDeployment } = await import("./api-client.js");
  await updateDeployment(deploymentId, data);
}

export async function backupPostgres(service: ServiceDetail) {
  const config = service.config;
  const containerName = `rkyves-${service.project.slug}-${service.slug}`;
  const database = config.database as string;
  const username = config.username as string;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = `/tmp/backup-${service.id}-${timestamp}.sql`;

  execSync(
    `docker exec ${containerName} pg_dump -U ${username} ${database} > ${backupFile}`,
    { stdio: "pipe" }
  );

  return { backupFile, status: "success" };
}

export async function deleteService(service: ServiceDetail) {
  const projectSlug = service.project.slug;
  const containerName = `rkyves-${projectSlug}-${service.slug}`;
  const pgbouncerName = `${containerName}-pgbouncer`;

  for (const name of [containerName, pgbouncerName]) {
    try {
      const container = docker.getContainer(name);
      await container.stop();
      await container.remove({ force: true });
    } catch {
      // ignore
    }
  }

  return { status: "stopped" as const };
}

export async function getContainerLogs(containerId: string, tail = 100): Promise<string> {
  const container = docker.getContainer(containerId);
  const logs = await container.logs({ stdout: true, stderr: true, tail, timestamps: true });
  return logs.toString("utf8");
}

export async function provisionService(service: ServiceDetail) {
  switch (service.type) {
    case "postgres":
      return provisionPostgres(service);
    case "redis":
      return provisionRedis(service);
    case "storage":
      return provisionStorage(service);
    case "web":
      return provisionWeb(service);
    case "cron":
      return { containerId: null, connectionInfo: {}, status: "running" as const };
    default:
      throw new Error(`Unknown service type: ${service.type}`);
  }
}

export async function handleTask(
  type: string,
  service: ServiceDetail,
  payload: Record<string, unknown>
) {
  switch (type) {
    case "provision":
      return provisionService(service);
    case "deploy":
      return deployWeb(service);
    case "delete":
      return deleteService(service);
    case "backup":
      return backupPostgres(service);
    case "cron_run":
      return { status: "running" as const, payload };
    default:
      throw new Error(`Unknown task type: ${type}`);
  }
}

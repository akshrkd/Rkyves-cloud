export interface PostgresTemplateOptions {
  containerName: string;
  networkName: string;
  database: string;
  username: string;
  password: string;
  version?: string;
  volumeName: string;
  pgbouncerName: string;
}

export interface RedisTemplateOptions {
  containerName: string;
  networkName: string;
  password: string;
  version?: string;
  maxMemory?: string;
  volumeName: string;
}

export interface WebTemplateOptions {
  containerName: string;
  networkName: string;
  image: string;
  port: number;
  env: Record<string, string>;
  hostname: string;
  traefikNetwork: string;
}

export function postgresContainer(opts: PostgresTemplateOptions) {
  const version = opts.version ?? "16";
  return {
    Image: `postgres:${version}-alpine`,
    name: opts.containerName,
    Env: [
      `POSTGRES_DB=${opts.database}`,
      `POSTGRES_USER=${opts.username}`,
      `POSTGRES_PASSWORD=${opts.password}`,
    ],
    HostConfig: {
      Binds: [`${opts.volumeName}:/var/lib/postgresql/data`],
      NetworkMode: opts.networkName,
      RestartPolicy: { Name: "unless-stopped" },
    },
    Labels: {
      "rkyves.service": "postgres",
      "rkyves.container": opts.containerName,
    },
  };
}

export function pgbouncerContainer(opts: PostgresTemplateOptions) {
  return {
    Image: "edoburu/pgbouncer:latest",
    name: opts.pgbouncerName,
    Env: [
      `DB_USER=${opts.username}`,
      `DB_PASSWORD=${opts.password}`,
      `DB_HOST=${opts.containerName}`,
      `DB_NAME=${opts.database}`,
      "POOL_MODE=transaction",
      "MAX_CLIENT_CONN=200",
      "DEFAULT_POOL_SIZE=20",
    ],
    HostConfig: {
      NetworkMode: opts.networkName,
      RestartPolicy: { Name: "unless-stopped" },
    },
    Labels: {
      "rkyves.service": "pgbouncer",
    },
  };
}

export function redisContainer(opts: RedisTemplateOptions) {
  const version = opts.version ?? "7";
  return {
    Image: `redis:${version}-alpine`,
    name: opts.containerName,
    Cmd: [
      "redis-server",
      "--requirepass",
      opts.password,
      "--maxmemory",
      opts.maxMemory ?? "256mb",
      "--maxmemory-policy",
      "allkeys-lru",
    ],
    HostConfig: {
      Binds: [`${opts.volumeName}:/data`],
      NetworkMode: opts.networkName,
      RestartPolicy: { Name: "unless-stopped" },
    },
    Labels: {
      "rkyves.service": "redis",
    },
  };
}

export function webContainer(opts: WebTemplateOptions) {
  const envList = Object.entries(opts.env).map(([k, v]) => `${k}=${v}`);
  return {
    Image: opts.image,
    name: opts.containerName,
    Env: envList,
    ExposedPorts: { [`${opts.port}/tcp`]: {} },
    HostConfig: {
      NetworkMode: opts.networkName,
      RestartPolicy: { Name: "unless-stopped" },
    },
    Labels: {
      "rkyves.service": "web",
      "traefik.enable": "true",
      "traefik.docker.network": opts.traefikNetwork,
      [`traefik.http.routers.${opts.containerName}.rule`]: `Host(\`${opts.hostname}\`)`,
      [`traefik.http.routers.${opts.containerName}.entrypoints`]: "websecure",
      [`traefik.http.routers.${opts.containerName}.tls`]: "true",
      [`traefik.http.routers.${opts.containerName}.tls.certresolver`]: "letsencrypt",
      [`traefik.http.services.${opts.containerName}.loadbalancer.server.port`]: String(opts.port),
    },
  };
}

export function buildConnectionString(
  type: "postgres" | "redis",
  info: Record<string, string>
): string {
  if (type === "postgres") {
    const host = info.host ?? "localhost";
    const port = info.port ?? "5432";
    const user = info.username ?? "postgres";
    const pass = info.password ?? "";
    const db = info.database ?? "postgres";
    return `postgresql://${user}:${encodeURIComponent(pass)}@${host}:${port}/${db}?sslmode=disable`;
  }
  const host = info.host ?? "localhost";
  const port = info.port ?? "6379";
  const pass = info.password ?? "";
  return `redis://:${encodeURIComponent(pass)}@${host}:${port}`;
}

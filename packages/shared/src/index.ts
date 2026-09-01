import { z } from "zod";

export const ServiceType = z.enum(["web", "postgres", "redis", "storage", "cron"]);
export type ServiceType = z.infer<typeof ServiceType>;

export const ServiceStatus = z.enum([
  "pending",
  "provisioning",
  "running",
  "stopped",
  "failed",
  "deleting",
]);
export type ServiceStatus = z.infer<typeof ServiceStatus>;

export const DeploymentStatus = z.enum([
  "queued",
  "building",
  "deploying",
  "success",
  "failed",
]);
export type DeploymentStatus = z.infer<typeof DeploymentStatus>;

export const WorkerStatus = z.enum(["online", "offline", "draining"]);
export type WorkerStatus = z.infer<typeof WorkerStatus>;

export const OrgRole = z.enum(["owner", "admin", "member"]);
export type OrgRole = z.infer<typeof OrgRole>;

export const CronTargetType = z.enum(["http", "container"]);
export type CronTargetType = z.infer<typeof CronTargetType>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  orgName: z.string().min(1).max(100).optional(),
});

export const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
});

export const createServiceSchema = z.object({
  name: z.string().min(1).max(100),
  type: ServiceType,
  config: z.record(z.unknown()).optional(),
  autoDeploy: z.boolean().default(false),
  githubRepo: z
    .object({
      owner: z.string().min(1),
      repo: z.string().min(1),
      branch: z.string().optional(),
    })
    .optional(),
});

export const webServiceConfigSchema = z.object({
  gitRepo: z.string().url().optional(),
  gitBranch: z.string().default("main"),
  dockerfilePath: z.string().default("Dockerfile"),
  buildCommand: z.string().optional(),
  startCommand: z.string().optional(),
  port: z.number().int().min(1).max(65535).default(3000),
  healthCheckPath: z.string().default("/health"),
  gitOwner: z.string().optional(),
  gitRepoName: z.string().optional(),
  gitInstallationId: z.number().int().optional(),
});

export const postgresServiceConfigSchema = z.object({
  version: z.string().default("16"),
  database: z.string().optional(),
  username: z.string().optional(),
});

export const redisServiceConfigSchema = z.object({
  version: z.string().default("7"),
  maxMemory: z.string().default("256mb"),
});

export const storageServiceConfigSchema = z.object({
  bucketName: z.string().optional(),
  publicRead: z.boolean().default(false),
});

export const cronServiceConfigSchema = z.object({
  schedule: z.string().min(1),
  targetType: CronTargetType,
  targetUrl: z.string().url().optional(),
  targetImage: z.string().optional(),
  targetCommand: z.string().optional(),
  timezone: z.string().default("UTC"),
});

export const createEnvVarSchema = z.object({
  key: z.string().min(1).max(255),
  value: z.string(),
  isSecret: z.boolean().default(true),
});

export const createDomainSchema = z.object({
  hostname: z.string().min(1).max(255),
  isPrimary: z.boolean().default(false),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

export const agentRegisterSchema = z.object({
  workerId: z.string().min(1),
  hostname: z.string().min(1),
  capacity: z.object({
    cpuCores: z.number().int().positive(),
    memoryMb: z.number().int().positive(),
    diskGb: z.number().int().positive(),
  }),
});

export const agentTaskSchema = z.object({
  id: z.string(),
  type: z.enum([
    "provision",
    "deploy",
    "stop",
    "start",
    "delete",
    "backup",
    "health_check",
  ]),
  serviceId: z.string(),
  payload: z.record(z.unknown()),
});

export const agentStatusReportSchema = z.object({
  workerId: z.string(),
  serviceId: z.string(),
  status: ServiceStatus,
  message: z.string().optional(),
  connectionInfo: z.record(z.string()).optional(),
  containerId: z.string().optional(),
});

export const triggerDeploySchema = z.object({
  gitRef: z.string().optional(),
  imageTag: z.string().optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: OrgRole.default("member"),
});

export const updateMemberRoleSchema = z.object({
  role: OrgRole,
});

export const updateServiceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
});

export const agentMetricsSchema = z.object({
  workerId: z.string(),
  serviceId: z.string().optional(),
  cpuPercent: z.number().optional(),
  memoryMb: z.number().int().optional(),
  diskGb: z.number().int().optional(),
});

export const agentRuntimeLogsSchema = z.object({
  workerId: z.string(),
  serviceId: z.string(),
  logs: z.string(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type CreateEnvVarInput = z.infer<typeof createEnvVarSchema>;
export type CreateDomainInput = z.infer<typeof createDomainSchema>;
export type AgentTask = z.infer<typeof agentTaskSchema>;
export type AgentStatusReport = z.infer<typeof agentStatusReportSchema>;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function generatePassword(length = 24): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { randomBytes } from "crypto";
import { config } from "../lib/config.js";
import { slugify } from "@rkyves/shared";

type RestClient = Octokit["rest"];

function getRestClient(octokit: Octokit): RestClient {
  return octokit.rest;
}

let githubApp: App | null = null;

function getApp(): App {
  if (!config.github.appId || !config.github.privateKey) {
    throw new Error("GitHub App is not configured");
  }
  if (!githubApp) {
    githubApp = new App({
      appId: config.github.appId,
      privateKey: config.github.privateKey,
      oauth: config.github.clientId
        ? {
            clientId: config.github.clientId,
            clientSecret: config.github.clientSecret ?? "",
          }
        : undefined,
    });
  }
  return githubApp;
}

export function isGitHubConfigured(): boolean {
  return Boolean(config.github.appId && config.github.privateKey);
}

export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const app = getApp();
  return app.getInstallationOctokit(installationId) as unknown as Octokit;
}

export async function getInstallationToken(installationId: number): Promise<string> {
  const octokit = await getInstallationOctokit(installationId);
  const auth = (await octokit.auth({ type: "installation" })) as { token: string };
  return auth.token;
}

export function getInstallUrl(state: string): string {
  return `https://github.com/apps/${config.github.appSlug}/installations/new?state=${encodeURIComponent(state)}`;
}

export async function fetchInstallationDetails(installationId: number) {
  const app = getApp();
  const { data } = await app.octokit.request("GET /app/installations/{installation_id}", {
    installation_id: installationId,
  });
  return {
    installationId: data.id,
    accountLogin: data.account && "login" in data.account ? data.account.login : "unknown",
    accountType: data.account && "type" in data.account ? data.account.type : "User",
  };
}

export type GitHubRepoSummary = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
};

export async function listRepos(
  installationId: number,
  search?: string
): Promise<GitHubRepoSummary[]> {
  const octokit = await getInstallationOctokit(installationId);
  const rest = getRestClient(octokit);
  const repos: GitHubRepoSummary[] = [];
  let page = 1;

  while (page <= 5) {
    const { data } = await rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
      page,
    });
    for (const repo of data.repositories) {
      repos.push({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        private: repo.private,
        defaultBranch: repo.default_branch,
        description: repo.description,
        htmlUrl: repo.html_url,
      });
    }
    if (data.repositories.length < 100) break;
    page++;
  }

  if (search) {
    const q = search.toLowerCase();
    return repos.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false)
    );
  }

  return repos.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

async function fetchFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const { data } = await getRestClient(octokit).repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) return null;
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function parseDockerfilePort(content: string): number | null {
  const exposeMatch = content.match(/^\s*EXPOSE\s+(\d+)/im);
  if (exposeMatch) return parseInt(exposeMatch[1], 10);
  return null;
}

function parsePackageJson(content: string): {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
} | null {
  try {
    return JSON.parse(content) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
  } catch {
    return null;
  }
}

function inferPortFromDependencies(deps: Record<string, string> | undefined): number | null {
  if (!deps) return null;
  if (deps.next) return 3000;
  if (deps["@nestjs/core"]) return 3000;
  if (deps.express) return 3000;
  if (deps.fastify) return 3000;
  if (deps.flask) return 5000;
  if (deps.rails) return 3000;
  return null;
}

export type RepoAnalysis = {
  gitBranch: string;
  dockerfilePath: string;
  port: number;
  buildCommand?: string;
  startCommand?: string;
  healthCheckPath: string;
  nameSuggestion: string;
  gitRepo: string;
  gitOwner: string;
  gitRepoName: string;
  needsDockerfile: boolean;
  sources: Record<string, string>;
};

export async function analyzeRepo(
  installationId: number,
  owner: string,
  repo: string,
  branch?: string
): Promise<RepoAnalysis> {
  const octokit = await getInstallationOctokit(installationId);
  const rest = getRestClient(octokit);
  const { data: repoData } = await rest.repos.get({ owner, repo });
  const gitBranch = branch ?? repoData.default_branch ?? "main";

  const sources: Record<string, string> = { gitBranch: "repository metadata" };
  let dockerfilePath = "Dockerfile";
  let port = 3000;
  let buildCommand: string | undefined;
  let startCommand: string | undefined;
  let healthCheckPath = "/health";
  let needsDockerfile = true;

  const dockerCandidates = ["Dockerfile", "docker/Dockerfile", "Dockerfile.prod"];
  for (const candidate of dockerCandidates) {
    const content = await fetchFileContent(octokit, owner, repo, candidate, gitBranch);
    if (content) {
      dockerfilePath = candidate;
      needsDockerfile = false;
      sources.dockerfilePath = candidate;
      const dockerPort = parseDockerfilePort(content);
      if (dockerPort) {
        port = dockerPort;
        sources.port = `${candidate} EXPOSE`;
      }
      break;
    }
  }

  const pkgContent = await fetchFileContent(octokit, owner, repo, "package.json", gitBranch);
  if (pkgContent) {
    const pkg = parsePackageJson(pkgContent);
    if (pkg?.scripts?.build && !buildCommand) {
      buildCommand = pkg.scripts.build.startsWith("npm") ? pkg.scripts.build : `npm run build`;
      sources.buildCommand = "package.json scripts.build";
    }
    if (pkg?.scripts?.start && !startCommand) {
      startCommand = pkg.scripts.start.startsWith("npm") ? pkg.scripts.start : `npm start`;
      sources.startCommand = "package.json scripts.start";
    }
    if (!sources.port && pkg?.dependencies) {
      const inferred = inferPortFromDependencies(pkg.dependencies);
      if (inferred) {
        port = inferred;
        sources.port = "package.json dependencies";
      }
    }
  }

  const healthContent = await fetchFileContent(
    octokit,
    owner,
    repo,
    "src/routes/health.ts",
    gitBranch
  );
  if (healthContent || (await fetchFileContent(octokit, owner, repo, "health", gitBranch))) {
    healthCheckPath = "/health";
    sources.healthCheckPath = "health route detected";
  } else {
    healthCheckPath = "/health";
  }

  return {
    gitBranch,
    dockerfilePath,
    port,
    buildCommand,
    startCommand,
    healthCheckPath,
    nameSuggestion: slugify(repo),
    gitRepo: `https://github.com/${owner}/${repo}.git`,
    gitOwner: owner,
    gitRepoName: repo,
    needsDockerfile,
    sources,
  };
}

export async function branchExists(
  installationId: number,
  owner: string,
  repo: string,
  branch: string
): Promise<boolean> {
  const octokit = await getInstallationOctokit(installationId);
  try {
    await getRestClient(octokit).repos.getBranch({ owner, repo, branch });
    return true;
  } catch {
    return false;
  }
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export async function registerWebhook(
  installationId: number,
  owner: string,
  repo: string,
  serviceId: string,
  webhookSecret: string
): Promise<number> {
  const octokit = await getInstallationOctokit(installationId);
  const webhookUrl = `${config.apiPublicUrl}/webhooks/github/${serviceId}`;

  const { data } = await getRestClient(octokit).repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: "json",
      secret: webhookSecret,
      insecure_ssl: config.apiPublicUrl.startsWith("http://localhost") ? "1" : "0",
    },
    events: ["push"],
    active: true,
  });

  return data.id;
}

export async function removeWebhook(
  installationId: number,
  owner: string,
  repo: string,
  webhookId: number
): Promise<void> {
  const octokit = await getInstallationOctokit(installationId);
  try {
    await getRestClient(octokit).repos.deleteWebhook({ owner, repo, hook_id: webhookId });
  } catch {
    // webhook may already be removed
  }
}

export function buildAuthenticatedCloneUrl(
  owner: string,
  repo: string,
  token: string
): string {
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}

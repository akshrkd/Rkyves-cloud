import { Hono } from "hono";
import { prisma } from "@rkyves/db";
import { createOrgSchema, inviteMemberSchema, updateMemberRoleSchema } from "@rkyves/shared";
import { requireAuth, requireUser } from "../middleware/auth.js";
import { logAudit, getOrgMembership } from "../lib/audit.js";

export const orgRoutes = new Hono();

orgRoutes.use("*", requireAuth, requireUser);

orgRoutes.get("/", async (c) => {
  const user = c.get("user");
  const memberships = await prisma.orgMember.findMany({
    where: { userId: user.id },
    include: {
      organization: {
        include: { _count: { select: { projects: true, members: true } } },
      },
    },
  });
  return c.json(
    memberships.map((m) => ({
      ...m.organization,
      role: m.role,
      projectCount: m.organization._count.projects,
      memberCount: m.organization._count.members,
    }))
  );
});

orgRoutes.post("/", async (c) => {
  const body = createOrgSchema.parse(await c.req.json());
  const user = c.get("user");

  const existing = await prisma.organization.findUnique({ where: { slug: body.slug } });
  if (existing) return c.json({ error: "Slug already taken" }, 409);

  const org = await prisma.organization.create({
    data: {
      name: body.name,
      slug: body.slug,
      members: { create: { userId: user.id, role: "owner" } },
    },
  });

  return c.json(org, 201);
});

orgRoutes.get("/:orgId", async (c) => {
  const user = c.get("user");
  const membership = await getOrgMembership(user.id, c.req.param("orgId"));
  if (!membership) return c.json({ error: "Not found" }, 404);

  const org = await prisma.organization.findUnique({
    where: { id: c.req.param("orgId") },
    include: { members: { include: { user: { select: { id: true, email: true, name: true } } } } },
  });
  return c.json({ ...org, role: membership.role });
});

orgRoutes.get("/:orgId/overview", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  const membership = await getOrgMembership(user.id, orgId);
  if (!membership) return c.json({ error: "Not found" }, 404);

  const [projects, workers, services, recentDeployments] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { services: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.worker.findMany({ include: { _count: { select: { services: true } } } }),
    prisma.service.findMany({
      where: { project: { organizationId: orgId } },
      select: { id: true, name: true, status: true, type: true, projectId: true },
    }),
    prisma.deployment.findMany({
      where: { service: { project: { organizationId: orgId } } },
      orderBy: { startedAt: "desc" },
      take: 10,
      include: {
        service: {
          select: {
            id: true,
            name: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  let githubInstallation = null;
  try {
    githubInstallation = await prisma.gitHubInstallation.findUnique({ where: { organizationId: orgId } });
  } catch {
    githubInstallation = null;
  }

  const runningServices = services.filter((s) => s.status === "running").length;
  const failedServices = services.filter((s) => s.status === "failed").length;

  return c.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      serviceCount: p._count.services,
    })),
    totalServices: services.length,
    runningServices,
    failedServices,
    workers: workers.map((w) => ({
      id: w.id,
      workerId: w.workerId,
      hostname: w.hostname,
      status: w.status,
      cpuCores: w.cpuCores,
      memoryMb: w.memoryMb,
      diskGb: w.diskGb,
      lastSeenAt: w.lastSeenAt,
      serviceCount: w._count.services,
    })),
    onlineWorkers: workers.filter((w) => w.status === "online").length,
    githubConnected: Boolean(githubInstallation),
    recentDeployments: recentDeployments.map((d) => ({
      id: d.id,
      status: d.status,
      gitRef: d.gitRef,
      startedAt: d.startedAt,
      completedAt: d.completedAt,
      serviceId: d.service.id,
      serviceName: d.service.name,
      projectId: d.service.project.id,
      projectName: d.service.project.name,
    })),
  });
});

orgRoutes.get("/:orgId/search", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const membership = await getOrgMembership(user.id, orgId);
  if (!membership) return c.json({ error: "Not found" }, 404);

  const projects = await prisma.project.findMany({
    where: { organizationId: orgId },
    include: { services: { select: { id: true, name: true, slug: true, type: true } } },
  });

  const results: Array<{
    type: "project" | "service";
    id: string;
    name: string;
    subtitle: string;
  }> = [];

  for (const p of projects) {
    const projectMatch = !q || p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
    if (projectMatch) {
      results.push({ type: "project", id: p.id, name: p.name, subtitle: p.slug });
    }
    for (const s of p.services) {
      const serviceMatch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q);
      if (serviceMatch) {
        results.push({
          type: "service",
          id: s.id,
          name: s.name,
          subtitle: `${p.name} · ${s.type}`,
        });
      }
    }
  }

  return c.json({ results: results.slice(0, 50) });
});

orgRoutes.get("/:orgId/activity", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  const membership = await getOrgMembership(user.id, orgId);
  if (!membership) return c.json({ error: "Not found" }, 404);

  const logs = await prisma.auditLog.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return c.json(logs);
});

orgRoutes.post("/:orgId/members", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  const membership = await getOrgMembership(user.id, orgId);
  if (!membership || membership.role === "member") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = inviteMemberSchema.parse(await c.req.json());
  const invitee = await prisma.user.findUnique({ where: { email: body.email } });
  if (!invitee) return c.json({ error: "User not found. They must register first." }, 404);

  const existing = await prisma.orgMember.findFirst({
    where: { organizationId: orgId, userId: invitee.id },
  });
  if (existing) return c.json({ error: "User is already a member" }, 409);

  const member = await prisma.orgMember.create({
    data: {
      organizationId: orgId,
      userId: invitee.id,
      role: body.role,
    },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  await logAudit({
    organizationId: orgId,
    userId: user.id,
    action: "member.invited",
    resourceType: "member",
    resourceId: invitee.id,
    resourceName: invitee.email,
    metadata: { role: body.role },
  });

  return c.json(member, 201);
});

orgRoutes.patch("/:orgId/members/:userId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");
  const membership = await getOrgMembership(user.id, orgId);
  if (!membership || membership.role === "member") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = updateMemberRoleSchema.parse(await c.req.json());
  const target = await prisma.orgMember.findFirst({
    where: { organizationId: orgId, userId: targetUserId },
  });
  if (!target) return c.json({ error: "Not found" }, 404);
  if (target.role === "owner" && membership.role !== "owner") {
    return c.json({ error: "Cannot modify owner" }, 403);
  }

  const updated = await prisma.orgMember.update({
    where: { id: target.id },
    data: { role: body.role },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  await logAudit({
    organizationId: orgId,
    userId: user.id,
    action: "member.role_updated",
    resourceType: "member",
    resourceId: targetUserId,
    metadata: { role: body.role },
  });

  return c.json(updated);
});

orgRoutes.delete("/:orgId/members/:userId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");
  const membership = await getOrgMembership(user.id, orgId);
  if (!membership || membership.role === "member") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const target = await prisma.orgMember.findFirst({
    where: { organizationId: orgId, userId: targetUserId },
  });
  if (!target) return c.json({ error: "Not found" }, 404);
  if (target.role === "owner") return c.json({ error: "Cannot remove owner" }, 403);

  await prisma.orgMember.delete({ where: { id: target.id } });

  await logAudit({
    organizationId: orgId,
    userId: user.id,
    action: "member.removed",
    resourceType: "member",
    resourceId: targetUserId,
  });

  return c.json({ ok: true });
});

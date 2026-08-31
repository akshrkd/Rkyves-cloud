import { Hono } from "hono";
import { prisma } from "@rkyves/db";
import { createProjectSchema } from "@rkyves/shared";
import { requireAuth, requireUser } from "../middleware/auth.js";

export const projectRoutes = new Hono();

projectRoutes.use("*", requireAuth, requireUser);

async function assertOrgAccess(userId: string, orgId: string) {
  const membership = await prisma.orgMember.findFirst({
    where: { userId, organizationId: orgId },
  });
  if (!membership) return null;
  return membership;
}

projectRoutes.get("/orgs/:orgId/projects", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await assertOrgAccess(user.id, orgId))) return c.json({ error: "Not found" }, 404);

  const projects = await prisma.project.findMany({
    where: { organizationId: orgId },
    include: { _count: { select: { services: true } } },
    orderBy: { createdAt: "desc" },
  });

  return c.json(
    projects.map((p) => ({
      ...p,
      serviceCount: p._count.services,
    }))
  );
});

projectRoutes.post("/orgs/:orgId/projects", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await assertOrgAccess(user.id, orgId))) return c.json({ error: "Not found" }, 404);

  const body = createProjectSchema.parse(await c.req.json());

  const existing = await prisma.project.findFirst({
    where: { organizationId: orgId, slug: body.slug },
  });
  if (existing) return c.json({ error: "Project slug already exists" }, 409);

  const project = await prisma.project.create({
    data: {
      organizationId: orgId,
      name: body.name,
      slug: body.slug,
      description: body.description,
      environments: {
        create: { name: "Production", slug: "production", isDefault: true },
      },
    },
    include: { environments: true },
  });

  return c.json(project, 201);
});

projectRoutes.get("/projects/:projectId", async (c) => {
  const user = c.get("user");
  const project = await prisma.project.findUnique({
    where: { id: c.req.param("projectId") },
    include: {
      organization: true,
      services: { orderBy: { createdAt: "desc" } },
      environments: true,
    },
  });
  if (!project) return c.json({ error: "Not found" }, 404);

  const membership = await assertOrgAccess(user.id, project.organizationId);
  if (!membership) return c.json({ error: "Not found" }, 404);

  return c.json(project);
});

projectRoutes.delete("/projects/:projectId", async (c) => {
  const user = c.get("user");
  const project = await prisma.project.findUnique({ where: { id: c.req.param("projectId") } });
  if (!project) return c.json({ error: "Not found" }, 404);

  const membership = await assertOrgAccess(user.id, project.organizationId);
  if (!membership || membership.role === "member") {
    return c.json({ error: "Forbidden" }, 403);
  }

  await prisma.project.delete({ where: { id: project.id } });
  return c.json({ ok: true });
});

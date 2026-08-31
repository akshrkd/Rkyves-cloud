import { Hono } from "hono";
import { prisma } from "@rkyves/db";
import { createOrgSchema } from "@rkyves/shared";
import { requireAuth, requireUser } from "../middleware/auth.js";

export const orgRoutes = new Hono();

orgRoutes.use("*", requireAuth, requireUser);

async function getMembership(userId: string, orgId: string) {
  return prisma.orgMember.findFirst({
    where: { userId, organizationId: orgId },
  });
}

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
  const membership = await getMembership(user.id, c.req.param("orgId"));
  if (!membership) return c.json({ error: "Not found" }, 404);

  const org = await prisma.organization.findUnique({
    where: { id: c.req.param("orgId") },
    include: { members: { include: { user: { select: { id: true, email: true, name: true } } } } },
  });
  return c.json({ ...org, role: membership.role });
});

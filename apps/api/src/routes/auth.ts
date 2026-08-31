import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { prisma } from "@rkyves/db";
import { loginSchema, registerSchema, createApiKeySchema, slugify } from "@rkyves/shared";
import { signToken } from "../lib/auth.js";
import { generateApiKey, hashApiKey } from "../lib/crypto.js";
import { requireAuth, requireUser } from "../middleware/auth.js";

export const authRoutes = new Hono();

authRoutes.post("/register", async (c) => {
  const body = registerSchema.parse(await c.req.json());
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) return c.json({ error: "Email already registered" }, 409);

  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash,
      name: body.name,
    },
  });

  if (body.orgName) {
    const slug = slugify(body.orgName);
    await prisma.organization.create({
      data: {
        name: body.orgName,
        slug,
        members: { create: { userId: user.id, role: "owner" } },
      },
    });
  }

  const token = await signToken({ sub: user.id, email: user.email, name: user.name });
  return c.json({ token, user: { id: user.id, email: user.email, name: user.name } }, 201);
});

authRoutes.post("/login", async (c) => {
  const body = loginSchema.parse(await c.req.json());
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await signToken({ sub: user.id, email: user.email, name: user.name });
  return c.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

authRoutes.get("/me", requireAuth, requireUser, async (c) => {
  const user = c.get("user");
  const memberships = await prisma.orgMember.findMany({
    where: { userId: user.id },
    include: { organization: true },
  });
  return c.json({ user, organizations: memberships.map((m) => ({ ...m.organization, role: m.role })) });
});

authRoutes.post("/api-keys", requireAuth, requireUser, async (c) => {
  const body = createApiKeySchema.parse(await c.req.json());
  const user = c.get("user");
  const { key, prefix } = generateApiKey();

  const apiKey = await prisma.apiKey.create({
    data: {
      userId: user.id,
      name: body.name,
      keyHash: hashApiKey(key),
      prefix,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
  });

  return c.json({ id: apiKey.id, name: apiKey.name, prefix, key }, 201);
});

authRoutes.get("/api-keys", requireAuth, requireUser, async (c) => {
  const user = c.get("user");
  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, prefix: true, expiresAt: true, lastUsedAt: true, createdAt: true },
  });
  return c.json(keys);
});

authRoutes.delete("/api-keys/:id", requireAuth, requireUser, async (c) => {
  const user = c.get("user");
  await prisma.apiKey.deleteMany({ where: { id: c.req.param("id"), userId: user.id } });
  return c.json({ ok: true });
});

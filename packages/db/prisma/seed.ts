import bcrypt from "bcryptjs";
import { prisma } from "../src/index.js";

async function main() {
  const passwordHash = await bcrypt.hash("admin123456", 12);

  const user = await prisma.user.upsert({
    where: { email: "admin@rkyves.com" },
    update: {},
    create: {
      email: "admin@rkyves.com",
      passwordHash,
      name: "Rkyves Admin",
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "rkyves" },
    update: {},
    create: {
      name: "Rkyves",
      slug: "rkyves",
      members: {
        create: {
          userId: user.id,
          role: "owner",
        },
      },
    },
  });

  await prisma.project.upsert({
    where: {
      organizationId_slug: {
        organizationId: org.id,
        slug: "demo",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: "Demo Project",
      slug: "demo",
      description: "Sample project for Rkyves Cloud",
      environments: {
        create: {
          name: "Production",
          slug: "production",
          isDefault: true,
        },
      },
    },
  });

  await prisma.worker.upsert({
    where: { workerId: "worker-1" },
    update: { status: "offline" },
    create: {
      workerId: "worker-1",
      hostname: "localhost",
      status: "offline",
      cpuCores: 4,
      memoryMb: 16384,
      diskGb: 100,
    },
  });

  console.log("Seed complete: admin@rkyves.com / admin123456");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

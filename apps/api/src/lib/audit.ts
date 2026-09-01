import { prisma, Prisma } from "@rkyves/db";

export async function logAudit(params: {
  organizationId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        resourceName: params.resourceName,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error("Audit log failed:", err);
  }
}

export async function getServiceForUser(serviceId: string, userId: string) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { project: { include: { organization: true } } },
  });
  if (!service) return null;

  const membership = await prisma.orgMember.findFirst({
    where: { userId, organizationId: service.project.organizationId },
  });
  if (!membership) return null;

  return { service, membership };
}

export async function getOrgMembership(userId: string, orgId: string) {
  return prisma.orgMember.findFirst({
    where: { userId, organizationId: orgId },
  });
}

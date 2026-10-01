import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from "@edumanage/shared";
import { prisma } from "./config/prisma.js";

export async function ensureAccessCatalog() {
  for (const [key, description] of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }
  for (const [key, name, description] of ROLES) {
    const role = await prisma.role.upsert({
      where: { key },
      update: { name, description },
      create: { key, name, description },
    });
    const wanted = ROLE_PERMISSIONS[key];
    const permissions = await prisma.permission.findMany({ where: { key: { in: [...wanted] } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission: { id: string }) => ({ roleId: role.id, permissionId: permission.id })),
    });
  }
}

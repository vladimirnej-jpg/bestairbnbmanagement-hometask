import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

interface SeedUser {
  readonly email: string;
  readonly password: string;
  readonly role: UserRole;
}

const users: readonly SeedUser[] = [
  {
    email: process.env.OPS_USER_EMAIL ?? 'ops@example.com',
    password: process.env.OPS_USER_PASSWORD ?? 'ops-demo-password',
    role: UserRole.OPS,
  },
  {
    email: process.env.MONITOR_USER_EMAIL ?? 'monitor@example.com',
    password: process.env.MONITOR_USER_PASSWORD ?? 'monitor-demo-password',
    role: UserRole.MONITOR,
  },
];

async function seed(): Promise<void> {
  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    await prisma.user.upsert({
      where: { email: user.email.toLowerCase() },
      create: {
        email: user.email.toLowerCase(),
        passwordHash,
        role: user.role,
        isActive: true,
      },
      update: {
        passwordHash,
        role: user.role,
        isActive: true,
      },
    });
  }
}

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

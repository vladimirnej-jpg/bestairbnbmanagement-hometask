import './load-env';

import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  assertSafeTarget();
  await prisma.$transaction(async (transaction) => {
    await transaction.zoneService.deleteMany();
    await transaction.propertyMatchCandidate.deleteMany();
    await transaction.showcase.deleteMany();
    await transaction.processingRun.deleteMany();
    await transaction.lifecycleEvent.deleteMany();
    await transaction.leadMessage.deleteMany();
    await transaction.leadProperty.deleteMany();
    await transaction.lead.deleteMany();
    await transaction.masterDataSyncRun.deleteMany();
    await transaction.syncLease.deleteMany();
    await transaction.masterProperty.deleteMany();
    await transaction.serviceZone.deleteMany();
    await transaction.service.deleteMany();
    await transaction.user.deleteMany();
    await transaction.user.createMany({ data: await demoUsers() });
  });
  console.log(
    `Local application database reset at ${redactDatabaseUrl(process.env.DATABASE_URL)}.`,
  );
  console.log('Demo users were seeded. Sync the configured Google Sheet and Gmail sources next.');
}

async function demoUsers(): Promise<
  { email: string; passwordHash: string; role: UserRole; isActive: boolean }[]
> {
  const users = [
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
  return Promise.all(
    users.map(async (user) => ({
      email: user.email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(user.password, 12),
      role: user.role,
      isActive: true,
    })),
  );
}

function assertSafeTarget(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) throw new Error('DATABASE_URL is required for local reset');
  if (process.env.NODE_ENV === 'production')
    throw new Error('Local reset is disabled in production');
  if (
    process.argv.includes('--yes') !== true &&
    process.env.RESET_DEMO_CONFIRM !== 'I_UNDERSTAND'
  ) {
    throw new Error('Refusing to reset without --yes or RESET_DEMO_CONFIRM=I_UNDERSTAND');
  }
  const parsed = new URL(databaseUrl);
  const safeHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);
  const databaseName = parsed.pathname.replace(/^\//, '').toLowerCase();
  if (!safeHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Refusing local reset for non-local database host '${parsed.hostname}'`);
  }
  if (!databaseName.includes('bestairbnb') && !databaseName.includes('test')) {
    throw new Error(`Refusing local reset for database '${databaseName}'`);
  }
}

function redactDatabaseUrl(value: string | undefined): string {
  if (value === undefined) return '<missing>';
  try {
    const parsed = new URL(value);
    parsed.username = '<user>';
    parsed.password = '<redacted>';
    return parsed.toString();
  } catch {
    return '<configured database>';
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Local reset failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import './load-env';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { Inngest } from 'inngest';
import { PrismaClient } from '@prisma/client';

import { gmailSyncRequested } from '../src/inngest/events';
import { GoogleGmailProvider } from '../src/server/integrations/google/google-gmail.provider';
import { prepareTestEmail } from '../src/server/integrations/google/gmail-import';
import { getRuntimeConfig } from '../src/server/runtime/config';

const DEFAULT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1_000;
const PROCESSING_STEPS = ['extract', 'property', 'qualification'] as const;

interface CliOptions {
  readonly file: string;
  readonly confirmMailbox: string;
  readonly timeoutMs: number;
  readonly fireAndForget: boolean;
  readonly dryRun: boolean;
}

interface ProcessingResult {
  readonly leadId: string;
  readonly qualificationStatus: string;
  readonly lifecycleStatus: string;
  readonly stepStatuses: Readonly<Record<string, string>>;
}

function main(): Promise<void> {
  const options = parseCliOptions();
  if (options === null) return Promise.resolve();

  return run(options);
}

async function run(options: CliOptions): Promise<void> {
  const sourceMessage = await readFile(path.resolve(process.cwd(), options.file), 'utf8');
  const preparedMessage = prepareTestEmail(sourceMessage);

  if (options.dryRun) {
    console.log(
      `RFC822 message is valid (${Buffer.byteLength(preparedMessage.rawMessage, 'utf8')} bytes).`,
    );
    console.log(`Prepared From: ${preparedMessage.sender}`);
    console.log(`Prepared Date: ${preparedMessage.date}`);
    console.log(`Prepared Subject: ${preparedMessage.subject}`);
    console.log(`Prepared Message-ID: ${preparedMessage.messageId}`);
    return;
  }

  const config = getRuntimeConfig();
  assertImportSafety(config.PROVIDER_MODE, config.NODE_ENV);

  const gmail = new GoogleGmailProvider(config);
  const mailboxEmail = await gmail.getMailboxEmail();
  assertMailboxConfirmation(mailboxEmail, options.confirmMailbox);
  const imported = await gmail.importMessage(preparedMessage.rawMessage);
  const queued = await new Inngest({ id: 'bestairbnb', isDev: true }).send(
    gmailSyncRequested.create({ trigger: 'manual' }),
  );
  const eventId = queued.ids[0];
  if (typeof eventId !== 'string' || eventId.length === 0) {
    throw new Error('Inngest did not return an event id after Gmail import');
  }

  console.log(`Imported Gmail message ${imported.messageId} in thread ${imported.threadId}.`);
  console.log(
    `Imported From: ${preparedMessage.sender}; Date: ${preparedMessage.date}; ` +
      `Subject: ${preparedMessage.subject}.`,
  );
  console.log(`Gmail sync queued with Inngest event ${eventId}.`);

  if (options.fireAndForget) return;

  const prisma = new PrismaClient();
  try {
    const result = await waitForProcessing(prisma, imported.threadId, options.timeoutMs);
    console.log(
      `Lead ${result.leadId} processed: qualification=${result.qualificationStatus}, ` +
        `lifecycle=${result.lifecycleStatus}.`,
    );
    console.log(
      `Processing steps: ${PROCESSING_STEPS.map((step) => `${step}=${result.stepStatuses[step]}`).join(', ')}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function parseCliOptions(): CliOptions | null {
  try {
    const { values } = parseArgs({
      args: normalizeArgv(),
      options: {
        file: { type: 'string', short: 'f' },
        'confirm-mailbox': { type: 'string' },
        'timeout-ms': { type: 'string', default: String(DEFAULT_TIMEOUT_MS) },
        'fire-and-forget': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
    });

    if (values.help === true) {
      printUsage();
      return null;
    }

    if (typeof values.file !== 'string' || values.file.length === 0) {
      throw new Error('The --file option is required');
    }

    const timeoutMs = parseTimeout(values['timeout-ms']);
    const confirmMailbox = values['confirm-mailbox'];
    if (typeof confirmMailbox !== 'string' && values['dry-run'] !== true) {
      throw new Error('The --confirm-mailbox option is required unless --dry-run is used');
    }

    return {
      file: values.file,
      confirmMailbox: typeof confirmMailbox === 'string' ? confirmMailbox : '',
      timeoutMs,
      fireAndForget: values['fire-and-forget'] === true,
      dryRun: values['dry-run'] === true,
    };
  } catch (error) {
    printUsage();
    throw error;
  }
}

function normalizeArgv(): string[] {
  const args = process.argv.slice(2);
  const separatorIndex = args.indexOf('--');
  return separatorIndex === -1 ? args : args.slice(separatorIndex + 1);
}

function parseTimeout(value: string | boolean | undefined): number {
  if (typeof value !== 'string') return DEFAULT_TIMEOUT_MS;
  const timeoutMs = Number(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new Error('--timeout-ms must be an integer between 1000 and 600000');
  }
  return timeoutMs;
}

function assertImportSafety(providerMode: string, nodeEnv: string): void {
  if (nodeEnv === 'production') {
    throw new Error('Gmail test import is disabled in production');
  }
  if (providerMode !== 'live') {
    throw new Error('Set PROVIDER_MODE=live in the local environment before importing into Gmail');
  }
}

function assertMailboxConfirmation(mailboxEmail: string, confirmation: string): void {
  if (confirmation.trim().toLowerCase() !== mailboxEmail) {
    throw new Error(
      `Mailbox confirmation does not match the authenticated Gmail account (${mailboxEmail}). ` +
        'Pass --confirm-mailbox with the exact QA mailbox address.',
    );
  }
}

async function waitForProcessing(
  prisma: PrismaClient,
  threadId: string,
  timeoutMs: number,
): Promise<ProcessingResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lead = await prisma.lead.findUnique({
      where: { gmailThreadId: threadId },
      select: {
        id: true,
        qualificationStatus: true,
        lifecycleStatus: true,
        processingRuns: {
          orderBy: { createdAt: 'desc' },
          select: { step: true, status: true, errorCode: true },
        },
      },
    });
    if (lead !== null) {
      const latestByStep = new Map<string, { status: string; errorCode: string | null }>();
      for (const run of lead.processingRuns) {
        if (!latestByStep.has(run.step)) {
          latestByStep.set(run.step, { status: run.status, errorCode: run.errorCode });
        }
      }
      if (PROCESSING_STEPS.every((step) => isTerminal(latestByStep.get(step)?.status))) {
        const stepStatuses = Object.fromEntries(
          PROCESSING_STEPS.map((step) => [step, latestByStep.get(step)?.status ?? 'UNKNOWN']),
        );
        const failedStep = PROCESSING_STEPS.find(
          (step) => latestByStep.get(step)?.status === 'FAILED',
        );
        if (failedStep !== undefined) {
          const errorCode = latestByStep.get(failedStep)?.errorCode ?? 'unknown error';
          throw new Error(`Lead processing failed at ${failedStep}: ${errorCode}`);
        }
        return {
          leadId: lead.id,
          qualificationStatus: lead.qualificationStatus,
          lifecycleStatus: lead.lifecycleStatus,
          stepStatuses,
        };
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for processing of Gmail thread ${threadId}`,
  );
}

function isTerminal(status: string | undefined): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED';
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function printUsage(): void {
  console.log(`Usage:
  pnpm gmail:inject -- --file scenarios/qualified-inside.eml --confirm-mailbox qa@example.com

Options:
  -f, --file <path>          RFC822 message to import (required)
      --confirm-mailbox <x>  Must equal the authenticated Gmail address (required)
      --timeout-ms <n>       Processing wait timeout, 1000-600000 (default: ${DEFAULT_TIMEOUT_MS})
      --fire-and-forget      Import and queue sync without waiting for processing
      --dry-run              Validate the RFC822 file without calling Google or Inngest
  -h, --help                 Show this help

The command requires PROVIDER_MODE=live, a non-production Gmail account, and a
non-production NODE_ENV. GOOGLE_GMAIL_USER_ID may be an address or "me".`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Gmail test import failed');
  process.exitCode = 1;
});

import { randomUUID } from 'node:crypto';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export interface PreparedTestEmail {
  readonly rawMessage: string;
  readonly sender: string;
  readonly date: string;
  readonly subject: string;
  readonly messageId: string;
}

export interface PrepareTestEmailOptions {
  readonly now?: Date;
  readonly sender?: string;
  readonly runId?: string;
}

export function encodeRfc822Message(rawMessage: string): string {
  assertRfc822Message(rawMessage);
  return Buffer.from(rawMessage, 'utf8').toString('base64url');
}

export function assertRfc822Message(rawMessage: string): void {
  if (rawMessage.trim().length === 0) {
    throw new Error('RFC822 message must not be empty');
  }
  if (rawMessage.includes('\u0000')) {
    throw new Error('RFC822 message contains a NUL byte');
  }
  if (Buffer.byteLength(rawMessage, 'utf8') > MAX_IMPORT_BYTES) {
    throw new Error(`RFC822 message exceeds the ${MAX_IMPORT_BYTES} byte safety limit`);
  }
}

export function prepareTestEmail(
  rawMessage: string,
  options: PrepareTestEmailOptions = {},
): PreparedTestEmail {
  assertRfc822Message(rawMessage);

  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error('Test email date must be a valid Date');
  }

  const runId = options.runId ?? randomUUID();
  const sender = options.sender ?? createRandomTestSender(now, runId);
  if (!isMailboxAddress(sender)) {
    throw new Error('Test email sender must be a valid mailbox address');
  }

  const normalized = rawMessage.replace(/\r\n?/g, '\n');
  const separatorIndex = normalized.indexOf('\n\n');
  const headers = separatorIndex === -1 ? normalized : normalized.slice(0, separatorIndex);
  const body = separatorIndex === -1 ? '' : normalized.slice(separatorIndex + 2);
  const date = now.toUTCString();
  const sourceSubject = readHeader(headers, 'Subject') ?? 'Test lead';
  const subject = `${sourceSubject} (test-${runId})`;
  const messageId = `<test-lead-${runId}@example.test>`;
  let preparedHeaders = setHeader(headers, 'Date', date);
  preparedHeaders = setHeader(preparedHeaders, 'From', sender);
  preparedHeaders = setHeader(preparedHeaders, 'Subject', subject);
  preparedHeaders = setHeader(preparedHeaders, 'Message-ID', messageId);

  return {
    rawMessage: `${toCrlf(preparedHeaders)}\r\n\r\n${toCrlf(body)}`,
    sender,
    date,
    subject,
    messageId,
  };
}

function createRandomTestSender(now: Date, runId: string): string {
  const timestamp = now.getTime().toString(36);
  return `lead-${timestamp}-${runId}@example.test`;
}

function readHeader(headers: string, name: string): string | undefined {
  const headerPattern = new RegExp(`^${name}:\\s*(.*)$`, 'i');
  const lines = headers.split('\n');
  let value: string | undefined;
  for (const line of lines) {
    if (/^[ \t]/.test(line)) {
      if (value !== undefined) value += ` ${line.trim()}`;
      continue;
    }
    const match = headerPattern.exec(line);
    if (match !== null) {
      const headerValue = match[1];
      if (headerValue === undefined) continue;
      value = headerValue.trim();
      break;
    }
  }
  return value;
}

function setHeader(headers: string, name: string, value: string): string {
  const lines = headers.split('\n');
  const headerPattern = new RegExp(`^${name}:`, 'i');
  const result: string[] = [];
  let replaced = false;
  let skipContinuation = false;

  for (const line of lines) {
    if (/^[ \t]/.test(line)) {
      if (skipContinuation) continue;
      result.push(line);
      continue;
    }
    skipContinuation = false;
    if (headerPattern.test(line)) {
      if (!replaced) {
        result.push(`${name}: ${value}`);
        replaced = true;
      }
      skipContinuation = true;
      continue;
    }
    result.push(line);
  }

  return replaced ? result.join('\n') : `${name}: ${value}\n${headers}`;
}

function isMailboxAddress(value: string): boolean {
  return /^[^@\s<>\r\n]+@[^@\s<>\r\n]+$/.test(value);
}

function toCrlf(value: string): string {
  return value.replace(/\n/g, '\r\n');
}

export const MAX_GMAIL_IMPORT_BYTES = MAX_IMPORT_BYTES;

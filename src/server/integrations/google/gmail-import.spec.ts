import { describe, expect, it } from 'vitest';

import {
  assertRfc822Message,
  encodeRfc822Message,
  MAX_GMAIL_IMPORT_BYTES,
  prepareTestEmail,
} from './gmail-import';

describe('Gmail RFC822 import helpers', () => {
  it('encodes the complete message as base64url', () => {
    const message = 'From: person@example.test\r\n\r\nHello';

    expect(encodeRfc822Message(message)).toBe(Buffer.from(message, 'utf8').toString('base64url'));
  });

  it('rejects an empty message', () => {
    expect(() => assertRfc822Message('  ')).toThrow('must not be empty');
  });

  it('rejects NUL bytes and oversized messages', () => {
    expect(() => assertRfc822Message('From: a@example.test\u0000')).toThrow('NUL');
    expect(() => assertRfc822Message('x'.repeat(MAX_GMAIL_IMPORT_BYTES + 1))).toThrow(
      'safety limit',
    );
  });

  it('replaces the sender and date while preserving the message body', () => {
    const prepared = prepareTestEmail(
      [
        'From: original@example.test',
        'Date: Wed, 01 Jan 2020 00:00:00 +0000',
        'Subject: Test',
        '',
        'Body with an address at 10 Example Street, Amsterdam.',
      ].join('\r\n'),
      {
        now: new Date('2026-08-28T14:30:00.000Z'),
        sender: 'lead-123@example.test',
        runId: 'run-123',
      },
    );

    expect(prepared.sender).toBe('lead-123@example.test');
    expect(prepared.date).toBe('Fri, 28 Aug 2026 14:30:00 GMT');
    expect(prepared.subject).toBe('Test (test-run-123)');
    expect(prepared.messageId).toBe('<test-lead-run-123@example.test>');
    expect(prepared.rawMessage).toContain('From: lead-123@example.test\r\n');
    expect(prepared.rawMessage).toContain('Date: Fri, 28 Aug 2026 14:30:00 GMT\r\n');
    expect(prepared.rawMessage).toContain('Subject: Test (test-run-123)\r\n');
    expect(prepared.rawMessage).toContain('Message-ID: <test-lead-run-123@example.test>\r\n');
    expect(prepared.rawMessage).toContain('Body with an address at 10 Example Street, Amsterdam.');
    expect(prepared.rawMessage).not.toContain('From: original@example.test');
  });

  it('adds missing sender and date headers and generates a unique sender', () => {
    const now = new Date('2026-08-28T14:30:00.000Z');
    const first = prepareTestEmail('Subject: Test\n\nHello', { now });
    const second = prepareTestEmail('Subject: Test\n\nHello', { now });

    expect(first.rawMessage).toContain(`Date: ${first.date}\r\n`);
    expect(first.rawMessage).toContain(`From: ${first.sender}\r\n`);
    expect(first.rawMessage).toContain(`Subject: ${first.subject}\r\n`);
    expect(first.rawMessage).toContain(`Message-ID: ${first.messageId}\r\n`);
    expect(first.rawMessage).toContain('\r\n\r\nHello');
    expect(first.sender).toMatch(/^lead-[a-z0-9]+-[0-9a-f-]+@example\.test$/);
    expect(second.sender).not.toBe(first.sender);
    expect(second.subject).not.toBe(first.subject);
    expect(second.messageId).not.toBe(first.messageId);
  });
});

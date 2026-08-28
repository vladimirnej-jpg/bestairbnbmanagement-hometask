import { describe, expect, it, vi } from 'vitest';

import { ShowcasesService } from './showcases.service';

describe('ShowcasesService', () => {
  it('protects representative-edited content from implicit regeneration', async () => {
    const repository = {
      findLead: vi.fn().mockResolvedValue({
        qualificationStatus: 'QUALIFIED',
        property: {
          normalizedPostcode: '1012AB',
          normalizedCity: 'amsterdam',
          canonicalAddress: '10 Example Street',
          rawAddress: '10 Example Street',
          masterProperty: null,
        },
        showcase: { manuallyEditedAt: new Date() },
      }),
      latestSuccessfulProjection: vi.fn().mockResolvedValue({ finishedAt: new Date() }),
      servicesForProperty: vi.fn().mockResolvedValue(['Cleaning']),
    };
    const service = new ShowcasesService(
      repository as never,
      { render: vi.fn() } as never,
      {} as never,
    );

    await expect(service.generate('lead-1')).rejects.toMatchObject({
      status: 409,
      code: 'SHOWCASE_MANUALLY_EDITED',
    });
  });

  it('keeps generated subjects within the Gmail length limit for long addresses', async () => {
    const address = 'A'.repeat(200);
    const upsertContent = vi.fn().mockResolvedValue({});
    const repository = {
      findLead: vi.fn().mockResolvedValue({
        qualificationStatus: 'QUALIFIED',
        contactName: 'Long address lead',
        property: {
          normalizedPostcode: '1012AB',
          normalizedCity: 'amsterdam',
          canonicalAddress: address,
          rawAddress: address,
          masterProperty: null,
        },
        showcase: null,
      }),
      latestSuccessfulProjection: vi.fn().mockResolvedValue({ finishedAt: new Date() }),
      servicesForProperty: vi.fn().mockResolvedValue(['Cleaning']),
      upsertContent,
    };
    const service = new ShowcasesService(
      repository as never,
      { render: vi.fn().mockResolvedValue('<p>showcase</p>') } as never,
      {} as never,
    );

    await service.generate('lead-1');

    const content = upsertContent.mock.calls[0]?.[2] as {
      readonly subject: string;
      readonly propertySummary: string;
    };
    expect(content.subject).toHaveLength(160);
    expect(content.subject.endsWith('...')).toBe(true);
    expect(content.propertySummary).toContain(address);
  });

  it('rejects manual edits when the lead is not qualified', async () => {
    const repository = {
      findLead: vi.fn().mockResolvedValue({
        qualificationStatus: 'NEEDS_REVIEW',
        property: null,
        showcase: { status: 'READY', manuallyEditedAt: null },
      }),
      latestSuccessfulProjection: vi.fn().mockResolvedValue({ finishedAt: new Date() }),
      servicesForProperty: vi.fn().mockResolvedValue(['Cleaning']),
    };
    const renderer = { render: vi.fn() };
    const service = new ShowcasesService(repository as never, renderer as never, {} as never);

    await expect(
      service.edit('lead-1', {
        subject: 'Subject',
        greeting: 'Hello',
        propertySummary: 'Summary',
        selectedServices: ['Cleaning'],
        observations: ['Observation'],
        callToAction: 'Reply',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'SHOWCASE_NOT_READY' });
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('allows retrying a failed draft when the current lead is still ready', async () => {
    const repository = {
      findLead: vi.fn().mockResolvedValue({
        qualificationStatus: 'QUALIFIED',
        contactEmail: 'lead@example.com',
        property: { normalizedPostcode: '1012AB', normalizedCity: 'amsterdam' },
        showcase: {
          status: 'FAILED',
          structuredContent: {
            subject: 'Subject',
            greeting: 'Hello',
            propertySummary: 'Summary',
            selectedServices: ['Cleaning'],
            observations: ['Observation'],
            callToAction: 'Reply',
          },
          renderedHtml: '<p>Summary</p>',
          gmailDraftId: null,
        },
      }),
      latestSuccessfulProjection: vi.fn().mockResolvedValue({ finishedAt: new Date() }),
      servicesForProperty: vi.fn().mockResolvedValue(['Cleaning']),
    };
    const gmailDraftService = { sync: vi.fn().mockResolvedValue('draft-1') };
    const service = new ShowcasesService(
      repository as never,
      {} as never,
      gmailDraftService as never,
    );

    await expect(service.syncDraft('lead-1')).resolves.toEqual({ draftId: 'draft-1' });
    expect(gmailDraftService.sync).toHaveBeenCalledWith(
      'lead-1',
      'lead@example.com',
      'Subject',
      '<p>Summary</p>',
      null,
    );
  });
});

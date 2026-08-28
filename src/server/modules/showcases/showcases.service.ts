import type { Showcase } from '@prisma/client';

import type { ShowcaseContent } from '@/emails/showcase-email.types';
import { ApplicationError } from '../../errors/application-error';
import type { GmailDraftService } from './gmail-draft.service';
import { showcaseContentSchema, type ShowcaseContentInput } from './showcase-content.schema';
import {
  ShowcaseReadinessPolicy,
  type ShowcaseReadinessDecision,
} from './showcase-readiness.policy';
import type { ShowcaseRendererService } from './showcase-renderer.service';
import type { ShowcasesRepository } from './showcases.repository';

const STALE_PROJECTION_MS = 24 * 60 * 60 * 1_000;
type ShowcaseLead = NonNullable<Awaited<ReturnType<ShowcasesRepository['findLead']>>>;

export class ShowcasesService {
  private readonly readinessPolicy = new ShowcaseReadinessPolicy();
  public constructor(
    private readonly repository: ShowcasesRepository,
    private readonly renderer: ShowcaseRendererService,
    private readonly gmailDraftService: GmailDraftService,
  ) {}

  public async generate(leadId: string, overwriteManual = false): Promise<Showcase> {
    const lead = await this.repository.findLead(leadId);
    if (lead === null) throw new ApplicationError(404, 'LEAD_NOT_FOUND', 'Lead was not found');
    const { readiness, services } = await this.evaluateReadiness(lead);
    if (readiness.status !== 'READY')
      return this.repository.setStatus(leadId, readiness.status, readiness.blockingReason);
    if (
      lead.showcase?.manuallyEditedAt !== null &&
      lead.showcase?.manuallyEditedAt !== undefined &&
      !overwriteManual
    )
      throw new ApplicationError(
        409,
        'SHOWCASE_MANUALLY_EDITED',
        'Set overwriteManual to regenerate a representative-edited showcase',
      );
    const content = showcaseContentSchema.parse(
      this.createContent(lead, services, readiness.warning),
    );
    const html = await this.renderer.render(content);
    return this.repository.upsertContent(leadId, 'READY', content, html, false);
  }

  public async get(leadId: string): Promise<Showcase> {
    const lead = await this.repository.findLead(leadId);
    if (lead === null) {
      throw new ApplicationError(404, 'LEAD_NOT_FOUND', 'Lead was not found');
    }
    if (lead.showcase === null) {
      throw new ApplicationError(
        404,
        'SHOWCASE_NOT_FOUND',
        'This lead does not have a showcase yet',
      );
    }
    return lead.showcase;
  }

  public async edit(leadId: string, content: ShowcaseContentInput): Promise<Showcase> {
    const lead = await this.repository.findLead(leadId);
    if (lead === null) throw new ApplicationError(404, 'LEAD_NOT_FOUND', 'Lead was not found');
    const { readiness } = await this.evaluateReadiness(lead);
    if (readiness.status !== 'READY')
      throw new ApplicationError(
        409,
        'SHOWCASE_NOT_READY',
        readiness.blockingReason ?? 'Showcase is not ready for editing',
      );
    if (lead.showcase === null)
      throw new ApplicationError(
        409,
        'SHOWCASE_NOT_GENERATED',
        'Generate a showcase before editing its content',
      );
    const parsed = showcaseContentSchema.parse(content);
    return this.repository.editContent(leadId, parsed, await this.renderer.render(parsed));
  }

  public async syncDraft(leadId: string): Promise<{ readonly draftId: string }> {
    const lead = await this.repository.findLead(leadId);
    if (lead === null) throw new ApplicationError(404, 'LEAD_NOT_FOUND', 'Lead was not found');
    const showcase = lead.showcase;
    if (
      showcase === null ||
      (showcase.status !== 'READY' &&
        showcase.status !== 'DRAFT_CREATED' &&
        showcase.status !== 'FAILED')
    )
      throw new ApplicationError(
        409,
        'SHOWCASE_NOT_READY',
        'Generate a ready showcase before creating a Gmail draft',
      );
    const { readiness } = await this.evaluateReadiness(lead);
    if (readiness.status !== 'READY')
      throw new ApplicationError(
        409,
        'SHOWCASE_NOT_READY',
        readiness.blockingReason ?? 'Showcase is not ready for synchronization',
      );
    if (
      lead.contactEmail === null ||
      showcase.structuredContent === null ||
      showcase.renderedHtml === null
    )
      throw new ApplicationError(
        409,
        'SHOWCASE_CONTENT_INCOMPLETE',
        'Showcase contact or content is missing',
      );
    const content = showcaseContentSchema.parse(showcase.structuredContent) as ShowcaseContent;
    return {
      draftId: await this.gmailDraftService.sync(
        leadId,
        lead.contactEmail,
        content.subject,
        showcase.renderedHtml,
        showcase.gmailDraftId,
      ),
    };
  }

  private async evaluateReadiness(lead: ShowcaseLead): Promise<{
    readonly readiness: ShowcaseReadinessDecision;
    readonly services: readonly string[];
  }> {
    const [projection, services] = await Promise.all([
      this.repository.latestSuccessfulProjection(),
      this.repository.servicesForProperty(
        lead.property?.normalizedPostcode ?? null,
        lead.property?.normalizedCity ?? null,
      ),
    ]);
    return {
      services,
      readiness: this.readinessPolicy.decide({
        qualificationStatus: lead.qualificationStatus,
        hasSuccessfulProjection: projection !== null,
        activeServiceCount: services.length,
        isMasterDataStale:
          projection?.finishedAt === null || projection === null
            ? false
            : Date.now() - projection.finishedAt.getTime() > STALE_PROJECTION_MS,
      }),
    };
  }
  private createContent(
    lead: NonNullable<Awaited<ReturnType<ShowcasesRepository['findLead']>>>,
    services: readonly string[],
    warning: string | null,
  ): ShowcaseContentInput {
    const address = lead.property?.canonicalAddress ?? lead.property?.rawAddress ?? 'your property';
    return {
      subject: `Your service showcase for ${address}`,
      greeting: `Hello ${lead.contactName ?? 'there'},`,
      propertySummary: `We prepared this showcase for ${address}.`,
      selectedServices: [...services],
      observations: [
        `Property address: ${address}`,
        ...(lead.property?.masterProperty === null || lead.property?.masterProperty === undefined
          ? []
          : ['Property details matched to the current service catalogue.']),
      ],
      callToAction: 'Reply to discuss the services that fit your property.',
      ...(warning === null ? {} : { masterDataWarning: warning }),
    };
  }
}

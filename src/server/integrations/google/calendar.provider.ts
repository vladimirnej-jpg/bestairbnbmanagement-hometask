export interface CalendarEvent {
  readonly eventId: string;
  readonly title: string;
  readonly startAt: Date;
  readonly endAt: Date | null;
  readonly attendeeEmails: readonly string[];
}

export interface CalendarProvider {
  listUpcomingEvents(): Promise<readonly CalendarEvent[]>;
}

export const CALENDAR_PROVIDER = Symbol('CALENDAR_PROVIDER');

export class CalendarProviderError extends Error {
  public constructor(
    public readonly code:
      | 'PROVIDER_CONFIGURATION'
      | 'PROVIDER_UNAVAILABLE'
      | 'PROVIDER_TIMEOUT'
      | 'PROVIDER_INVALID_RESPONSE',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CalendarProviderError';
  }
}

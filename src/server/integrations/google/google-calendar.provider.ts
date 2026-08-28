import { google, type calendar_v3 } from 'googleapis';

import type { AppConfig } from '../../runtime/config';
import { createGmailOAuthClient, GoogleClientConfigurationError } from './google-client.factory';
import {
  CalendarProviderError,
  type CalendarEvent,
  type CalendarProvider,
} from './calendar.provider';

const REQUEST_TIMEOUT_MS = 30_000;

export class GoogleCalendarProvider implements CalendarProvider {
  public constructor(private readonly config: AppConfig) {}

  public async listUpcomingEvents(): Promise<readonly CalendarEvent[]> {
    let client: calendar_v3.Calendar;
    try {
      const auth = createGmailOAuthClient({
        GOOGLE_GMAIL_CLIENT_ID: this.config.GOOGLE_GMAIL_CLIENT_ID,
        GOOGLE_GMAIL_CLIENT_SECRET: this.config.GOOGLE_GMAIL_CLIENT_SECRET,
        GOOGLE_GMAIL_REFRESH_TOKEN: this.config.GOOGLE_GMAIL_REFRESH_TOKEN,
      });
      client = google.calendar({ version: 'v3', auth });
    } catch (error) {
      if (error instanceof GoogleClientConfigurationError) {
        throw new CalendarProviderError('PROVIDER_CONFIGURATION', error.message, { cause: error });
      }
      throw error;
    }

    try {
      const response = await this.withTimeout(
        client.events.list({
          calendarId: this.config.GOOGLE_CALENDAR_ID,
          timeMin: new Date().toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          showDeleted: false,
          maxResults: this.config.GOOGLE_CALENDAR_MAX_RESULTS,
        }),
      );
      return (response.data.items ?? [])
        .filter(
          (event): event is calendar_v3.Schema$Event & { id: string } =>
            typeof event.id === 'string',
        )
        .map((event) => this.toCalendarEvent(event))
        .filter((event): event is CalendarEvent => event !== null);
    } catch (error) {
      if (error instanceof CalendarProviderError) throw error;
      throw new CalendarProviderError('PROVIDER_UNAVAILABLE', 'Google Calendar request failed', {
        cause: error,
      });
    }
  }

  private toCalendarEvent(event: calendar_v3.Schema$Event & { id: string }): CalendarEvent | null {
    const startValue = event.start?.dateTime ?? event.start?.date;
    if (typeof startValue !== 'string') return null;
    const startAt = new Date(startValue);
    if (Number.isNaN(startAt.getTime())) return null;
    const endValue = event.end?.dateTime ?? event.end?.date;
    const endAt = typeof endValue !== 'string' ? null : new Date(endValue);
    return {
      eventId: event.id,
      title: event.summary ?? '(untitled event)',
      startAt,
      endAt: Number.isNaN(endAt?.getTime() ?? 0) ? null : endAt,
      attendeeEmails: (event.attendees ?? [])
        .map((attendee) => attendee.email?.trim().toLowerCase())
        .filter((email): email is string => email !== undefined),
    };
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new CalendarProviderError('PROVIDER_TIMEOUT', 'Calendar request timed out')),
        REQUEST_TIMEOUT_MS,
      );
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
}

import { google, type sheets_v4 } from 'googleapis';

import type { AppConfig } from '../runtime/config';
import {
  MasterDataProviderError,
  type MasterDataProvider,
  type MasterDataSnapshot,
} from '../modules/master-data/master-data-provider';

const TAB_RANGES = {
  properties: 'Properties!A:G',
  serviceZones: 'ServiceZones!A:E',
  services: 'Services!A:D',
  zoneServices: 'ZoneServices!A:C',
} as const;

type SheetRow = Record<string, string>;

function rowsToRecords(values: readonly (readonly unknown[])[]): SheetRow[] {
  const [headerRow, ...dataRows] = values;
  if (headerRow === undefined || headerRow.length === 0) {
    throw new MasterDataProviderError(
      'PROVIDER_INVALID_RESPONSE',
      'Google Sheet tab has no header row',
    );
  }

  const headers = headerRow.map((header) => String(header).trim());
  if (headers.some((header) => header.length === 0)) {
    throw new MasterDataProviderError(
      'PROVIDER_INVALID_RESPONSE',
      'Google Sheet has an empty column header',
    );
  }

  return dataRows
    .filter((row) => row.some((value) => String(value ?? '').trim().length > 0))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? '').trim()])),
    );
}

function value(row: SheetRow, key: string): string | undefined {
  const result = row[key];
  return result === undefined || result.length === 0 ? undefined : result;
}

function requiredValue(row: SheetRow, key: string): string {
  const result = value(row, key);
  if (result === undefined) {
    throw new MasterDataProviderError(
      'PROVIDER_INVALID_RESPONSE',
      `Google Sheet column '${key}' is empty`,
    );
  }
  return result;
}

function booleanValue(row: SheetRow, key: string): boolean | undefined {
  const result = value(row, key)?.toLowerCase();
  if (result === undefined) {
    return undefined;
  }
  if (result === 'true' || result === 'yes' || result === '1') {
    return true;
  }
  if (result === 'false' || result === 'no' || result === '0') {
    return false;
  }
  throw new MasterDataProviderError('PROVIDER_INVALID_RESPONSE', `Column '${key}' must be boolean`);
}

function prefixes(row: SheetRow): string[] {
  return requiredValue(row, 'postcodePrefixes')
    .split(',')
    .map((prefix) => prefix.trim())
    .filter((prefix) => prefix.length > 0);
}

function parseDate(row: SheetRow, key: string): string | undefined {
  const result = value(row, key);
  if (result === undefined) {
    return undefined;
  }
  const date = new Date(result);
  if (Number.isNaN(date.getTime())) {
    throw new MasterDataProviderError(
      'PROVIDER_INVALID_RESPONSE',
      `Column '${key}' must be an ISO date`,
    );
  }
  return date.toISOString();
}

function getValues(
  range: sheets_v4.Schema$ValueRange | undefined,
): readonly (readonly unknown[])[] {
  return (range?.values ?? []) as readonly (readonly unknown[])[];
}

export class GoogleSheetsMasterDataProvider implements MasterDataProvider {
  public constructor(private readonly config: AppConfig) {}

  public async fetchSnapshot(): Promise<MasterDataSnapshot> {
    const spreadsheetId = this.config.GOOGLE_SHEETS_SPREADSHEET_ID;
    const credentialsBase64 = this.config.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64;
    if (spreadsheetId === undefined || credentialsBase64 === undefined) {
      throw new MasterDataProviderError(
        'PROVIDER_CONFIGURATION',
        'Google Sheets requires spreadsheet id and service account credentials',
      );
    }

    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(Buffer.from(credentialsBase64, 'base64').toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch (error) {
      throw new MasterDataProviderError(
        'PROVIDER_CONFIGURATION',
        'Google Sheets service account credentials are not valid base64 JSON',
        { cause: error },
      );
    }

    try {
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
      const client = google.sheets({ version: 'v4', auth });
      const result = await client.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: Object.values(TAB_RANGES),
      });
      const ranges = result.data.valueRanges ?? [];

      return {
        properties: rowsToRecords(getValues(ranges[0])).map((row) => ({
          externalId: requiredValue(row, 'externalId'),
          addressLine1: requiredValue(row, 'addressLine1'),
          city: requiredValue(row, 'city'),
          postcode: requiredValue(row, 'postcode'),
          contactEmail: value(row, 'contactEmail'),
          sourceUpdatedAt: parseDate(row, 'sourceUpdatedAt'),
          isActive: booleanValue(row, 'isActive'),
        })),
        serviceZones: rowsToRecords(getValues(ranges[1])).map((row) => ({
          externalId: requiredValue(row, 'externalId'),
          name: requiredValue(row, 'name'),
          city: value(row, 'city'),
          postcodePrefixes: prefixes(row),
          isActive: booleanValue(row, 'isActive'),
        })),
        services: rowsToRecords(getValues(ranges[2])).map((row) => ({
          externalId: requiredValue(row, 'externalId'),
          name: requiredValue(row, 'name'),
          description: value(row, 'description'),
          isActive: booleanValue(row, 'isActive'),
        })),
        zoneServices: rowsToRecords(getValues(ranges[3])).map((row) => ({
          serviceZoneExternalId: requiredValue(row, 'serviceZoneExternalId'),
          serviceExternalId: requiredValue(row, 'serviceExternalId'),
          isActive: booleanValue(row, 'isActive'),
        })),
      };
    } catch (error) {
      if (error instanceof MasterDataProviderError) {
        throw error;
      }
      throw new MasterDataProviderError('PROVIDER_UNAVAILABLE', 'Google Sheets request failed', {
        cause: error,
      });
    }
  }
}

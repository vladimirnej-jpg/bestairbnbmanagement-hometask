import { google, type Auth } from 'googleapis';

interface GoogleServiceAccountConfig {
  readonly GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64?: string;
}

interface GmailOAuthConfig {
  readonly GOOGLE_GMAIL_CLIENT_ID?: string;
  readonly GOOGLE_GMAIL_CLIENT_SECRET?: string;
  readonly GOOGLE_GMAIL_REFRESH_TOKEN?: string;
}

export class GoogleClientConfigurationError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GoogleClientConfigurationError';
  }
}

export function createGoogleAuth(
  config: GoogleServiceAccountConfig,
  scopes: readonly string[],
): Auth.GoogleAuth {
  const encodedCredentials = config.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64;
  if (encodedCredentials === undefined) {
    throw new GoogleClientConfigurationError(
      'Google service account credentials are not configured',
    );
  }

  let credentials: { client_email?: string; private_key?: string };
  try {
    credentials = JSON.parse(Buffer.from(encodedCredentials, 'base64').toString('utf8')) as {
      client_email?: string;
      private_key?: string;
    };
  } catch (error) {
    throw new GoogleClientConfigurationError('Google service account credentials are invalid', {
      cause: error,
    });
  }

  if (credentials.client_email === undefined || credentials.private_key === undefined) {
    throw new GoogleClientConfigurationError('Google service account credentials are incomplete');
  }

  return new google.auth.GoogleAuth({ credentials, scopes: [...scopes] });
}

export function createGmailOAuthClient(config: GmailOAuthConfig): Auth.OAuth2Client {
  const { GOOGLE_GMAIL_CLIENT_ID: clientId, GOOGLE_GMAIL_CLIENT_SECRET: clientSecret } = config;
  const refreshToken = config.GOOGLE_GMAIL_REFRESH_TOKEN;
  if (clientId === undefined || clientSecret === undefined || refreshToken === undefined) {
    throw new GoogleClientConfigurationError(
      'Gmail OAuth client id, client secret, and refresh token are required',
    );
  }

  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

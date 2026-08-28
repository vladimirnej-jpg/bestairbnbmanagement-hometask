import 'server-only';

import { jwtVerify, SignJWT } from 'jose';

import type { AppConfig } from '../runtime/config';
import { ApplicationError } from '../errors/application-error';

export const ACCESS_TOKEN_TTL_SECONDS = 900;

export interface TokenSubject {
  readonly id: string;
  readonly email: string;
}

export interface VerifiedToken {
  readonly sub: string;
  readonly email: string;
}

export class TokenService {
  private readonly secret: Uint8Array;

  public constructor(config: Pick<AppConfig, 'JWT_SECRET'>) {
    this.secret = new TextEncoder().encode(config.JWT_SECRET);
  }

  public sign(subject: TokenSubject): Promise<string> {
    return new SignJWT({ email: subject.email })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(subject.id)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.secret);
  }

  public async verify(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.secret, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
        throw new ApplicationError(401, 'UNAUTHORIZED', 'Bearer token is invalid or expired');
      }
      return { sub: payload.sub, email: payload.email };
    } catch (error: unknown) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        401,
        'UNAUTHORIZED',
        'Bearer token is invalid or expired',
        undefined,
        {
          cause: error,
        },
      );
    }
  }
}

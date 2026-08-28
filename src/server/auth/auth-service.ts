import 'server-only';

import type { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { ApplicationError } from '../errors/application-error';
import { ACCESS_TOKEN_TTL_SECONDS, type TokenService } from './token-service';

interface LoginAttemptState {
  count: number;
  resetAt: number;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
}

export interface LoginResponse {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresInSeconds: number;
  readonly user: AuthenticatedUser;
}

const LOGIN_WINDOW_MS = 60_000;
const MAX_FAILED_ATTEMPTS = 5;

export class AuthService {
  private readonly failedAttempts = new Map<string, LoginAttemptState>();

  public constructor(
    private readonly prisma: Pick<PrismaClient, 'user'>,
    private readonly tokenService: TokenService,
  ) {}

  public async login(input: LoginInput): Promise<LoginResponse> {
    const email = input.email.trim().toLowerCase();
    this.assertNotRateLimited(email);

    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordMatches =
      user === null ? false : await bcrypt.compare(input.password, user.passwordHash);

    if (user === null || !user.isActive || !passwordMatches) {
      this.recordFailedAttempt(email);
      throw new ApplicationError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }

    this.failedAttempts.delete(email);
    const accessToken = await this.tokenService.sign({ id: user.id, email: user.email });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  public async authorizeRequest(
    request: Request,
    roles: readonly UserRole[] = [],
  ): Promise<AuthenticatedUser> {
    const token = this.extractBearerToken(request.headers.get('authorization'));
    if (token === undefined) {
      throw new ApplicationError(401, 'UNAUTHORIZED', 'Bearer token is required');
    }

    const payload = await this.tokenService.verify(token);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (user === null || !user.isActive || user.email !== payload.email) {
      throw new ApplicationError(401, 'UNAUTHORIZED', 'Bearer token is invalid or expired');
    }

    if (roles.length > 0 && !roles.includes(user.role)) {
      throw new ApplicationError(403, 'FORBIDDEN', 'The current role cannot perform this action');
    }

    return { id: user.id, email: user.email, role: user.role };
  }

  private extractBearerToken(authorization: string | null): string | undefined {
    if (authorization === null) return undefined;
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    return match?.[1];
  }

  private assertNotRateLimited(email: string): void {
    const state = this.failedAttempts.get(email);
    if (state === undefined) return;

    if (state.resetAt <= Date.now()) {
      this.failedAttempts.delete(email);
      return;
    }

    if (state.count >= MAX_FAILED_ATTEMPTS) {
      throw new ApplicationError(
        429,
        'LOGIN_RATE_LIMITED',
        'Too many failed login attempts. Try again shortly.',
      );
    }
  }

  private recordFailedAttempt(email: string): void {
    const now = Date.now();
    const state = this.failedAttempts.get(email);
    if (state === undefined || state.resetAt <= now) {
      this.failedAttempts.set(email, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
      return;
    }
    state.count += 1;
  }
}

import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';

function extractSsoMessage(data: unknown): string | undefined {
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (!data || typeof data !== 'object') return undefined;
  const obj = data as Record<string, unknown>;
  const direct = obj.message ?? obj.error ?? obj.detail;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (Array.isArray(direct)) {
    const parts = direct.filter((x) => typeof x === 'string' && x.trim());
    if (parts.length) return parts.join(', ');
  }
  const nested = obj.data;
  if (nested && typeof nested === 'object') {
    return extractSsoMessage(nested);
  }
  return undefined;
}

function inferAuthErrorCode(
  status: number,
  message: string,
  context: 'login' | 'refresh' | 'otp' | 'signup' | 'generic',
): string {
  const lower = message.toLowerCase();
  if (context === 'login' || (status === 401 && lower.includes('credential'))) {
    return 'InvalidCredentials';
  }
  if (
    context === 'refresh' ||
    (status === 401 && (lower.includes('token') || lower.includes('expired')))
  ) {
    return 'InvalidToken';
  }
  if (
    context === 'otp' ||
    (status === 400 &&
      (lower.includes('otp') || lower.includes('verification')))
  ) {
    return 'InvalidOtp';
  }
  if (
    status === 409 ||
    lower.includes('already exists') ||
    lower.includes('duplicate')
  ) {
    return 'Conflict';
  }
  if (status === 400) return 'ValidationFailed';
  if (status === 401) return 'Unauthorized';
  return 'AuthServiceUnavailable';
}

function throwMappedSsoError(
  status: number,
  message: string,
  errorCode: string,
): never {
  const body = { statusCode: status, error: errorCode, message };
  switch (status) {
    case 400:
      throw new BadRequestException(body);
    case 401:
      throw new UnauthorizedException(body);
    case 409:
      throw new ConflictException(body);
    case 502:
      throw new BadGatewayException(body);
    case 503:
      throw new ServiceUnavailableException(body);
    default:
      if (status >= 500) {
        throw new BadGatewayException({
          statusCode: 502,
          error: 'AuthServiceUnavailable',
          message: message || 'Authentication service unavailable',
        });
      }
      throw new HttpException(body, status);
  }
}

export type SsoErrorContext =
  | 'login'
  | 'refresh'
  | 'otp'
  | 'signup'
  | 'generic';

export function mapSsoAxiosError(
  err: unknown,
  context: SsoErrorContext = 'generic',
): never {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      throw new BadGatewayException({
        statusCode: 502,
        error: 'AuthServiceUnavailable',
        message: 'Authentication service unavailable',
      });
    }
    const status = err.response.status;
    const message =
      extractSsoMessage(err.response.data) ??
      (context === 'login'
        ? 'Invalid username or password'
        : context === 'refresh'
          ? 'Session expired. Sign in again.'
          : context === 'otp'
            ? 'Invalid or expired verification code'
            : context === 'signup'
              ? 'Account could not be created'
              : 'Authentication request failed');

    const errorCode = inferAuthErrorCode(status, message, context);

    if (context === 'login' && status === 401) {
      throwMappedSsoError(
        401,
        'Invalid username or password',
        'InvalidCredentials',
      );
    }
    if (context === 'refresh' && status === 401) {
      throwMappedSsoError(
        401,
        'Session expired. Sign in again.',
        'InvalidToken',
      );
    }
    if (context === 'otp' && (status === 400 || status === 401)) {
      throwMappedSsoError(
        400,
        'Invalid or expired verification code',
        'InvalidOtp',
      );
    }
    if (context === 'signup' && status === 409) {
      throwMappedSsoError(409, 'Account already exists', 'Conflict');
    }

    throwMappedSsoError(status, message, errorCode);
  }

  if (err instanceof HttpException) {
    throw err;
  }

  throw new BadGatewayException({
    statusCode: 502,
    error: 'AuthServiceUnavailable',
    message: 'Authentication service unavailable',
  });
}

export async function withSsoErrorMapping<T>(
  fn: () => Promise<T>,
  context: SsoErrorContext = 'generic',
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    mapSsoAxiosError(err, context);
  }
}

export class AuthServiceUnavailableException extends ServiceUnavailableException {
  constructor(message = 'Authentication service is not configured') {
    super({
      statusCode: 503,
      error: 'AuthServiceUnavailable',
      message,
    });
  }
}

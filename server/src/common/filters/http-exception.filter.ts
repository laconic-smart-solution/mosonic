import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { MulterError } from 'multer';

export type ApiErrorBody = {
  statusCode: number;
  error: string;
  message: string | string[];
  [key: string]: unknown;
};

const GENERIC_INTERNAL_MESSAGE = 'Something went wrong. Please try again.';

function httpStatusToErrorCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'ValidationFailed';
    case HttpStatus.UNAUTHORIZED:
      return 'Unauthorized';
    case HttpStatus.FORBIDDEN:
      return 'Forbidden';
    case HttpStatus.NOT_FOUND:
      return 'NotFound';
    case HttpStatus.CONFLICT:
      return 'Conflict';
    case HttpStatus.PAYMENT_REQUIRED:
      return 'InsufficientCredits';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'PayloadTooLarge';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'ValidationFailed';
    case HttpStatus.BAD_GATEWAY:
      return 'AuthServiceUnavailable';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'AuthServiceUnavailable';
    default:
      return status >= 500 ? 'InternalError' : 'HttpError';
  }
}

function normalizeMessage(message: unknown): string | string[] {
  if (typeof message === 'string' && message.trim()) {
    return message;
  }
  if (Array.isArray(message)) {
    const parts = message.filter(
      (m): m is string => typeof m === 'string' && m.trim().length > 0,
    );
    if (parts.length > 0) return parts;
  }
  return GENERIC_INTERNAL_MESSAGE;
}

function bodyFromHttpException(exception: HttpException): ApiErrorBody {
  const status = exception.getStatus();
  const raw = exception.getResponse();
  if (typeof raw === 'string') {
    return {
      statusCode: status,
      error: httpStatusToErrorCode(status),
      message: raw,
    };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const error =
      typeof obj.error === 'string' && obj.error.trim()
        ? obj.error
        : httpStatusToErrorCode(status);
    const message = normalizeMessage(obj.message ?? exception.message);
    const { statusCode: _sc, error: _e, message: _m, ...rest } = obj;
    return {
      statusCode: status,
      error,
      message,
      ...rest,
    };
  }
  return {
    statusCode: status,
    error: httpStatusToErrorCode(status),
    message: exception.message || GENERIC_INTERNAL_MESSAGE,
  };
}

function bodyFromPrismaError(err: Prisma.PrismaClientKnownRequestError): ApiErrorBody {
  if (err.code === 'P2025') {
    return {
      statusCode: HttpStatus.NOT_FOUND,
      error: 'NotFound',
      message: 'Resource not found',
    };
  }
  if (err.code === 'P2002') {
    return {
      statusCode: HttpStatus.CONFLICT,
      error: 'Conflict',
      message: 'A record with this value already exists',
    };
  }
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    error: 'InternalError',
    message: GENERIC_INTERNAL_MESSAGE,
  };
}

function bodyFromMulterError(exception: MulterError): ApiErrorBody {
  if (exception.code === 'LIMIT_FILE_SIZE') {
    return {
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      error: 'PayloadTooLarge',
      message:
        'One or more files exceed the maximum upload size. Reduce file size or try again.',
    };
  }
  return {
    statusCode: HttpStatus.BAD_REQUEST,
    error: 'ValidationFailed',
    message: exception.message || 'Upload rejected',
  };
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let body: ApiErrorBody;

    if (exception instanceof HttpException) {
      body = bodyFromHttpException(exception);
    } else if (exception instanceof MulterError) {
      body = bodyFromMulterError(exception);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      body = bodyFromPrismaError(exception);
      this.logger.warn(
        `Prisma ${exception.code} on ${request.method} ${request.url}`,
      );
    } else {
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'InternalError',
        message: GENERIC_INTERNAL_MESSAGE,
      };
    }

    if (!response.headersSent) {
      response.status(body.statusCode).json(body);
    }
  }
}

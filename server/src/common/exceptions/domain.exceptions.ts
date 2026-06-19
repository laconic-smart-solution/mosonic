import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export class ResourceNotFoundException extends NotFoundException {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} ${id} not found`
      : `${resource} not found`;
    super({
      statusCode: 404,
      error: 'NotFound',
      message,
    });
  }
}

export class TenancyForbiddenException extends ForbiddenException {
  constructor(message = 'You do not have permission to access this resource') {
    super({
      statusCode: 403,
      error: 'Forbidden',
      message,
    });
  }
}

export class DomainValidationException extends BadRequestException {
  constructor(message: string | string[]) {
    super({
      statusCode: 400,
      error: 'ValidationFailed',
      message,
    });
  }
}

import { HttpException, HttpStatus } from '@nestjs/common';

export type InsufficientCreditsPayload = {
  requiredCredits: number;
  creditsRemaining: number;
};

/** Thrown when a user lacks the credits required to start a workflow run (HTTP 402). */
export class InsufficientCreditsException extends HttpException {
  constructor(payload: InsufficientCreditsPayload) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'InsufficientCredits',
        message: 'Not enough credits to run this workflow',
        ...payload,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

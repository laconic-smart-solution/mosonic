import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { HeygenWebhookService } from '../orchestration/heygen-webhook.service';
import { WebhookService } from './webhook.service';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly heygenWebhook: HeygenWebhookService,
  ) {}

  @Post('zernio')
  @HttpCode(200)
  handleZernio(
    @Headers('x-zernio-signature') signature: string | undefined,
    @Headers('x-zernio-event-id') eventId: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): { received: boolean } {
    const rawBody = req.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      throw new BadRequestException(
        'Raw body required for webhook verification',
      );
    }
    this.webhookService.verifySignature(signature, rawBody);
    const id = eventId?.trim();
    if (!id) {
      throw new BadRequestException('Missing x-zernio-event-id');
    }
    void this.webhookService.handleEvent(id, rawBody).catch((err: unknown) => {
      this.logger.error(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
    });
    return { received: true };
  }

  @Post('heygen')
  @HttpCode(200)
  async handleHeygen(
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: boolean }> {
    return this.heygenWebhook.handlePayload(body ?? {});
  }
}

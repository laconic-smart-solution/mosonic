import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { CreditService } from './credit.service';
import { PaymentStatusDto } from './dto/payment-status.dto';
import { PaymentWebhookService } from './payment-webhook.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('webhook')
@ApiTags('Webhook')
export class PaymentWebhookController {
  constructor(
    private readonly paymentWebhookService: PaymentWebhookService,
    private readonly config: ConfigService,
  ) {}

  @Post('payment-status')
  @UsePipes(bodyPipe)
  async handlePaymentStatus(
    @Body() body: PaymentStatusDto,
    @Headers('x-payni-webhook-secret') webhookSecret?: string,
  ): Promise<{ ok: true }> {
    const configured = this.config.get<string>('PAYNI_WEBHOOK_SECRET')?.trim();
    if (configured && configured !== (webhookSecret ?? '').trim()) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    await this.paymentWebhookService.handlePaymentStatus(body);
    return { ok: true };
  }
}

import { Module } from '@nestjs/common';
import { PaymentClientService } from './payment-client.service';
import { PaymentService } from './payment.service';

@Module({
  providers: [PaymentClientService, PaymentService],
  exports: [PaymentService, PaymentClientService],
})
export class PaymentModule {}

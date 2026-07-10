import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentModule } from '../payment/payment.module';
import { PayniService } from './payni.service';

@Module({
  imports: [ConfigModule, PaymentModule],
  providers: [PayniService],
  exports: [PayniService],
})
export class PayniModule {}

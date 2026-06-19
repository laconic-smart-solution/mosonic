import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PayniService } from './payni.service';

@Module({
  imports: [ConfigModule],
  providers: [PayniService],
  exports: [PayniService],
})
export class PayniModule {}

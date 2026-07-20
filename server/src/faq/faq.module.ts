import { Module } from '@nestjs/common';
import { FaqClientService } from './faq-client.service';
import { PublicFaqController } from './public-faq.controller';
import { FaqService } from './public-faq.service';

@Module({
  controllers: [PublicFaqController],
  providers: [FaqClientService, FaqService],
  exports: [FaqClientService, FaqService],
})
export class FaqModule {}

import { Module } from '@nestjs/common';
import { LineController } from './line.controller';
import { LineWebhookController } from './line-webhook.controller';
import { LineService } from './line.service';

@Module({
  controllers: [LineController, LineWebhookController],
  providers: [LineService],
  exports: [LineService],
})
export class LineModule {}

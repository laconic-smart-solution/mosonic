import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { LineConnectCodeService } from './line-connect-code.service';
import { LineConnectionService } from './line-connection.service';
import { LineController } from './line.controller';
import { LineNotifyService } from './line-notify.service';
import { LineWebhookController } from './line-webhook.controller';
import { LineService } from './line.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LineController, LineWebhookController],
  providers: [
    LineService,
    LineConnectCodeService,
    LineConnectionService,
    LineNotifyService,
  ],
  exports: [LineService, LineConnectionService, LineNotifyService],
})
export class LineModule {}

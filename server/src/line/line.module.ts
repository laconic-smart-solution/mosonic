import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { LineConnectCodeService } from './line-connect-code.service';
import { LineConnectionService } from './line-connection.service';
import { LineController } from './line.controller';
import { LineWebhookController } from './line-webhook.controller';
import { LineService } from './line.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LineController, LineWebhookController],
  providers: [LineService, LineConnectCodeService, LineConnectionService],
  exports: [LineService, LineConnectionService],
})
export class LineModule {}

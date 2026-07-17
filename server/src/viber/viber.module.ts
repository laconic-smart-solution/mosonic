import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ViberConnectCodeService } from './viber-connect-code.service';
import { ViberConnectionService } from './viber-connection.service';
import { ViberController } from './viber.controller';
import { ViberNotifyService } from './viber-notify.service';
import { ViberWebhookController } from './viber-webhook.controller';
import { ViberService } from './viber.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ViberController, ViberWebhookController],
  providers: [
    ViberService,
    ViberConnectCodeService,
    ViberConnectionService,
    ViberNotifyService,
  ],
  exports: [ViberService, ViberConnectionService, ViberNotifyService],
})
export class ViberModule {}

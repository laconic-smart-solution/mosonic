import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { WhatsAppConnectCodeService } from './whatsapp-connect-code.service';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppNotifyService } from './whatsapp-notify.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [
    WhatsAppService,
    WhatsAppConnectCodeService,
    WhatsAppConnectionService,
    WhatsAppNotifyService,
  ],
  exports: [WhatsAppService, WhatsAppConnectionService, WhatsAppNotifyService],
})
export class WhatsAppModule {}

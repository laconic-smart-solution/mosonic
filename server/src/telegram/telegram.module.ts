import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TelegramConnectCodeService } from './telegram-connect-code.service';
import { TelegramConnectionService } from './telegram-connection.service';
import { TelegramController } from './telegram.controller';
import { TelegramNotifyService } from './telegram-notify.service';
import { TelegramPollingService } from './telegram-polling.service';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TelegramController, TelegramWebhookController],
  providers: [
    TelegramService,
    TelegramConnectCodeService,
    TelegramConnectionService,
    TelegramNotifyService,
    TelegramPollingService,
  ],
  exports: [TelegramService, TelegramConnectionService, TelegramNotifyService],
})
export class TelegramModule {}

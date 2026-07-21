import { Module } from '@nestjs/common';
import { LineModule } from '../line/line.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ViberModule } from '../viber/viber.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { WechatModule } from '../wechat/wechat.module';
import { CommsNotifyService } from './comms-notify.service';

@Module({
  imports: [
    LineModule,
    TelegramModule,
    ViberModule,
    WhatsAppModule,
    WechatModule,
  ],
  providers: [CommsNotifyService],
  exports: [CommsNotifyService],
})
export class CommsModule {}

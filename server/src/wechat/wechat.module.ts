import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { WechatConnectCodeService } from './wechat-connect-code.service';
import { WechatConnectionService } from './wechat-connection.service';
import { WechatController } from './wechat.controller';
import { WechatNotifyService } from './wechat-notify.service';
import { WechatWebhookController } from './wechat-webhook.controller';
import { WechatService } from './wechat.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WechatController, WechatWebhookController],
  providers: [
    WechatService,
    WechatConnectCodeService,
    WechatConnectionService,
    WechatNotifyService,
  ],
  exports: [WechatService, WechatConnectionService, WechatNotifyService],
})
export class WechatModule {}

import { Module } from '@nestjs/common';
import { LineModule } from '../line/line.module';
import { TelegramModule } from '../telegram/telegram.module';
import { CommsNotifyService } from './comms-notify.service';

@Module({
  imports: [LineModule, TelegramModule],
  providers: [CommsNotifyService],
  exports: [CommsNotifyService],
})
export class CommsModule {}

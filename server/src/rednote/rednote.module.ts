import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { UsersModule } from '../users/users.module';
import { RedNoteAdapter } from './adapters/rednote.adapter';
import { RedNoteCookieCryptoService } from './crypto/rednote-cookie-crypto.service';
import { RedNoteBrowserService } from './rednote-browser.service';
import { RedNoteController } from './rednote.controller';
import {
  REDNOTE_LOGIN_QUEUE,
  REDNOTE_PUBLISH_QUEUE,
} from './rednote.constants';
import { RedNoteGateway } from './rednote.gateway';
import { RedNoteHealthcheckCron } from './rednote-healthcheck.cron';
import { RedNoteLockService } from './rednote-lock.service';
import { RedNoteService } from './rednote.service';
import { RedNoteLoginProcessor } from './workers/rednote-login.processor';
import { RedNotePublishProcessor } from './workers/rednote-publish.processor';

const runWorkersInApi = process.env.RUN_WORKERS_IN_API !== 'false';

@Module({
  imports: [
    UsersModule,
    AuthModule,
    CreditModule,
    RepositoriesModule,
    BullModule.registerQueue(
      { name: REDNOTE_LOGIN_QUEUE },
      { name: REDNOTE_PUBLISH_QUEUE },
    ),
  ],
  controllers: [RedNoteController],
  providers: [
    RedNoteService,
    RedNoteAdapter,
    RedNoteCookieCryptoService,
    RedNoteBrowserService,
    RedNoteLockService,
    RedNoteGateway,
    RedNoteHealthcheckCron,
    ...(runWorkersInApi
      ? [RedNoteLoginProcessor, RedNotePublishProcessor]
      : []),
  ],
  exports: [RedNoteService, RedNoteAdapter],
})
export class RedNoteModule {}

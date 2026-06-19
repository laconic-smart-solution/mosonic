import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import { EventsModule } from '../events/events.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { UploadModule } from '../upload/upload.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ContentController } from './content.controller';
import { FileProxyController } from './file-proxy.controller';
import { FileProxyService } from './file-proxy.service';
import { ImageFileController } from './image-file.controller';
import { ImageFileService } from './image-file.service';
import { ContentService } from './content.service';

@Module({
  imports: [
    AuthModule,
    CreditModule,
    EventsModule,
    ConfigModule,
    RepositoriesModule,
    forwardRef(() => OrchestrationModule),
    forwardRef(() => UploadModule),
    WorkflowModule,
  ],
  controllers: [
    ContentController,
    FileProxyController,
    ImageFileController,
  ],
  providers: [
    ContentService,
    FileProxyService,
    ImageFileService,
  ],
  exports: [ContentService],
})
export class ContentModule {}

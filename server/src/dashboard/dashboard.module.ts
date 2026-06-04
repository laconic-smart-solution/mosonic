import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuthModule } from '../auth/auth.module';
import { Content, ContentSchema } from '../content/schemas/content.schema';
import { Upload, UploadSchema } from '../upload/schemas/upload.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    AuthModule,
    AnalyticsModule,
    MongooseModule.forFeature([
      { name: Content.name, schema: ContentSchema },
      { name: Upload.name, schema: UploadSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}


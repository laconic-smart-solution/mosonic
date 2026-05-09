import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { McpModule } from '../mcp/mcp.module';
import { Upload, UploadSchema } from './schemas/upload.schema';
import { UploadController } from './upload.controller';
import { UploadMediaController } from './upload-media.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [
    ConfigModule,
    McpModule,
    MongooseModule.forFeature([{ name: Upload.name, schema: UploadSchema }]),
  ],
  controllers: [UploadMediaController, UploadController],
  providers: [UploadService],
  exports: [MongooseModule, UploadService],
})
export class UploadModule {}

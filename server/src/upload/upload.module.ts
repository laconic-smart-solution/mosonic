import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Upload, UploadSchema } from './schemas/upload.schema';
import { UploadMediaController } from './upload-media.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: Upload.name, schema: UploadSchema }]),
  ],
  controllers: [UploadMediaController],
  providers: [UploadService],
  exports: [MongooseModule, UploadService],
})
export class UploadModule {}

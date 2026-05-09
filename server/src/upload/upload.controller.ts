import { Controller, Get, Param, Post } from '@nestjs/common';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Get(':uploadId')
  async getById(@Param('uploadId') uploadId: string) {
    return await this.uploadService.findByUploadId(uploadId);
  }

  @Post(':uploadId/publish')
  async publish(@Param('uploadId') uploadId: string) {
    return await this.uploadService.publishUpload(uploadId);
  }
}

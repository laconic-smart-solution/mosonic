import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { PatchUploadChannelBodyDto } from './dto/patch-upload-channel.dto';
import { PublishUploadDto } from './dto/publish-upload.dto';
import { UpdateUploadDto } from './dto/update-upload.dto';
import { UploadService } from './upload.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Get('by-content/:contentRef')
  async getIdByContentRef(
    @Req() req: Request,
    @Param('contentRef') contentRef: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return await this.uploadService.findUploadIdByContentRef(contentRef, auth);
  }

  @Patch(':uploadId/channels/:channel')
  @UsePipes(bodyPipe)
  async patchChannel(
    @Req() req: Request,
    @Param('uploadId') uploadId: string,
    @Param('channel') channel: string,
    @Body() body: PatchUploadChannelBodyDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return await this.uploadService.patchUploadChannel(
      uploadId,
      channel,
      body,
      auth,
    );
  }

  @Patch(':uploadId')
  @UsePipes(bodyPipe)
  async update(
    @Req() req: Request,
    @Param('uploadId') uploadId: string,
    @Body() body: UpdateUploadDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return await this.uploadService.updateUpload(uploadId, body, auth);
  }

  @Get(':uploadId')
  async getById(@Req() req: Request, @Param('uploadId') uploadId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return await this.uploadService.findByUploadId(uploadId, auth);
  }

  @Post(':uploadId/publish')
  @UsePipes(bodyPipe)
  async publish(
    @Req() req: Request,
    @Param('uploadId') uploadId: string,
    @Body() body: PublishUploadDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return await this.uploadService.publishUpload(uploadId, body, auth);
  }

  @Post(':uploadId/retry')
  async retry(@Req() req: Request, @Param('uploadId') uploadId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return await this.uploadService.retryUpload(uploadId, auth);
  }

  @Get(':uploadId/status')
  async getStatus(@Req() req: Request, @Param('uploadId') uploadId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return await this.uploadService.getUploadStatus(uploadId, auth);
  }
}

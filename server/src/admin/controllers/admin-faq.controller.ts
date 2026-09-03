import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
import type { User } from '../../users/schemas/user.schema';
import { AdminFaqAskDto } from '../dto/admin-faq.dto';
import { AdminFaqService } from '../services/admin-faq.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/faq')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminFaqController {
  constructor(private readonly service: AdminFaqService) {}

  @Get('documents')
  listDocuments(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.listDocuments({
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('documents/:documentId')
  getDocument(@Param('documentId') documentId: string) {
    return this.service.getDocument(documentId);
  }

  @Get('documents/:documentId/faqs')
  listDocumentFaqs(
    @Param('documentId') documentId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.service.listDocumentFaqs(documentId, {
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('documents/:documentId/download')
  async downloadDocument(
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    await this.service.downloadDocument(documentId, res);
  }

  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    const user = req.auth!.localUser as User;
    return this.service.uploadDocument({
      buffer: file.buffer,
      filename: file.originalname || 'document',
      mimeType: file.mimetype || 'application/octet-stream',
      createdBy: user.userId,
    });
  }

  @Get('faqs')
  listFaqs(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('q') q?: string,
    @Query('active_only') activeOnly = 'true',
  ) {
    return this.service.listFaqs({
      page: Number(page),
      limit: Number(limit),
      q,
      activeOnly: activeOnly !== 'false',
    });
  }

  @Post('ask')
  @UsePipes(bodyPipe)
  ask(@Body() body: AdminFaqAskDto) {
    return this.service.ask(body.question, body.topK);
  }
}

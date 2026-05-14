import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { ImageFileQueryDto } from './dto/image-file-query.dto';
import { FileProxyService } from './file-proxy.service';
import { ImageFileService } from './image-file.service';

const queryPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@ApiTags('Image files')
@Controller('api/v1/image')
export class ImageFileController {
  constructor(
    private readonly imageFileService: ImageFileService,
    private readonly fileProxyService: FileProxyService,
  ) {}

  @Post('file')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Upload image/binary to file-service (same pipeline as document upload; no DB row)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiQuery({
    name: 'folderPath',
    required: false,
    description: 'Optional subfolder under file-service storage root',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('folderPath') folderPath?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    return this.imageFileService.upload(file, folderPath);
  }

  @Get('file')
  @ApiOperation({
    summary: 'Download by stored relative path',
    description:
      'Query param `image` is the file-service `relativePath` from upload (e.g. UUID filename or `folder/uuid.ext`).',
  })
  @ApiQuery({
    name: 'image',
    required: true,
    description: 'File-service relativePath (not an arbitrary label)',
  })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'Binary file body' })
  @UsePipes(queryPipe)
  async downloadFile(
    @Query() query: ImageFileQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const proxied = await this.fileProxyService.fetchFile(query.image);
    if (proxied.status >= 200 && proxied.status < 300 && proxied.stream) {
      if (proxied.contentType) {
        res.setHeader('Content-Type', proxied.contentType);
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }
      if (proxied.contentLength) {
        res.setHeader('Content-Length', proxied.contentLength);
      }
      if (proxied.contentDisposition) {
        res.setHeader('Content-Disposition', proxied.contentDisposition);
      } else {
        const leaf = query.image.split('/').pop() || 'file';
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${leaf.replace(/"/g, '')}"`,
        );
      }
      proxied.stream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
      proxied.stream.pipe(res);
      return;
    }

    if (proxied.status === 404) {
      throw new NotFoundException('File not found');
    }
    if (proxied.status === 400) {
      throw new BadRequestException('Invalid path');
    }
    if (proxied.status >= 500) {
      throw new InternalServerErrorException('File service is unavailable');
    }
    throw new HttpException(
      `File proxy failed with status ${proxied.status}`,
      proxied.status,
    );
  }
}

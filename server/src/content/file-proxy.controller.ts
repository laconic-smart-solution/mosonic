import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  Query,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileProxyQueryDto } from './dto/file-proxy-query.dto';
import { FileProxyService } from './file-proxy.service';

@Controller('api/file/v1')
export class FileProxyController {
  constructor(private readonly fileProxyService: FileProxyService) {}

  @Get('file')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async getFile(
    @Query() query: FileProxyQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const proxied = await this.fileProxyService.fetchFile(query.relativePath);
    if (proxied.status >= 200 && proxied.status < 300 && proxied.stream) {
      if (proxied.contentType)
        res.setHeader('Content-Type', proxied.contentType);
      if (proxied.contentLength) {
        res.setHeader('Content-Length', proxied.contentLength);
      }
      if (proxied.contentDisposition) {
        res.setHeader('Content-Disposition', proxied.contentDisposition);
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
      throw new BadRequestException('Invalid relativePath');
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

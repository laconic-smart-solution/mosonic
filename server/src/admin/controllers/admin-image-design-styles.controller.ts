import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AdminGuard } from '../../auth/admin.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { UploadMediaService } from '../../upload/upload-media.service';
import {
  AdminCreateImageDesignStyleDto,
  AdminUpdateImageDesignStyleDto,
} from '../dto/admin-image-design-style.dto';
import { AdminImageDesignStylesService } from '../services/admin-image-design-styles.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const imageFileInterceptor = FileInterceptor('image', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/image-design-styles')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminImageDesignStylesController {
  constructor(
    private readonly styles: AdminImageDesignStylesService,
    private readonly uploadMedia: UploadMediaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all image design styles, including inactive' })
  list() {
    return this.styles.list();
  }

  @Post()
  @UseInterceptors(imageFileInterceptor)
  @UsePipes(bodyPipe)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create an image design style (optional "image" file field)',
  })
  async create(
    @Body() body: AdminCreateImageDesignStyleDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const imageUrl = file?.buffer?.length
      ? (await this.uploadMedia.uploadBuffer(file)).url
      : undefined;
    return this.styles.create({ ...body, imageUrl });
  }

  @Put(':id')
  @UseInterceptors(imageFileInterceptor)
  @UsePipes(bodyPipe)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Update an image design style (optional "image" file field — keeps the existing image when omitted)',
  })
  async update(
    @Param('id') id: string,
    @Body() body: AdminUpdateImageDesignStyleDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const imageUrl = file?.buffer?.length
      ? (await this.uploadMedia.uploadBuffer(file)).url
      : undefined;
    return this.styles.update(id, { ...body, imageUrl });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an image design style' })
  remove(@Param('id') id: string) {
    return this.styles.delete(id);
  }
}

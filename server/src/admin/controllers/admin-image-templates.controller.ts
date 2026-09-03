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
  AdminCreateImageTemplateDto,
  AdminUpdateImageTemplateDto,
} from '../dto/admin-image-template.dto';
import { AdminImageTemplatesService } from '../services/admin-image-templates.service';

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
@Controller('admin/image-templates')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminImageTemplatesController {
  constructor(
    private readonly templates: AdminImageTemplatesService,
    private readonly uploadMedia: UploadMediaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all image templates, including inactive' })
  list() {
    return this.templates.list();
  }

  @Post()
  @UseInterceptors(imageFileInterceptor)
  @UsePipes(bodyPipe)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create an image template (optional "image" file field)',
  })
  async create(
    @Body() body: AdminCreateImageTemplateDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const imageUrl = file?.buffer?.length
      ? (await this.uploadMedia.uploadBuffer(file)).url
      : undefined;
    return this.templates.create({ ...body, imageUrl });
  }

  @Put(':id')
  @UseInterceptors(imageFileInterceptor)
  @UsePipes(bodyPipe)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Update an image template (optional "image" file field — keeps the existing image when omitted)',
  })
  async update(
    @Param('id') id: string,
    @Body() body: AdminUpdateImageTemplateDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const imageUrl = file?.buffer?.length
      ? (await this.uploadMedia.uploadBuffer(file)).url
      : undefined;
    return this.templates.update(id, { ...body, imageUrl });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an image template' })
  remove(@Param('id') id: string) {
    return this.templates.delete(id);
  }
}

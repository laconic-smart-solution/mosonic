import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ContentPageQueryDto,
  ContentPageResponseDto,
} from './dto/content-page-query.dto';
import { RerunNodeDto } from './dto/rerun-node.dto';
import { SaveContentDto } from './dto/save-content.dto';
import { ContentService } from './content.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('contents')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post('pageable')
  @UsePipes(bodyPipe)
  async pageable(
    @Body() body: ContentPageQueryDto,
  ): Promise<ContentPageResponseDto> {
    const { data, total } = await this.contentService.findPage(body);
    const page = body.page ?? 1;
    const limit = body.limit ?? 10;
    const totalPages = Math.ceil(total / limit) || 0;
    return { data, meta: { total, page, limit, totalPages } };
  }

  @Post(':contentId/save')
  @UsePipes(bodyPipe)
  async saveContent(
    @Param('contentId') contentId: string,
    @Body() body: SaveContentDto,
  ) {
    return this.contentService.saveContent(contentId, body);
  }

  @Post(':contentId/rerun-node')
  @UsePipes(bodyPipe)
  async rerunNode(
    @Param('contentId') contentId: string,
    @Body() body: RerunNodeDto,
  ) {
    await this.contentService.scheduleRerun(contentId, body);
    return { success: true };
  }

  @Post(':contentId/approve')
  async approve(@Param('contentId') contentId: string) {
    return this.contentService.approveContent(contentId);
  }

  @Post(':contentId/reject')
  async reject(@Param('contentId') contentId: string) {
    return this.contentService.rejectContent(contentId);
  }

  @Get(':contentId')
  async getByContentId(@Param('contentId') contentId: string) {
    return this.contentService.getContentDetail(contentId);
  }
}

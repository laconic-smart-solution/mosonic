import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { BulkPostIdsDto } from './dto/bulk-post-ids.dto';
import { BulkSchedulePostsDto } from './dto/bulk-schedule-posts.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { PatchPostDto } from './dto/patch-post.dto';
import { PostService } from './post.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const queryPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Get()
  @UsePipes(queryPipe)
  async list(@Req() req: Request, @Query() query: ListPostsQueryDto) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.postService.listPosts(auth, query);
  }

  @Get('stats')
  async stats(@Req() req: Request) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.postService.getPostStats(auth);
  }

  @Post('bulk-cancel')
  @UsePipes(bodyPipe)
  async bulkCancel(@Req() req: Request, @Body() body: BulkPostIdsDto) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.postService.bulkCancelScheduled(body.postIds, auth);
  }

  @Post('bulk-delete')
  @UsePipes(bodyPipe)
  async bulkDelete(@Req() req: Request, @Body() body: BulkPostIdsDto) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.postService.bulkDeletePosts(body.postIds, auth);
  }

  @Post('bulk-publish')
  @UsePipes(bodyPipe)
  async bulkPublish(@Req() req: Request, @Body() body: BulkPostIdsDto) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.postService.bulkPublishNow(body.postIds, auth);
  }

  @Post('bulk-schedule')
  @UsePipes(bodyPipe)
  async bulkSchedule(@Req() req: Request, @Body() body: BulkSchedulePostsDto) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.postService.bulkSchedulePosts(
      body.postIds,
      body.scheduledAt,
      auth,
    );
  }

  @Get(':postId')
  async getOne(
    @Req() req: Request,
    @Param('postId') postId: string,
    @Query('hydrate') hydrate?: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.postService.getPostDetail(postId, auth, hydrate);
  }

  @Patch(':postId')
  @UsePipes(bodyPipe)
  async patch(
    @Req() req: Request,
    @Param('postId') postId: string,
    @Body() body: PatchPostDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.postService.patchPost(postId, body, auth);
  }

  @Post(':postId/publish')
  async publish(@Req() req: Request, @Param('postId') postId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.postService.publishPost(postId, auth);
  }

  @Post(':postId/retry')
  async retry(@Req() req: Request, @Param('postId') postId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.postService.retryPost(postId, auth);
  }

  @Post(':postId/analytics/sync')
  async syncAnalytics(@Req() req: Request, @Param('postId') postId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.postService.syncPostAnalytics(postId, auth);
  }

  @Delete(':postId')
  async remove(@Req() req: Request, @Param('postId') postId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.postService.deletePost(postId, auth);
  }
}

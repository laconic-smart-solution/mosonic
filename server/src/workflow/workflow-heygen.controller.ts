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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { WorkflowHeygenService } from './workflow-heygen.service';

@UseGuards(JwtAuthGuard)
@Controller('workflow')
export class WorkflowHeygenController {
  constructor(private readonly heygenWorkflow: WorkflowHeygenService) {}

  @Get('heygen/voices')
  listVoices(
    @Query('language') language?: string,
    @Query('gender') gender?: string,
    @Query('limit') limit?: string,
    @Query('token') token?: string,
  ) {
    const limitNum = limit ? Number(limit) : undefined;
    return this.heygenWorkflow.listVoicesPage({
      language,
      gender,
      limit: Number.isFinite(limitNum) ? limitNum : undefined,
      token,
    });
  }

  @Get('heygen/voices/:voiceId/preview')
  async voicePreview(
    @Param('voiceId') voiceId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, contentType } =
      await this.heygenWorkflow.streamVoicePreview(voiceId);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  }

  @Get('heygen/voices/:voiceId')
  getVoice(@Param('voiceId') voiceId: string) {
    return this.heygenWorkflow.getVoice(voiceId);
  }

  @Get('heygen/avatars')
  async listAvatars(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    res.setHeader('Cache-Control', 'no-store');
    return this.heygenWorkflow.listAvatarLooksForUser(auth.userId);
  }

  @Delete('heygen/avatars/:lookId')
  deleteAvatar(@Req() req: Request, @Param('lookId') lookId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.heygenWorkflow.deleteAvatarLookForUser(auth.userId, lookId);
  }

  @Post('heygen/upload-avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 32 * 1024 * 1024 },
    }),
  )
  uploadAvatarDraft(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.heygenWorkflow.uploadAvatarDraft(file, auth);
  }

  @Post('heygen/upload-background')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 32 * 1024 * 1024 },
    }),
  )
  uploadBackgroundDraft(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.heygenWorkflow.uploadBackgroundDraft(file);
  }

  @Patch(':workflowId/nodes/:nodeId/heygen/config')
  patchConfig(
    @Req() req: Request,
    @Param('workflowId') workflowId: string,
    @Param('nodeId') nodeId: string,
    @Body() body: { config?: Record<string, unknown> },
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    const patch = body?.config ?? {};
    return this.heygenWorkflow.patchVideoNodeConfig(
      workflowId,
      nodeId,
      patch,
      auth,
    );
  }

  @Post(':workflowId/nodes/:nodeId/heygen/upload-avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 32 * 1024 * 1024 },
    }),
  )
  uploadAvatar(
    @Req() req: Request,
    @Param('workflowId') workflowId: string,
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.heygenWorkflow.uploadAvatar(workflowId, nodeId, file, auth);
  }

  @Post(':workflowId/nodes/:nodeId/heygen/upload-background')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 32 * 1024 * 1024 },
    }),
  )
  uploadBackground(
    @Req() req: Request,
    @Param('workflowId') workflowId: string,
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.heygenWorkflow.uploadBackground(workflowId, nodeId, file, auth);
  }
}

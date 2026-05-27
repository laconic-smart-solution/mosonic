import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
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
  ) {
    return this.heygenWorkflow.listVoices({ language, gender });
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

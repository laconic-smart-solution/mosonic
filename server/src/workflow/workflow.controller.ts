import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import {
  GenerateWorkflowRequestDto,
  GenerateWorkflowResponseDto,
  RegenerateWorkflowByRuleRequestDto,
  RegenerateWorkflowByRuleResponseDto,
} from './dto/generate-workflow.dto';
import {
  SaveWorkflowNodesRequestDto,
  SaveWorkflowNodesResponseDto,
} from './dto/save-workflow-nodes.dto';
import {
  WorkflowPageQueryDto,
  WorkflowPageResponseDto,
} from './dto/workflow-page-query.dto';
import { WorkflowService } from './workflow.service';

@UseGuards(JwtAuthGuard)
@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post('generate')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  generate(
    @Req() req: Request,
    @Body() body: GenerateWorkflowRequestDto,
  ): Promise<GenerateWorkflowResponseDto> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.generateWorkflow(body, auth);
  }

  @Post('pageable')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  pageable(
    @Req() req: Request,
    @Body() body: WorkflowPageQueryDto,
  ): Promise<WorkflowPageResponseDto> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.findPage(body, auth).then(({ data, total }) => {
      const page = body.page ?? 1;
      const limit = body.limit ?? 10;
      const totalPages = Math.ceil(total / limit) || 0;
      return {
        data,
        meta: { total, page, limit, totalPages },
      };
    });
  }

  @Get('rule/:ruleId')
  getWorkflowByRuleId(@Req() req: Request, @Param('ruleId') ruleId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.getWorkflowByRuleId(ruleId, auth);
  }

  @Post('rule/:ruleId/regenerate')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  regenerateByRuleId(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
    @Body() body: RegenerateWorkflowByRuleRequestDto,
  ): Promise<RegenerateWorkflowByRuleResponseDto> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.regenerateWorkflowByRuleId(ruleId, body, auth);
  }

  @Get(':workflowId')
  getWorkflow(@Req() req: Request, @Param('workflowId') workflowId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.getWorkflow(workflowId, auth);
  }

  @Put(':workflowId/nodes')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  saveNodes(
    @Req() req: Request,
    @Param('workflowId') workflowId: string,
    @Body() body: SaveWorkflowNodesRequestDto,
  ): Promise<SaveWorkflowNodesResponseDto> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.saveNodes(workflowId, body, auth);
  }
}

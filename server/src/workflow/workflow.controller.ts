import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
  SaveWorkflowNodesByRuleRequestDto,
  SaveWorkflowNodesByRuleResponseDto,
  SaveWorkflowNodesRequestDto,
  SaveWorkflowNodesResponseDto,
} from './dto/save-workflow-nodes.dto';
import type { ApplyPipelineToWorkflowResponseDto } from './dto/apply-pipeline-to-workflow.dto';
import {
  WorkflowPageQueryDto,
  WorkflowPageResponseDto,
} from './dto/workflow-page-query.dto';
import {
  ApplyTemplateDto,
  SaveAsTemplateDto,
} from './dto/workflow-template.dto';
import {
  UpdateWorkflowDto,
  UpdateWorkflowResponseDto,
} from './dto/update-workflow.dto';
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

  @Get('templates')
  listTemplates(@Req() req: Request) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.listTemplates(auth);
  }

  @Post(':workflowId/save-as-template')
  saveAsTemplate(
    @Req() req: Request,
    @Param('workflowId') workflowId: string,
    @Body() body: SaveAsTemplateDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.saveAsTemplate(
      workflowId,
      body.templateName,
      auth,
    );
  }

  @Post('templates/:templateId/apply')
  applyTemplate(
    @Req() req: Request,
    @Param('templateId') templateId: string,
    @Body() body: ApplyTemplateDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.applyTemplate(templateId, body.ruleId, auth);
  }

  @Delete('templates/:templateId')
  archiveTemplate(
    @Req() req: Request,
    @Param('templateId') templateId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.archiveTemplate(templateId, auth);
  }

  @Get('rule/:ruleId')
  getWorkflowByRuleId(@Req() req: Request, @Param('ruleId') ruleId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.getWorkflowByRuleId(ruleId, auth);
  }

  @Post('rule/:ruleId/default-structure')
  applyDefaultStructure(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
  ): Promise<GenerateWorkflowResponseDto> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.applyDefaultWorkflowStructure(ruleId, auth);
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

  @Post('rule/:ruleId/apply-pipeline/:pipelineId')
  applyPipelineToWorkflow(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
    @Param('pipelineId') pipelineId: string,
  ): Promise<ApplyPipelineToWorkflowResponseDto> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.applyPipelineToWorkflow(
      ruleId,
      pipelineId,
      auth,
    );
  }

  @Put('rule/:ruleId/nodes')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  saveNodesByRuleId(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
    @Body() body: SaveWorkflowNodesByRuleRequestDto,
  ): Promise<SaveWorkflowNodesByRuleResponseDto> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.saveNodesForRule(ruleId, body, auth);
  }

  @Patch(':workflowId')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  updateWorkflow(
    @Req() req: Request,
    @Param('workflowId') workflowId: string,
    @Body() body: UpdateWorkflowDto,
  ): Promise<UpdateWorkflowResponseDto> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.workflowService.updateWorkflow(workflowId, body, auth);
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

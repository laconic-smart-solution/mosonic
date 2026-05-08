import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
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
import { WorkflowService } from './workflow.service';

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
    @Body() body: GenerateWorkflowRequestDto,
  ): Promise<GenerateWorkflowResponseDto> {
    return this.workflowService.generateWorkflow(body);
  }

  @Get('rule/:ruleId')
  getWorkflowByRuleId(@Param('ruleId') ruleId: string) {
    return this.workflowService.getWorkflowByRuleId(ruleId);
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
    @Param('ruleId') ruleId: string,
    @Body() body: RegenerateWorkflowByRuleRequestDto,
  ): Promise<RegenerateWorkflowByRuleResponseDto> {
    return this.workflowService.regenerateWorkflowByRuleId(ruleId, body);
  }

  @Get(':workflowId')
  getWorkflow(@Param('workflowId') workflowId: string) {
    return this.workflowService.getWorkflow(workflowId);
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
    @Param('workflowId') workflowId: string,
    @Body() body: SaveWorkflowNodesRequestDto,
  ): Promise<SaveWorkflowNodesResponseDto> {
    return this.workflowService.saveNodes(workflowId, body);
  }
}

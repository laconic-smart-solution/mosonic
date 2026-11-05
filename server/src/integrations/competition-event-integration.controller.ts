import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { ApiKeyOrJwtGuard } from './api-key-or-jwt.guard';
import { CompetitionEventIntegrationService } from './competition-event-integration.service';
import {
  GenerateCompetitionEventContentDto,
  GenerateCompetitionEventSocialContentDto,
  ProvisionCompetitionEventUserDto,
  SaveCompetitionEventContentDto,
} from './dto/competition-event-integration.dto';
import { UsersService } from '../users/users.service';
const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

/** API key (`X-Api-Key` with `competition-event` scope) or JWT. */
@UseGuards(ApiKeyOrJwtGuard)
@Controller('integrations/v1/competition-event')
export class CompetitionEventIntegrationController {
  private readonly logger = new Logger(CompetitionEventIntegrationController.name);

  constructor(
    private readonly competitionEvent: CompetitionEventIntegrationService,
    private readonly users: UsersService,
  ) {}

  @Post('content/generate-from-prompt')
  @UsePipes(bodyPipe)
  generateFromPrompt(
    @Req() req: Request,
    @Body() body: GenerateCompetitionEventContentDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    this.logger.log(`POST content/generate-from-prompt for user=${auth.userId}, externalRef=${body.externalRef}`);
    return this.competitionEvent.generateFromPrompt(body, auth);
  }

  @Post('social-content/generate')
  @UsePipes(bodyPipe)
  generateSocialContent(
    @Req() req: Request,
    @Body() body: GenerateCompetitionEventSocialContentDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    this.logger.log(`POST social-content/generate for user=${auth.userId}, ruleId=${body.ruleId}, externalRef=${body.externalRef}`);
    return this.competitionEvent.generateSocialContent(body, auth);
  }

  @Get('social-content/:pipelineId')
  getSocialContent(
    @Req() req: Request,
    @Param('pipelineId') pipelineId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    this.logger.log(`GET social-content/${pipelineId} for user=${auth.userId}`);
    return this.competitionEvent.getSocialContent(pipelineId, auth);
  }

  @Post('users/provision')
  @UsePipes(bodyPipe)
  async provisionUser(@Body() body: ProvisionCompetitionEventUserDto) {
    const provisioned = await this.users.provisionForCompetitionEvent({
      name: body.name,
      email: body.email,
      username: body.username,
      authServerUserId: body.authServerUserId,
    });
    const name =
      [provisioned.firstName, provisioned.lastName].filter(Boolean).join(' ') ||
      body.name.trim();

    return {
      userId: provisioned.userId,
      email: provisioned.email ?? null,
      username: provisioned.username ?? null,
      name,
    };
  }

  @Post('contents/:contentId/save')
  @UsePipes(bodyPipe)
  saveBundle(
    @Req() req: Request,
    @Param('contentId') contentId: string,
    @Body() body: SaveCompetitionEventContentDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.competitionEvent.saveBundle(contentId, body, auth);
  }

  @Get('content/by-external-ref/:externalRef')
  getByExternalRef(
    @Req() req: Request,
    @Param('externalRef') externalRef: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.competitionEvent.getByExternalRef(
      decodeURIComponent(externalRef),
      auth,
    );
  }
}

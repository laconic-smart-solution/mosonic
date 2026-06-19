import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import {
  CreateApiKeyDto,
  StartPipelineIntegrationDto,
  SubscribeWebhookDto,
} from './dto/integrations.dto';
import { IntegrationsService } from './integrations.service';

@Controller('integrations/v1')
export class IntegrationsV1Controller {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post('pipelines/start')
  startPipeline(
    @Headers('x-api-key') apiKey: string | undefined,
    @Body() body: StartPipelineIntegrationDto,
  ) {
    if (!apiKey?.trim()) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'ValidationFailed',
        message: 'X-API-Key header required',
      });
    }
    return this.integrations.startPipelineViaApiKey(apiKey, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('webhooks/subscribe')
  subscribe(
    @Req() req: Request,
    @Body() body: SubscribeWebhookDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.integrations.subscribeWebhook(auth, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api-keys')
  createKey(
    @Req() req: Request,
    @Body() body: CreateApiKeyDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.integrations.createApiKey(auth.userId, body.name, body.scopes);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminGuard } from '../../auth/admin.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import {
  API_PROVIDERS,
  type ApiProviderId,
} from '../../api-usage/api-provider.types';
import { ApiUsageService } from '../../api-usage/api-usage.service';
import { parseSpendDateRange } from '../../api-usage/cost-spend.util';
import { User } from '../../users/schemas/user.schema';
import { UpdateOpenAiPrepaidDto } from '../dto/update-openai-prepaid.dto';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function parseProvider(provider: string): ApiProviderId {
  if ((API_PROVIDERS as readonly string[]).includes(provider)) {
    return provider as ApiProviderId;
  }
  throw new BadRequestException(
    `Invalid provider. Expected one of: ${API_PROVIDERS.join(', ')}`,
  );
}

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/api-usage')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminApiUsageController {
  constructor(private readonly apiUsage: ApiUsageService) {}

  @Get()
  getAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('days') days?: string,
  ) {
    const fallbackDays = days
      ? Math.min(365, Math.max(7, Number(days) || 180))
      : 180;
    const range = parseSpendDateRange(from, to, fallbackDays);
    return this.apiUsage.getAllSummaries(range);
  }

  @Put(':provider/prepaid')
  @UsePipes(bodyPipe)
  updatePrepaid(
    @Param('provider') providerParam: string,
    @Body() body: UpdateOpenAiPrepaidDto,
    @Req() req: Request,
  ) {
    const provider = parseProvider(providerParam);
    const userId = (req.auth!.localUser as User).userId;
    return this.apiUsage.updatePrepaid(provider, body.prepaidCreditUsd, userId);
  }
}

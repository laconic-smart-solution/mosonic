import {
  Body,
  Controller,
  Get,
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
import { OpenAiBillingService } from '../../openai-billing/openai-billing.service';
import { User } from '../../users/schemas/user.schema';
import { UpdateOpenAiPrepaidDto } from '../dto/update-openai-prepaid.dto';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/openai')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminOpenAiBillingController {
  constructor(private readonly billing: OpenAiBillingService) {}

  @Get('billing')
  getBilling(@Query('days') days?: string) {
    const spendDays = days ? Math.min(365, Math.max(7, Number(days) || 180)) : 180;
    return this.billing.getSummary(spendDays);
  }

  @Put('billing/prepaid')
  @UsePipes(bodyPipe)
  updatePrepaid(@Body() body: UpdateOpenAiPrepaidDto, @Req() req: Request) {
    const userId = (req.auth!.localUser as User).userId;
    return this.billing.updatePrepaidCreditUsd(body.prepaidCreditUsd, userId);
  }
}

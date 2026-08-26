import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { CreditCalculationService } from './credit-calculation.service';
import { CreditConfigService } from './credit-config.service';
import { UpdateCreditConfigDto } from './dto/update-credit-config.dto';
import { FixedCostService } from './fixed-cost.service';
import { ServiceRateService } from './service-rate.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/credit')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class CreditConfigController {
  constructor(
    private readonly configService: CreditConfigService,
    private readonly calculation: CreditCalculationService,
    private readonly fixedCostService: FixedCostService,
    private readonly serviceRateService: ServiceRateService,
  ) {}

  @Get('config')
  getConfig() {
    return this.configService.getConfig();
  }

  @Put('config')
  @UsePipes(bodyPipe)
  updateConfig(@Body() body: UpdateCreditConfigDto, @Req() req: Request) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.configService.updateConfig(body, auth.userId);
  }

  @Get('config/history')
  getHistory(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.configService.getConfigHistory(Number(page), Number(limit));
  }

  @Post('recalculate-overhead')
  async recalculateOverhead() {
    await this.configService.recalculateOverheadFactor();
    return this.configService.getConfig();
  }

  @Get('fixed-costs')
  listFixedCosts() {
    return this.fixedCostService.list();
  }

  @Post('fixed-costs')
  @UsePipes(bodyPipe)
  createFixedCost(@Body() body: { name: string; amountUsd: number }) {
    return this.fixedCostService.create(body);
  }

  @Put('fixed-costs/:id')
  @UsePipes(bodyPipe)
  updateFixedCost(
    @Param('id') id: string,
    @Body() body: { name?: string; amountUsd?: number; isActive?: boolean },
  ) {
    return this.fixedCostService.update(id, body);
  }

  @Delete('fixed-costs/:id')
  deleteFixedCost(@Param('id') id: string) {
    return this.fixedCostService.softDelete(id);
  }

  @Get('service-rates')
  listServiceRates() {
    return this.serviceRateService.list();
  }

  @Post('service-rates')
  @UsePipes(bodyPipe)
  createServiceRate(
    @Body()
    body: {
      serviceType: 'text' | 'image' | 'video';
      provider: string;
      model: string;
      avgPricePerCall?: number;
      pricePerImage?: number;
      pricePerSecond?: number;
    },
  ) {
    return this.serviceRateService.create(body);
  }

  @Put('service-rates/:id')
  @UsePipes(bodyPipe)
  updateServiceRate(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      provider: string;
      model: string;
      avgPricePerCall: number;
      pricePerImage: number;
      pricePerSecond: number;
      isActive: boolean;
    }>,
  ) {
    return this.serviceRateService.update(id, body);
  }

  @Delete('service-rates/:id')
  deleteServiceRate(@Param('id') id: string) {
    return this.serviceRateService.softDelete(id);
  }

  @Post('preview')
  @UsePipes(bodyPipe)
  preview(
    @Body()
    body: {
      nodes: Array<{
        serviceType: 'text' | 'image' | 'video';
        model: string;
        provider?: string;
        count?: number;
        durationSec?: number;
      }>;
    },
  ) {
    return this.calculation.previewWorkflow(body.nodes ?? []);
  }
}

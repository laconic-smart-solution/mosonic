import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateLlmTokenRateDto } from './dto/update-llm-token-rate.dto';
import { LlmTokenRateService } from './llm-token-rate.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/token-rates')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminLlmTokenRateController {
  constructor(private readonly tokenRates: LlmTokenRateService) {}

  @Get()
  list() {
    return this.tokenRates.listForAdmin();
  }

  @Put(':model')
  @UsePipes(bodyPipe)
  update(@Param('model') model: string, @Body() body: UpdateLlmTokenRateDto) {
    return this.tokenRates.update({
      model,
      provider: body.provider,
      inputPerMToken: body.inputPerMToken,
      outputPerMToken: body.outputPerMToken,
      reasoningPerMToken: body.reasoningPerMToken,
    });
  }
}

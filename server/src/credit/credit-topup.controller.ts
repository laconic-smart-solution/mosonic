import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { CreditService } from './credit.service';
import { TopupCreditsDto } from './dto/topup-credits.dto';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard)
@Controller('credit')
@ApiTags('Credit')
@ApiBearerAuth('bearer')
export class CreditTopupController {
  constructor(private readonly creditService: CreditService) {}

  @Get('packages')
  getPackages() {
    return this.creditService.getPackages();
  }

  @Post('topup')
  @UsePipes(bodyPipe)
  topup(@Body() body: TopupCreditsDto, @Req() req: Request) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.creditService.topup(auth.userId, body.packageId);
  }
}

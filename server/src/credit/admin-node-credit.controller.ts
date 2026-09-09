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
import { UpdateNodeCreditPriceDto } from './dto/update-node-credit-price.dto';
import { NodeCreditPriceService } from './node-credit-price.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/node-credits')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminNodeCreditController {
  constructor(
    private readonly nodeCreditPriceService: NodeCreditPriceService,
  ) {}

  @Get()
  list() {
    return this.nodeCreditPriceService.listForAdmin();
  }

  @Put(':nodeType')
  @UsePipes(bodyPipe)
  update(
    @Param('nodeType') nodeType: string,
    @Body() body: UpdateNodeCreditPriceDto,
  ) {
    return this.nodeCreditPriceService.update(nodeType, body.costUsd);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { CreateRuleAssetDto } from './dto/create-rule-asset.dto';
import { RuleAssetService } from './rule-asset.service';

const MAX_RULE_ASSET_BYTES = 20 * 1024 * 1024; // 20MB

@UseGuards(JwtAuthGuard)
@Controller('rules/:ruleId/assets')
export class RuleAssetController {
  constructor(private readonly ruleAssetService: RuleAssetService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_RULE_ASSET_BYTES },
    }),
  )
  async upload(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
    @Body() body: CreateRuleAssetDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.ruleAssetService.upload(ruleId, body.type, file, auth);
  }

  @Get()
  async list(@Req() req: Request, @Param('ruleId') ruleId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.ruleAssetService.listByRule(ruleId, auth);
  }

  @Delete(':ruleAssetId')
  async remove(
    @Req() req: Request,
    @Param('ruleAssetId') ruleAssetId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    await this.ruleAssetService.delete(ruleAssetId, auth);
    return { success: true };
  }
}

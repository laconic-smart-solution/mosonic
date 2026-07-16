import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FaqAskDto } from './dto/faq-ask.dto';
import { FaqService } from './public-faq.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('faq')
@ApiTags('FAQ')
export class PublicFaqController {
  constructor(private readonly service: FaqService) {}

  @Get('faqs')
  listFaqs(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('q') q?: string,
    @Query('active_only') activeOnly = 'true',
  ) {
    return this.service.listFaqs({
      page: Number(page),
      limit: Number(limit),
      q,
      activeOnly: activeOnly !== 'false',
    });
  }

  @Post('ask')
  @UsePipes(bodyPipe)
  ask(@Body() body: FaqAskDto) {
    return this.service.ask(body.question, body.topK);
  }
}

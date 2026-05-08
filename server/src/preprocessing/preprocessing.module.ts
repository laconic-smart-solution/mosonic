import { Global, Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { ContentReaderService } from './content-reader.service';
import { DocxHandler } from './handlers/docx.handler';
import { ImageHandler } from './handlers/image.handler';
import { PdfHandler } from './handlers/pdf.handler';
import { TextHandler } from './handlers/text.handler';
import { UrlHandler } from './handlers/url.handler';
import { PreprocessingService } from './preprocessing.service';

@Global()
@Module({
  imports: [LlmModule],
  providers: [
    TextHandler,
    DocxHandler,
    PdfHandler,
    ImageHandler,
    UrlHandler,
    PreprocessingService,
    ContentReaderService,
  ],
  exports: [PreprocessingService, ContentReaderService],
})
export class PreprocessingModule {}

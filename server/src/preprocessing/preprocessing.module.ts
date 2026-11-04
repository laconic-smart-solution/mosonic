import { Global, Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { ContentReaderService } from './content-reader.service';
import { DocxHandler } from './handlers/docx.handler';
import { ImageHandler } from './handlers/image.handler';
import { PdfHandler } from './handlers/pdf.handler';
import { TextHandler } from './handlers/text.handler';
import { UrlHandler } from './handlers/url.handler';
import { WebsiteAssetHandler } from './handlers/website-asset.handler';
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
    WebsiteAssetHandler,
    PreprocessingService,
    ContentReaderService,
  ],
  exports: [PreprocessingService, ContentReaderService, WebsiteAssetHandler],
})
export class PreprocessingModule {}

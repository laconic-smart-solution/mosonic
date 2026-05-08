import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggingService } from './logging.service';
import { PipelineLog, PipelineLogSchema } from './schemas/pipeline-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PipelineLog.name, schema: PipelineLogSchema },
    ]),
  ],
  providers: [LoggingService],
  exports: [MongooseModule, LoggingService],
})
export class LoggingModule {}

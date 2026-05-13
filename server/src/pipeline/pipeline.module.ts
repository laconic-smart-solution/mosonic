import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { Pipeline, PipelineSchema } from './schemas/pipeline.schema';

@Module({
  imports: [
    AuthModule,
    OrchestrationModule,
    MongooseModule.forFeature([
      { name: Pipeline.name, schema: PipelineSchema },
    ]),
  ],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [MongooseModule, PipelineService],
})
export class PipelineModule {}

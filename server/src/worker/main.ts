import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

/** Dedicated worker process always runs BullMQ processors. */
process.env.RUN_WORKERS_IN_API = 'true';

async function bootstrap(): Promise<void> {
  const logger = new Logger('PipelineWorker');
  await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log'],
  });
  logger.log('Pipeline worker started (BullMQ processors active)');
}

void bootstrap();

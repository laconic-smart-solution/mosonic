import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../database/database.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { EventsModule } from '../events/events.module';
import { NewsTriggerModule } from '../news-trigger/news-trigger.module';
import {
  buildRedisConnectionOptions,
  redisEnvFromProcess,
} from '../config/redis-connection.util';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: buildRedisConnectionOptions(redisEnvFromProcess()),
      }),
    }),
    EventsModule,
    OrchestrationModule,
    NewsTriggerModule,
  ],
})
export class WorkerModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
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
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/neutral-tex',
      }),
    }),
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

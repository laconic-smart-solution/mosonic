import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import {
  Pipeline,
  PipelineSchema,
} from '../pipeline/schemas/pipeline.schema';
import { UsersModule } from '../users/users.module';
import { CostController } from './cost.controller';
import { CostService } from './cost.service';
import {
  BudgetSettings,
  BudgetSettingsSchema,
} from './schemas/budget-settings.schema';
import { CostEntry, CostEntrySchema } from './schemas/cost-entry.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: CostEntry.name, schema: CostEntrySchema },
      { name: BudgetSettings.name, schema: BudgetSettingsSchema },
      { name: Pipeline.name, schema: PipelineSchema },
    ]),
    UsersModule,
    EventsModule,
  ],
  providers: [CostService],
  controllers: [CostController],
  exports: [CostService],
})
export class CostModule {}

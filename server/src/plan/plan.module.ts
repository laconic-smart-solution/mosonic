import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import { EventsModule } from '../events/events.module';
import { PayniModule } from '../payni/payni.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { PlanController } from './plan.controller';
import { PublicPlanController } from './public-plan.controller';
import { PlanChannelAccessService } from './plan-channel-access.service';
import { PlanUpgradeService } from './plan-upgrade.service';
import { PlanService } from './plan.service';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => CreditModule),
    EventsModule,
    PayniModule,
    RepositoriesModule,
  ],
  controllers: [PlanController, PublicPlanController],
  providers: [PlanService, PlanUpgradeService, PlanChannelAccessService],
  exports: [PlanService, PlanUpgradeService, PlanChannelAccessService],
})
export class PlanModule {}

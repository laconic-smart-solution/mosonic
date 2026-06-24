import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { UsersModule } from '../users/users.module';
import { CostController } from './cost.controller';
import { CostService } from './cost.service';

@Module({
  imports: [AuthModule, RepositoriesModule, UsersModule, EventsModule],
  providers: [CostService],
  controllers: [CostController],
  exports: [CostService],
})
export class CostModule {}

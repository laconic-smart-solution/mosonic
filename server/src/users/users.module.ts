import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../repositories/repositories.module';
import { UsersBootstrap } from './users.bootstrap';
import { UsersMaintenanceService } from './users-maintenance.service';
import { UsersService } from './users.service';

@Module({
  imports: [RepositoriesModule],
  providers: [UsersService, UsersBootstrap, UsersMaintenanceService],
  exports: [UsersService],
})
export class UsersModule {}

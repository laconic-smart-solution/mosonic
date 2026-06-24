import { Module } from '@nestjs/common';
import { PostModule } from '../post/post.module';
import { AuthModule } from '../auth/auth.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuthModule, PostModule, RepositoriesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

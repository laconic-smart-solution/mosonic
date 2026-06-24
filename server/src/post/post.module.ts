import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { McpModule } from '../mcp/mcp.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { UsersModule } from '../users/users.module';
import { PostAnalyticsService } from './post-analytics.service';
import { PostController } from './post.controller';
import { PostService } from './post.service';

@Module({
  imports: [ConfigModule, RepositoriesModule, UsersModule, McpModule],
  controllers: [PostController],
  providers: [PostService, PostAnalyticsService],
  exports: [PostService, PostAnalyticsService],
})
export class PostModule {}

import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../repositories/repositories.module';
import { LoggingService } from './logging.service';

@Module({
  imports: [RepositoriesModule],
  providers: [LoggingService],
  exports: [LoggingService],
})
export class LoggingModule {}

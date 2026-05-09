import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { ZernioClient } from './zernio/zernio.client';
import { ZernioMcpClient } from './zernio/zernio.mcp';

@Module({
  controllers: [McpController],
  providers: [McpService, ZernioClient, ZernioMcpClient],
  exports: [McpService],
})
export class McpModule {}

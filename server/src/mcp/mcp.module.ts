import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { ZernioController } from './zernio.controller';
import { ZernioClient } from './zernio/zernio.client';
import { ZernioMcpClient } from './zernio/zernio.mcp';
import { ZernioRestClient } from './zernio/zernio-rest.client';
import { ZernioOauthStateService } from './zernio-oauth-state.service';

@Module({
  imports: [UsersModule, AuthModule],
  controllers: [McpController, ZernioController],
  providers: [
    McpService,
    ZernioClient,
    ZernioMcpClient,
    ZernioRestClient,
    ZernioOauthStateService,
  ],
  exports: [McpService, ZernioMcpClient, ZernioRestClient],
})
export class McpModule {}

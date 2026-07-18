import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import { UsersModule } from '../users/users.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { ZernioController } from './zernio.controller';
import { ZernioClient } from './zernio/zernio.client';
import { ZernioMcpClient } from './zernio/zernio.mcp';
import { ZernioRestClient } from './zernio/zernio-rest.client';
import { ZernioOauthStateService } from './zernio-oauth-state.service';

@Module({
  imports: [UsersModule, AuthModule, forwardRef(() => CreditModule)],
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

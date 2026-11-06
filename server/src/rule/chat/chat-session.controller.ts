import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../../auth/tenancy.util';
import { User } from '../../users/schemas/user.schema';
import { ChatSessionService } from './chat-session.service';
import { BindChatSessionRuleDto } from './dto/bind-chat-session-rule.dto';
import { CreateChatSessionDto } from './dto/create-chat-session.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';

/**
 * Only "list sessions for a rule" stays rule-scoped in the URL â€” everything
 * else resolves ownership from the session row itself, since a session may
 * not have a ruleId yet (see ChatSessionService's onboarding flow).
 */
@UseGuards(JwtAuthGuard)
@Controller()
export class ChatSessionController {
  constructor(private readonly chatSessionService: ChatSessionService) {}

  @Get('rules/:ruleId/chat/sessions')
  listForRule(@Req() req: Request, @Param('ruleId') ruleId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.chatSessionService.listSessions(ruleId, auth);
  }

  @Get('chat/sessions')
  listAll(@Req() req: Request) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.chatSessionService.listAllSessions(auth);
  }

  @Post('chat/sessions')
  create(@Req() req: Request, @Body() body: CreateChatSessionDto) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.chatSessionService.createSession(body.ruleId, body.title, auth);
  }


  /** Bind a brand profile onto a ruleless onboarding session (after file-based extract). */
  @Patch('chat/sessions/:sessionId/rule')
  bindRule(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Body() body: BindChatSessionRuleDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.chatSessionService.bindRuleToSession(sessionId, body.ruleId, auth);
  }
  @Delete('chat/sessions/:sessionId')
  async remove(@Req() req: Request, @Param('sessionId') sessionId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    await this.chatSessionService.deleteSession(sessionId, auth);
    return { success: true };
  }

  /** Current run card state, so a reloaded chat can restore it. */
  @Get('chat/sessions/:sessionId/runs/:pipelineId')
  getRunProgress(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Param('pipelineId') pipelineId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.chatSessionService.getRunProgress(sessionId, pipelineId, auth);
  }

  /** Cursor-paged thread: ?before=<messageId>&limit=<1..100, default 30> â†’ { messages, hasMore, nextCursor }. */
  @Get('chat/sessions/:sessionId/messages')
  listMessages(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.chatSessionService.listMessages(sessionId, auth, {
      before,
      limit: limit === undefined ? undefined : Number(limit),
    });
  }

  @Post('chat/sessions/:sessionId/messages')
  sendMessage(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Body() body: SendChatMessageDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    // Eval harness only: generation answers "started" without running. Ignored in production.
    const evalDryRun = req.headers['x-chat-eval-dry-run'] === '1' && process.env.NODE_ENV !== 'production';
    return this.chatSessionService.sendMessage(sessionId, body.content, auth, { evalDryRun });
  }
}


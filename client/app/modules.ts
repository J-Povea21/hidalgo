/** Every use case on the page, built over the one server port. */
import { FollowSessionUseCase } from '@client/common/application/use-cases/follow-session.use-case.ts';
import { SendPageEventUseCase } from '@client/common/application/use-cases/send-page-event.use-case.ts';
import type { WorkbenchServer } from '@client/common/ports/workbench-server.port.ts';
import { conversationModule, type ConversationModule } from '@client/conversation/conversation.module.ts';
import { runModule, type RunModule } from '@client/run/run.module.ts';

export interface PageModules {
  sendPageEvent: SendPageEventUseCase;
  followSession: FollowSessionUseCase;
  run: RunModule;
  conversation: ConversationModule;
}

export function buildModules(server: WorkbenchServer): PageModules {
  return {
    sendPageEvent: new SendPageEventUseCase(server),
    followSession: new FollowSessionUseCase(server),
    run: runModule(server),
    conversation: conversationModule(server),
  };
}

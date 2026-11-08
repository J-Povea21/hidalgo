import { FollowSessionUseCase } from '@client/common/application/use-cases/follow-session.use-case.ts';
import { SendPageEventUseCase } from '@client/common/application/use-cases/send-page-event.use-case.ts';
import type { HidalgoServer } from '@client/common/ports/hidalgo-server.port.ts';
import { conversationModule, type ConversationModule } from '@client/conversation/conversation.module.ts';
import type { ImageShrinker } from '@client/conversation/domain/ports/image-shrinker.port.ts';
import { runModule, type RunModule } from '@client/run/run.module.ts';

/** The adapters the page's use cases run over; main.tsx builds the browser's. */
export interface PageAdapters {
  server: HidalgoServer;
  shrinker: ImageShrinker;
}

export interface PageModules {
  sendPageEvent: SendPageEventUseCase;
  followSession: FollowSessionUseCase;
  run: RunModule;
  conversation: ConversationModule;
}

/** Every use case on the page, built over its adapters. */
export function buildModules(adapters: PageAdapters): PageModules {
  return {
    sendPageEvent: new SendPageEventUseCase(adapters.server),
    followSession: new FollowSessionUseCase(adapters.server),
    run: runModule(adapters.server),
    conversation: conversationModule(adapters),
  };
}

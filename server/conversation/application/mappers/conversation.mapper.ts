import type { Diagram, Message } from '@shared/contract.ts';

export interface SendMessageResponse {
  messageId: string;
  /** The thread it went to: for a reply, the one the answered event came from. */
  threadId: string;
}

export interface CreateDiagramResponse {
  diagramId: string;
  /** What to put in a message or item text to show it. */
  embed: string;
}

/**
 * What the conversation tools return, built from what the use cases return. A change in
 * either side is absorbed here, so the tools' results stay as the skills read them.
 */
export class ConversationMapper {
  static toSent(message: Message): SendMessageResponse {
    return { messageId: message.id, threadId: message.threadId };
  }

  static toDiagram(diagram: Diagram): CreateDiagramResponse {
    return { diagramId: diagram.id, embed: `{{diagram:${diagram.id}}}` };
  }
}

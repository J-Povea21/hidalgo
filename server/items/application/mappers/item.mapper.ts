import type { Item, Question } from '@shared/contract.ts';

export interface AddedItemResponse {
  id: string;
  rev: number;
  /** The item's conversation, for send_message. */
  threadId: string;
}

export interface AddItemsResponse {
  added: AddedItemResponse[];
}

export interface RevisionResponse {
  rev: number;
}

export interface AskResponse {
  questionIds: string[];
  rev: number;
}

export interface MarkDoneResponse {
  itemId: string;
  /** The revision that was approved and is now done. */
  rev: number;
}

/**
 * What the items tools return, built from what the use cases return. A change in
 * either side is absorbed here, so the tools' results stay as the skills read them.
 */
export class ItemMapper {
  static toAdded(items: Item[]): AddItemsResponse {
    return { added: items.map((item) => ({ id: item.id, rev: item.rev, threadId: item.threadId })) };
  }

  static toRevision(item: Item): RevisionResponse {
    return { rev: item.rev };
  }

  static toAsked(asked: { item: Item; asked: Question[] }): AskResponse {
    return { questionIds: asked.asked.map((question) => question.id), rev: asked.item.rev };
  }

  static toDone(item: Item): MarkDoneResponse {
    return { itemId: item.id, rev: item.rev };
  }
}

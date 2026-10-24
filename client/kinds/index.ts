/** One view per item kind. pr-review and review-queue add theirs here, beside their schemas in shared/. */
import type { FunctionComponent } from 'preact';
import type { Item, ItemKind } from '../../shared/contract.ts';
import { CardView } from './card/CardView.tsx';

export interface KindViewProps { item: Item; editable: boolean; onEdit: (path: string, text: string) => void }

export const KIND_VIEWS: Record<ItemKind, FunctionComponent<KindViewProps>> = {
  card: CardView,
};

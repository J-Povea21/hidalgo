/** One view per item kind. pr-review and review-queue add theirs here, beside their schemas in shared/. */
import type { FunctionComponent } from 'preact';
import type { ItemKind } from '@shared/contract.ts';
import { CardView } from '@client/items/interface/kinds/card/CardView.tsx';
import type { KindViewProps } from './types.ts';

export const KIND_VIEWS: { [K in ItemKind]: FunctionComponent<KindViewProps<K>> } = {
  card: CardView,
};

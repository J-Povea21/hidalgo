/**
 * "Ask about this": select text on the item and a button offers to quote it into
 * the item's conversation. Works for a mouse selection and a keyboard one
 * (Shift+arrows); the button sits just above the selection.
 */
import { useEffect, useState } from 'preact/hooks';

interface AskAboutProps {
  /** A selector for where a selection counts, e.g. the item preview. */
  within: string;
  onQuote: (text: string) => void;
}

/** Where the button shows, and what it would quote. */
interface Offer {
  left: number;
  top: number;
  text: string;
}

/** Half the button's width, to centre it over the selection, and how far above the selection it sits. */
const BUTTON_HALF_WIDTH_PX = 55;
const BUTTON_LIFT_PX = 40;

export function AskAbout(props: AskAboutProps) {
  const [offer, setOffer] = useState<Offer>();

  useEffect(() => {
    const check = (event: Event) => {
      const clickedTheButton = event.target instanceof Element && event.target.closest('.askbtn');
      if (!clickedTheButton) {
        setOffer(offerFor(getSelection(), props.within));
      }
    };
    addEventListener('mouseup', check);
    addEventListener('keyup', check);
    return () => {
      removeEventListener('mouseup', check);
      removeEventListener('keyup', check);
    };
  }, [props.within]);

  if (!offer) {
    return null;
  }
  return (
    <button
      class="askbtn"
      style={{ left: `${offer.left}px`, top: `${offer.top}px` }}
      onClick={() => {
        props.onQuote(offer.text);
        setOffer(undefined);
        getSelection()?.removeAllRanges();
      }}
    >
      Ask about this
    </button>
  );
}

/** An offer for a non-empty selection inside `within`, placed just above it; otherwise none. */
function offerFor(selection: Selection | null, within: string): Offer | undefined {
  const text = selection?.toString().trim();
  const isInside = !!selection?.anchorNode?.parentElement?.closest(within);
  if (!selection || !text || !isInside || selection.rangeCount === 0) {
    return undefined;
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return {
    left: rect.left + scrollX + rect.width / 2 - BUTTON_HALF_WIDTH_PX,
    top: rect.top + scrollY - BUTTON_LIFT_PX,
    text,
  };
}

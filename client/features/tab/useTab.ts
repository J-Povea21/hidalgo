/** The browser tab: a title that leads with whose turn it is, and a dot of the same state's colour. */
import { useEffect } from 'preact/hooks';
import type { TurnView } from '../../core/selectors.ts';

const COLOR: Record<TurnView, string> = { yours: '#c27c0e', working: '#2f5bd3', idle: '#9b9a94', done: '#1f7a4d', offline: '#9b9a94' };

export function useTab(title: string, turn: TurnView): void {
  useEffect(() => { document.title = title; }, [title]);
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.fillStyle = COLOR[turn];
    g.beginPath();
    g.arc(16, 16, 12, 0, Math.PI * 2);
    g.fill();
    let link = document.querySelector<HTMLLinkElement>('link[rel=icon]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = canvas.toDataURL();
  }, [turn]);
}

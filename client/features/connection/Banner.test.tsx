// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionBanner } from './Banner.tsx';

afterEach(cleanup);
const live = { kind: 'live' } as const;

describe('ConnectionBanner', () => {
  it('a paused run says so, and how to carry on', () => {
    render(<ConnectionBanner connection={live} listening={false} idle={true} runStatus="paused" />);
    expect(screen.getByRole('status').textContent).toContain('This run is paused');
  });

  it("never says Claude isn't listening about a paused run", () => {
    render(<ConnectionBanner connection={live} listening={false} idle={true} runStatus="paused" />);
    expect(screen.queryByText(/isn't listening/)).toBeNull();
  });

  it('a lost session points at resuming the run, which is what brings the tab back', () => {
    render(<ConnectionBanner connection={{ kind: 'lost' }} listening={false} idle={false} runStatus="open" />);
    const text = screen.getByRole('alert').textContent!;
    expect(text).toContain('Ask Claude to resume this run');
    expect(text).toContain('/mcp');
  });

  it('a stale page says it must be reloaded, and offers to', () => {
    render(<ConnectionBanner connection={{ kind: 'stale' }} listening={false} idle={false} runStatus="open" />);
    expect(screen.getByRole('alert').textContent).toContain('older version of workbench');
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy();
  });

  it('is silent when the session is live and listening', () => {
    const { container } = render(<ConnectionBanner connection={live} listening={true} idle={false} runStatus="open" />);
    expect(container.textContent).toBe('');
  });
});

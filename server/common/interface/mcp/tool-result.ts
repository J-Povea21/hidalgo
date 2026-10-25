/** What every tool returns: compact JSON, and a known error's code and message instead of a stack. */
import { z } from 'zod';
import { WorkbenchError } from '@server/common/domain/errors.ts';

export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

export const ok = (body: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(body) }] });

export const err = (error: unknown): ToolResult => {
  const known = error instanceof WorkbenchError ? error : undefined;
  const body = known
    ? { error: known.code, message: known.message, ...(known.details ? { details: known.details } : {}) }
    : { error: 'internal', message: error instanceof Error ? error.message : String(error) };
  return { content: [{ type: 'text', text: JSON.stringify(body) }], isError: true };
};

/** Runs a tool's body; a thrown error becomes the tool's error result. */
export async function guarded(act: () => Promise<object>): Promise<ToolResult> {
  try {
    return ok(await act());
  } catch (error) {
    return err(error);
  }
}

export const RunId = z.string().describe('The run id open_session returned.');

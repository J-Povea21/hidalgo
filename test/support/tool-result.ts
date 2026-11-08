import { z } from 'zod';

const ToolResult = z.object({
  content: z.array(z.object({ text: z.string() })).min(1),
  isError: z.boolean().optional(),
});

/**
 * A Hidalgo tool's result as the MCP client hands it back, checked rather than assumed:
 * the tool's own answer (its JSON body), and whether the tool reported an error.
 */
export function readToolResult(result: unknown): { body: string; isError: boolean } {
  const parsed = ToolResult.parse(result);
  return { body: parsed.content[0]!.text, isError: parsed.isError ?? false };
}

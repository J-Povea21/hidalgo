/**
 * Sends what the user did to Claude, and says what to tell them about it. Never throws:
 * a refusal carries the server's reason, and anything else means the session is unreachable.
 */
import type { PageEvent } from '@shared/contract.ts';
import { ApiError } from '@client/common/domain/errors.ts';
import type { WorkbenchServer } from '@client/common/ports/workbench-server.port.ts';

const UNREACHABLE = "Not sent: Claude's session is unreachable. Your text is kept.";

export interface SendPageEventInput {
  event: PageEvent;
  /** What to tell the user once it reached Claude. */
  sentNotice: string;
}

export class SendPageEventUseCase {
  constructor(private readonly server: WorkbenchServer) {}

  async execute(input: SendPageEventInput): Promise<{ sent: boolean; notice: string }> {
    try {
      const result = await this.server.sendEvent(input.event);
      return { sent: true, notice: result.imageWarning ?? input.sentNotice };
    } catch (error) {
      return { sent: false, notice: error instanceof ApiError ? error.message : UNREACHABLE };
    }
  }
}

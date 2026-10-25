import type { PageEvent } from '@shared/contract.ts';
import { ApiError } from '@client/common/domain/errors.ts';
import type { WorkbenchServer } from '@client/common/ports/workbench-server.port.ts';

export interface SendPageEventInput {
  event: PageEvent;
}

/** How sending went: the server's warning when it was sent, its reason when it refused. */
export type SendOutcome =
  | { sent: true; imageWarning: string | undefined }
  /** `refusal` is undefined when the request never reached the server. */
  | { sent: false; refusal: string | undefined };

/** Sends what the user did to Claude. Never throws: every way it can go is an outcome. */
export class SendPageEventUseCase {
  constructor(private readonly server: WorkbenchServer) {}

  async execute(input: SendPageEventInput): Promise<SendOutcome> {
    try {
      const result = await this.server.sendEvent(input.event);
      return { sent: true, imageWarning: result.imageWarning };
    } catch (error) {
      return { sent: false, refusal: error instanceof ApiError ? error.message : undefined };
    }
  }
}

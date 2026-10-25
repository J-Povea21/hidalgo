import type { SendOutcome } from '@client/common/application/use-cases/send-page-event.use-case.ts';

const UNREACHABLE = "Not sent: Claude's session is unreachable. Your text is kept.";

/**
 * What the user is told about something they sent, built from how sending went. A change
 * in what the use case reports is absorbed here, so the views keep showing the same notices.
 */
export class PageEventMapper {
  /** `sentNotice` is what to say when it simply went through ("Sent to Claude"). */
  static toNotice(outcome: SendOutcome, sentNotice: string): string {
    if (outcome.sent) {
      return outcome.imageWarning ?? sentNotice;
    }
    return outcome.refusal ?? UNREACHABLE;
  }
}

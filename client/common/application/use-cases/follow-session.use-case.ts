import { actions, type PageAction } from '@client/common/domain/state.ts';
import type { HidalgoServer } from '@client/common/ports/hidalgo-server.port.ts';

export interface FollowSessionInput {
  dispatch: (action: PageAction) => void;
  /** Something Claude's side wants the user to notice ("Claude resumed this run."). */
  nudge: (text: string) => void;
}

/** Follows Claude's session and turns what the live feed reports into the page's actions. */
export class FollowSessionUseCase {
  constructor(private readonly server: HidalgoServer) {}

  /** Returns the function that stops following. */
  execute(input: FollowSessionInput): () => void {
    return this.server.follow({
      state: (run, activity) => input.dispatch(actions.state(run, activity)),
      claudeActivity: (activity) => input.dispatch(actions.claudeActivity(activity)),
      connection: (connection) => input.dispatch(actions.connection(connection)),
      nudge: input.nudge,
    });
  }
}

/** Follows Claude's session and turns what the live feed reports into the page's actions. */
import { actions, type PageAction } from '@client/common/domain/state.ts';
import type { WorkbenchServer } from '@client/common/ports/workbench-server.port.ts';

export interface FollowSessionInput {
  dispatch: (action: PageAction) => void;
  /** Something Claude's side wants the user to notice ("Claude resumed this run."). */
  nudge: (text: string) => void;
}

export class FollowSessionUseCase {
  constructor(private readonly server: WorkbenchServer) {}

  /** Returns the function that stops following. */
  execute(input: FollowSessionInput): () => void {
    return this.server.follow({
      state: (run, presence) => input.dispatch(actions.state(run, presence)),
      presence: (presence) => input.dispatch(actions.presence(presence)),
      connection: (connection) => input.dispatch(actions.connection(connection)),
      nudge: input.nudge,
    });
  }
}

/** The time, as an ISO string. A port so tests can fix it. */
export abstract class Clock {
  abstract now(): string;
}

/**
 * Flo error catch / error-path routing (design-time + runtime).
 */

export const ERROR_HANDLE = 'error';

/** Per-node override; inherit uses Start node floErrorDefaults. */
export type CatchErrorScope = 'inherit' | 'none' | 'self' | 'subtree';

export type ErrorPathDataSource =
  | 'inherit'
  | 'cStreamAtCatcher'
  | 'cStreamAtError'
  | 'local'
  | 'global';

/** Start node — flo-wide defaults for catch + error-path payload. */
export interface FloErrorDefaults {
  catchScope?:       CatchErrorScope;
  errorDataSource?:  ErrorPathDataSource;
  /** When errorDataSource is local | global */
  errorDataRef?:     string;
  /** If true and no catcher handles, fail the run (default true). */
  failIfUnhandled?:  boolean;
}

/** Runtime exception snapshot — stored on store.local.exception (latest only). */
export interface FloException {
  statusCode?:     number;
  message:         string;
  nodeId:          string;
  nodeCanvasName:  string;
  nodeType:        string;
  cStream?:        unknown;
  dateTime:        string;
  caughtByNodeId?: string;
  httpTrace?:      Record<string, unknown>;
}

export interface ExecutionPathState {
  /** Active success-path parent for each executed node. */
  parentOnPath: Record<string, string | null>;
  /** cStream snapshot when each node began execution. */
  cStreamAtNode: Record<string, unknown>;
  /** Optional propagation log for Execution Hub. */
  errorPropagation?: { from: string; to: string; action: 'raised' | 'caught' | 'propagated' | 'unhandled' }[];
}

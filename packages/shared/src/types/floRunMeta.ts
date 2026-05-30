/**
 * Engine-owned run metadata — read-only for flow authors.
 * Available in FloExpressions as floRunMeta.<field> (e.g. floRunMeta.runId).
 */

export type FloRunType = 'Scheduled' | 'Webhook' | 'RunFlo';

export interface FloRunMeta {
  /** Execution log document id */
  runId:         string;
  /** Same as runId — explicit alias for logging */
  floRunId:      string;
  floId:         string;
  floName:       string;
  slug:          string;
  /** Tenant id */
  tenant:        string;
  hubId:         string;
  /** User-provided run label, if any */
  floRunName:    string;
  runType:       FloRunType;
  userId:        string;
  userEmail:     string;
  /** ISO-8601 UTC */
  startDatetime: string;
  /** Parent run when nested/sub-flow; empty until supported */
  parentRunId:   string;
}

export const FLO_RUN_META_SCOPE = 'floRunMeta';

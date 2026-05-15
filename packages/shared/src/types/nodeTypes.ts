/**
 * functions/src/nodes/nodeTypes.ts
 *
 * Shared types used by every node executor.
 * Import from here — never re-define in individual node files.
 */

export interface FloNode {
  id:   string;
  type: string;
  data: Record<string, unknown>;
}

export interface FloEdge {
  source: string;
  target: string;
}

export interface NodeStore {
  global: Record<string, any>;
  local:  Record<string, any>;
}


export interface ConditionGroup {
  logic:      'AND' | 'OR';
  conditions: { field: string; operator: string; value: string }[];
}

export interface NodeResult {
  cStream: unknown;
  logLine: string;
}

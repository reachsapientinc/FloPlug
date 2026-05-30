/** Designer-aligned colors/icons for hub pipeline nodes */
export interface HubNodeVisual {
  color: string;
  icon:  string;
}

const DEFAULT: HubNodeVisual = { color: '#64748b', icon: 'ND' };

const BY_TYPE: Record<string, HubNodeVisual> = {
  startNode:         { color: '#22c55e', icon: '▶' },
  endNode:           { color: '#ef4444', icon: '■' },
  plugNode:          { color: '#4f8ef7', icon: 'PL' },
  floActionNode:     { color: '#8b5cf6', icon: 'FA' },
  templateNode:      { color: '#06b6d4', icon: 'TM' },
  filterNode:        { color: '#a855f7', icon: 'FL' },
  floSwitchNode:     { color: '#6366f1', icon: 'SW' },
  loopNode:          { color: '#f59e0b', icon: 'LP' },
  variableStoreNode: { color: '#14b8a6', icon: 'VS' },
  fifNode:           { color: '#ec4899', icon: 'IF' },
  functionNode:      { color: '#eab308', icon: 'FN' },
  mapperNode:        { color: '#10b981', icon: 'MP' },
  workdayNode:       { color: '#f97316', icon: 'WD' },
  salesforceNode:    { color: '#0ea5e9', icon: 'SF' },
  sapNode:           { color: '#6366f1', icon: 'SP' },
  oracleNode:        { color: '#dc2626', icon: 'OR' },
};

export function hubNodeVisual(nodeType: string, data?: Record<string, unknown>): HubNodeVisual {
  if (nodeType === 'plugNode') {
    const isEmail = data?.authProtocol === 'smtp_basic' || data?.nodeType === 'emailNode';
    if (isEmail) return { color: '#f59e0b', icon: '✉' };
    const name = String(data?.plugName ?? 'PL');
    return { color: '#4f8ef7', icon: name.slice(0, 2).toUpperCase() };
  }
  if (nodeType === 'floActionNode') {
    const label = String(data?.flaLabel ?? data?.floActionName ?? 'FA');
    return { color: '#8b5cf6', icon: label.slice(0, 2).toUpperCase() };
  }
  return BY_TYPE[nodeType] ?? DEFAULT;
}

export function hubNodeTitle(nodeType: string, data?: Record<string, unknown>, fallbackId?: string): string {
  const d = data ?? {};
  return String(
    d.label ?? d.plugName ?? d.flaLabel ?? d.floActionName ?? d.displayName ?? fallbackId ?? nodeType,
  );
}

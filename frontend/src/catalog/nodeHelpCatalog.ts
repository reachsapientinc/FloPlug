/**
 * Quick-help text for canvas nodes (palette types + Start/End + dynamic plug/FloAction).
 */
import type { Node } from '@xyflow/react';
import type { FloActionPaletteItem, PlugConfig } from '@floplug/shared';
import { nodeDisplayTitle } from '@floplug/shared';

export interface PaletteItem {
  type:     string;
  label:    string;
  icon:     string;
  color:    string;
  category: string;
  help:     string;
}

export const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'sapNode',           label: 'SAP S/4HANA',  icon: 'S',   color: '#0052cc', category: 'ERP',       help: 'Read or post to SAP S/4HANA via BAPI / RFC calls.' },
  { type: 'oracleNode',        label: 'Oracle EBS',   icon: 'O',   color: '#e07b39', category: 'ERP',       help: 'Query tables or call stored procedures in Oracle EBS.' },
  { type: 'workdayNode',       label: 'Workday',      icon: 'W',   color: '#f5a623', category: 'HRIS',      help: 'Fetch worker details, timesheets, payroll or benefits.' },
  { type: 'salesforceNode',    label: 'Salesforce',   icon: 'SF',  color: '#00a1e0', category: 'CRM',       help: 'Query, insert, update or upsert Salesforce objects.' },
  { type: 'mapperNode',        label: 'Field Mapper', icon: 'M',   color: '#7c3aed', category: 'Transform', help: 'Rename or remap keys in cStream using source→target pairs.' },
  { type: 'filterNode',        label: 'Filter',       icon: 'F',   color: '#0f766e', category: 'Transform', help: 'Drop records from cStream that do not match a field condition. Enable "Catch error" to wire the ⚡ error path for evaluation failures.' },
  { type: 'floSwitchNode',     label: 'FloSwitch',    icon: 'SW',  color: '#6366f1', category: 'Logic',     help: 'Route cStream to the first matching branch, else defaultFlo. ⚡ error handle available when catch is enabled.' },
  { type: 'variableStoreNode', label: 'Var Store',    icon: 'VS',  color: '#0891b2', category: 'Transform', help: 'Read/write named variables (global or local scope) in multi-row mode.' },
  { type: 'fifNode',           label: 'Flow in Flow', icon: 'FiF', color: '#7e22ce', category: 'Logic',     help: 'Embed another flow as a sub-step. Recursive flos are blocked.' },
  { type: 'functionNode',      label: 'Function',     icon: 'fn',  color: '#b45309', category: 'Logic',     help: 'Run a sandboxed JS snippet server-side; returns an object to merge into cStream.' },
  { type: 'templateNode',      label: 'Template',     icon: 'TN',  color: '#0f766e', category: 'Logic',     help: 'Render JSON/XML/CSV using {{path}} placeholders.' },
  { type: 'subFloNode',        label: 'SubFlo',         icon: 'SF',  color: '#0d9488', category: 'Logic',     help: 'Inline subflow contract: input/return args on the same canvas.' },
  { type: 'invokeSubFloNode',  label: 'Invoke SubFlo',  icon: 'IS',  color: '#2563eb', category: 'Logic',     help: 'Run a SubFlo compartment; return args become main local.* variables.' },
  { type: 'subFloReturnNode',  label: 'SubFlo Return',  icon: 'SR',  color: '#14b8a6', category: 'Logic',     help: 'End of a SubFlo compartment; maps values to return arguments.' },
  { type: 'loopNode',          label: 'Loop',           icon: '↻',   color: '#ea580c', category: 'Logic',     help: 'Loop path + exit path. Wire InvokeSubFlo on loop path; continueExpr uses local.* from returns.' },
];

export const PALETTE_CATEGORIES = ['ERP', 'HRIS', 'CRM', 'Transform', 'Logic'] as const;

export interface NodeQuickHelpContent {
  title:       string;
  titleColor?: string;
  body:        string;
  typeHint?:   string;
}

const PALETTE_BY_TYPE = new Map(PALETTE_ITEMS.map(i => [i.type, i]));

const FIXED_HELP: Record<string, NodeQuickHelpContent> = {
  startNode: {
    title: 'Start — entry & global error handler',
    titleColor: '#22c55e',
    body: [
      'Single entry point for the flow. Test runs and webhooks inject cStream here.',
      '',
      '🛡️ Global Error Handler: Open the inspector → set "Default catch" to "This node and below". Wire the ⚡ error handle (red shield, right side) to an error handler node.',
      '',
      'When set, ANY unhandled error in the entire flo bubbles up to Start\'s error wire — making it a flo-level catch-all. store.local.exception holds the error details.',
    ].join('\n'),
    typeHint: 'startNode',
  },
  endNode: {
    title: 'End',
    titleColor: '#f59e0b',
    body: 'Marks flow completion. Wire the last processing step into End.',
    typeHint: 'endNode',
  },
  filterNode: {
    title: 'Value Filter',
    titleColor: '#0f766e',
    body: 'Drop records that do not match the condition. Non-matching paths terminate (null cStream).\n\n⚡ Error path: if "Catch error" is enabled on this node, a failed condition evaluation routes to the ⚡ error handle instead of terminating.',
    typeHint: 'filterNode',
  },
  floSwitchNode: {
    title: 'FloSwitch',
    titleColor: '#6366f1',
    body: 'Routes cStream to the first matching branch; falls through to defaultFlo if none match.\n\n⚡ Error path: enable "Catch error" in inspector to wire the ⚡ error handle for expression-evaluation failures.',
    typeHint: 'floSwitchNode',
  },
  loopNode: {
    title: 'Loop',
    titleColor: '#ea580c',
    body: 'loop path — repeating branch (wire Invoke SubFlo here).\nexit path — continues after loop completes.\n\n⚡ Error path: the ⚡ handle fires if the loop body throws and no inner catcher handles it.',
    typeHint: 'loopNode',
  },
  invokeSubFloNode: {
    title: 'Invoke SubFlo',
    titleColor: '#2563eb',
    body: 'Runs a SubFlo compartment. Return args become local.* on the main flow.\n\n⚡ Error path: errors inside the SubFlo propagate upward through the Invoke node. Enable "Catch error" here to intercept them.',
    typeHint: 'invokeSubFloNode',
  },
};

export function getNodeQuickHelp(
  node: Node,
  plugs: PlugConfig[],
  floActions: FloActionPaletteItem[],
): NodeQuickHelpContent {
  const type = node.type ?? '';
  const d = node.data as Record<string, unknown>;

  if (type === 'plugNode') {
    const plugId = String(d.plugId ?? '');
    const plug = plugs.find(p => p.id === plugId);
    const isEmail = plug?.authProtocol === 'smtp_basic';
    return {
      title: plug?.name ?? nodeDisplayTitle(d, 'Plug'),
      titleColor: isEmail ? '#f59e0b' : '#4f8ef7',
      body: isEmail
        ? 'Send email via SMTP credentials from hub admin. To/cc/body are set on the canvas node.'
        : `HTTP integration (${plug?.connectorLabel ?? plug?.connectorId ?? 'connector'}) using hub-admin URL pattern and connection credentials.`,
      typeHint: 'plugNode',
    };
  }

  if (type === 'floActionNode') {
    const floKitId = String(d.floKitId ?? '');
    const fla = floActions.find(a => a.floKitId === floKitId)
      ?? floActions.find(a => a.id === String(d.floActionNodeId ?? ''));
    return {
      title: String(d.flaLabel ?? fla?.flaLabel ?? 'FloAction'),
      titleColor: '#10b981',
      body: String(d.description ?? fla?.description ?? '').trim()
        || 'Connector kit action configured by hub admin. Pick action and connection in the inspector.',
      typeHint: 'floActionNode',
    };
  }

  const fixed = FIXED_HELP[type];
  if (fixed) return fixed;

  const palette = PALETTE_BY_TYPE.get(type);
  if (palette) {
    return {
      title: palette.label,
      titleColor: palette.color,
      body: palette.help,
      typeHint: type,
    };
  }

  return {
    title: nodeDisplayTitle(d, type || 'Node'),
    body: 'Configure this node in the inspector panel on the right.',
    typeHint: type || undefined,
  };
}

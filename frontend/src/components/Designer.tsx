/**
 * frontend/src/components/Designer.tsx
 *
 * Changes in this version:
 *  1. isHubAdmin — derived from Firebase auth token (getIdTokenResult) instead of
 *     trusting the isAdmin prop. All admin checks now use isHubAdmin from the token.
 *  2. All workspaces loaded for hub admins — resolveWorkspace fetches every workspace
 *     and exposes a workspace switcher dropdown in the topbar.
 *  3. loadFlows — skips ownerUid filter for hub admins so all flos are visible.
 *  4. Plug field placeholders — dynamic per plug category.
 *  5. Attachment filename field — new field on PlugNode inspector supporting
 *     static text or {{local.varName}} / {{global.varName}} references.
 *  6. Plug screen visibility — input text, placeholders and hints upgraded to
 *     white / fluorescent green for legibility on dark backgrounds.
 *  7. Branding / logo — hub logo + name rendered in topbar from hubMeta loaded
 *     from Firestore; falls back to "FloPlug" text if not set.
 *  8. All previous fixes retained.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  reconnectEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import { useCanvasHistory } from '../hooks/useCanvasHistory';
import type { CanvasSnapshot } from '../utils/canvasSnapshot';
import { snapshotCanvas } from '../utils/canvasSnapshot';
import '@xyflow/react/dist/style.css';
import '../styles/designer-canvas.css';

import { db }                          from '../firebaseConfig';
import { getAuth }                     from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  doc, setDoc, getDoc, addDoc, collection, getDocs,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';

import { WorkdayNode }                                                 from './nodes/WorkdayNode';
import { SalesforceNode, SapNode, OracleNode, MapperNode, FilterNode } from './nodes/ConnectorNodes';
import { SwitchNode } from './nodes/SwitchNode';
import { createSwitchBranch, defaultConditionRows } from '@floplug/shared';
import { VariableStoreNode, FIFNode, FunctionNode }                    from './nodes/AdvancedNodes';
import TemplateNode                                                    from './nodes/TemplateNode';
import { LoopNode }                                                    from './nodes/LoopNode';
import { SubFloNode, SubFloReturnNode, InvokeSubFloNode }              from './nodes/SubFloNodes';
import { StartNode, EndNode }                                          from './nodes/StartEndNodes';
import { NodeInspector, NodePalette }                                  from './NodePaletteAndInspector';
import {
  InspectorPanelProvider,
  DESIGNER_CANVAS_MIN_WIDTH,
} from '../inspector/InspectorPanelContext';
import { InspectorPanelToolbar } from '../inspector/InspectorExpandShell';
import { InspectorRightColumn } from '../inspector/InspectorPanelShell';
import {
  restoreCanvasViewport,
  fitCanvasToFlow,
  clampCanvasViewport,
} from '../utils/canvasViewportRestore';
import type { DesignerInspectorContext }                               from '../inspector/types';
import { nodesForNodeTest, edgesForNodeTest }                          from '../inspector/testSubgraph';
import { testConnectorNode }                                           from '../inspector/connectorTest';
import { testPlugNode }                                                from '../inspector/plugTest';
import { testFloActionNode }                                           from '../inspector/floActionTest';
import { parseNodeTestInput, DEFAULT_NODE_TEST_INPUT }                 from '../inspector/nodeTestPayload';
import { RunModal, type RunResult }                                    from './RunModal';
import PlugManager                                                     from './PlugManager.tsx';
import type { PlugConfig,
  FloInvokePermissions,
  DesignerProps,
  NewFloForm,
  FloMeta,
  HubActionNodeDoc,
  FloActionPaletteItem,
  FloConnectionSafe,
} from '@floplug/shared';
import { toFloActionPaletteItem } from '@floplug/shared';
import {
  COLLECTIONS,
  HUB_COLLECTIONS,
  NODE_TYPES as NODE_TYPE_KEYS,
  validateFloGraph,
  getDraftGraph,
  getPublishedGraph,
  computeGraphHash,
  hasInProgressDraft,
  isPlatformFailureMessage,
  compartmentsCompatible,
  nodeCompartmentId,
  ERROR_HANDLE,
  showErrorHandleOnCanvas,
  type FloErrorDefaults,
} from '@floplug/shared';
import { stripErrorEdgesForNode } from '../inspector/ErrorCatchSection';
import PlugNodeComponent from './nodes/PlugNode';
import FloActionNodeComponent from './nodes/FloActionNode';
import DeletableEdge from './edges/DeletableEdge';
import { EdgeRewireContext, type EdgeRewireApi } from './edges/edgeRewireContext';
import ProfileDrawer, { type DashboardSection } from './ProfileDrawer';
import { enterProductDocs } from '../docs';
import HubAdminDashboard                        from './HubAdminDashboard';
import FloExecutionHubApp                       from '../modules/floExecutionHub/FloExecutionHubApp';
import { ValidationAlertsPanel }                from './ValidationAlertsPanel';
import { DesignerWorkspaceFloBar }              from './DesignerWorkspaceFloBar';
import {
  NodeCanvasContextMenu,
  DesignerHelpPopup,
  getNodeQuickHelp,
  type NodeContextMenuState,
  type NodeQuickHelpState,
} from './designer/DesignerPopups';
import type { FloValidationReport }             from '@floplug/shared';
import { useDeveloperWorkspaces, setDefaultFloForWorkspace, moveFloToWorkspace } from '../hooks/useDeveloperWorkspaces';
import {
  readTenantUiState,
  writeTenantUiState,
  readCanvasViewport,
  writeCanvasViewport,
  type TenantViewId,
  type AdminTabId,
} from '../utils/tenantUiState';

// ── Node registry ────────────────────────────────────────────────────────────
// Keys come from the shared NODE_TYPES constant so Designer stays in sync with
// the rest of the platform. NODE_TYPE_KEYS.PLUG etc. are the string values;
// the map below binds each string key to its React component.
const NODE_TYPES: Record<string, React.ComponentType<any>> = {
  [NODE_TYPE_KEYS.START]:      StartNode,
  [NODE_TYPE_KEYS.END]:        EndNode,
  [NODE_TYPE_KEYS.WORKDAY]:    WorkdayNode,
  [NODE_TYPE_KEYS.SALESFORCE]: SalesforceNode,
  [NODE_TYPE_KEYS.SAP]:        SapNode,
  [NODE_TYPE_KEYS.ORACLE]:     OracleNode,
  [NODE_TYPE_KEYS.MAPPER]:     MapperNode,
  [NODE_TYPE_KEYS.FILTER]:     FilterNode,
  [NODE_TYPE_KEYS.SWITCH]:     SwitchNode,
  [NODE_TYPE_KEYS.VAR_STORE]:  VariableStoreNode,
  [NODE_TYPE_KEYS.FIF]:        FIFNode,
  [NODE_TYPE_KEYS.FUNCTION]:   FunctionNode,
  [NODE_TYPE_KEYS.LOOP]:       LoopNode,
  [NODE_TYPE_KEYS.SUB_FLO]:    SubFloNode,
  [NODE_TYPE_KEYS.SUB_FLO_RETURN]: SubFloReturnNode,
  [NODE_TYPE_KEYS.INVOKE_SUB_FLO]: InvokeSubFloNode,
  [NODE_TYPE_KEYS.TEMPLATE]:   TemplateNode,
  [NODE_TYPE_KEYS.PLUG]:       PlugNodeComponent,
  floActionNode:               FloActionNodeComponent,
};

const EDGE_TYPES = { deletable: DeletableEdge };

// ── Plug category → placeholder mapping ───────────────────────────────────────
// Used by the PlugNode inspector to show context-appropriate placeholders.
export const PLUG_CATEGORY_PLACEHOLDERS: Record<string, {
  inputPlaceholder:      string;
  outputPlaceholder:     string;
  attachmentPlaceholder: string;
  hint:                  string;
}> = {
  email: {
    inputPlaceholder:      'e.g. {{local.recipientEmail}}',
    outputPlaceholder:     'e.g. {{local.emailSentStatus}}',
    attachmentPlaceholder: 'e.g. report.pdf  or  {{local.fileName}}',
    hint:                  'Enter recipient email or map from a variable',
  },
  sftp: {
    inputPlaceholder:      'e.g. /remote/path/{{local.fileName}}',
    outputPlaceholder:     'e.g. {{local.transferResult}}',
    attachmentPlaceholder: 'e.g. {{global.exportFileName}}',
    hint:                  'Remote path supports variable substitution',
  },
  api: {
    inputPlaceholder:      'e.g. {{local.requestPayload}}',
    outputPlaceholder:     'e.g. {{local.apiResponse}}',
    attachmentPlaceholder: 'e.g. attachment.json  or  {{local.fileName}}',
    hint:                  'Map request body from a local or global variable',
  },
  database: {
    inputPlaceholder:      'e.g. {{local.queryParams}}',
    outputPlaceholder:     'e.g. {{local.queryResult}}',
    attachmentPlaceholder: 'e.g. export.csv  or  {{local.exportFile}}',
    hint:                  'Pass query parameters as a JSON object',
  },
  storage: {
    inputPlaceholder:      'e.g. {{local.fileContent}}',
    outputPlaceholder:     'e.g. {{local.storageUrl}}',
    attachmentPlaceholder: 'e.g. {{local.uploadFileName}}',
    hint:                  'File content or reference to upload',
  },
  notification: {
    inputPlaceholder:      'e.g. {{local.messageBody}}',
    outputPlaceholder:     'e.g. {{local.notifStatus}}',
    attachmentPlaceholder: 'e.g. attachment.pdf  or  {{local.attachFile}}',
    hint:                  'Message body — supports variable substitution',
  },
  default: {
    inputPlaceholder:      'e.g. {{local.inputValue}}  or  static text',
    outputPlaceholder:     'e.g. {{local.outputValue}}',
    attachmentPlaceholder: 'e.g. file.pdf  or  {{local.fileName}}',
    hint:                  'Map input from a local or global variable',
  },
};

export function getPlugPlaceholders(category?: string) {
  return PLUG_CATEGORY_PLACEHOLDERS[category?.toLowerCase() ?? '']
      ?? PLUG_CATEGORY_PLACEHOLDERS.default;
}

// ── Firestore path helpers ────────────────────────────────────────────────────
const flosCol = (hubId: string, tenantId: string, wsId: string) =>
  collection(db, COLLECTIONS.HUBS, hubId, HUB_COLLECTIONS.TENANTS, tenantId, HUB_COLLECTIONS.WORKSPACES, wsId, HUB_COLLECTIONS.FLOS);

const flowDocRef = (hubId: string, tenantId: string, wsId: string, fId: string) =>
  doc(db, COLLECTIONS.HUBS, hubId, HUB_COLLECTIONS.TENANTS, tenantId, HUB_COLLECTIONS.WORKSPACES, wsId, HUB_COLLECTIONS.FLOS, fId);

function canvasFingerprint(nodes: Node[], edges: Edge[]): string {
  return JSON.stringify(snapshotCanvas(nodes, edges));
}

const floStatusBadge: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '2px 6px', letterSpacing: '0.02em',
};

function FloDraftStatusBar({
  flo, hasDraftChanges, saving, autoSaving,
}: {
  flo: FloMeta;
  hasDraftChanges: boolean;
  saving: boolean;
  autoSaving: boolean;
}) {
  const versionLabel = flo.publishedVersion && flo.publishedVersion > 0
    ? `v${flo.publishedVersion}`
    : null;
  const draftLabel = saving
    ? 'Saving…'
    : autoSaving
      ? 'Auto-saving…'
      : hasDraftChanges
        ? 'Draft'
        : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <span
        style={{ fontSize: 11, color: '#a0a0b8', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={flo.name}
      >
        {flo.shortCode || flo.name}
      </span>
      {versionLabel && (
        <span style={{ ...floStatusBadge, color: '#86efac', background: 'rgba(34,197,94,0.12)', border: '0.5px solid rgba(34,197,94,0.35)' }}>
          {versionLabel} published
        </span>
      )}
      {draftLabel && (
        <span style={{
          ...floStatusBadge,
          color: saving || autoSaving ? '#93c5fd' : '#fbbf24',
          background: saving || autoSaving ? 'rgba(59,130,246,0.12)' : 'rgba(251,191,36,0.12)',
          border: saving || autoSaving ? '0.5px solid rgba(59,130,246,0.35)' : '0.5px solid rgba(251,191,36,0.35)',
        }}>
          {draftLabel}
        </span>
      )}
      {!draftLabel && !versionLabel && (
        <span style={{ ...floStatusBadge, color: '#9ca3af', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.12)' }}>
          Draft only
        </span>
      )}
    </div>
  );
}
const makeDefaultNodes = (): Node[] => [
  { id: 'start-node', type: 'startNode', position: { x: 80,  y: 180 }, data: { label: 'Start' } },
  { id: 'end-node',   type: 'endNode',   position: { x: 560, y: 180 }, data: { label: 'End', output: null } },
];

// ── Node sanitiser ────────────────────────────────────────────────────────────
const STRIP_KEYS = new Set([
  'functions', 'onLogEntry', 'onUpdate', 'onDelete', '__rf', 'measured', 'availablePlugs', 'availableFlos',
  '_showErrorHandle',
  // floActionNode UI-only fields — kept in memory for inspector, never persisted.
  // connectorId is hub-managed; runtime resolves it from FloActionNodes via floKitId.
  'actionIds', 'allowedConnectionIds', 'templateActionId', 'defaultConnectionId', 'floActionName', 'connectorId', 'flaLabel',
  'connectionName',
]);

function sanitizeNode(node: Node): Node {
  const cleanData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node.data ?? {})) {
    if (STRIP_KEYS.has(k))       continue;
    if (typeof v === 'function') continue;
    if (v === undefined)         continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      try { JSON.stringify(v); cleanData[k] = v; } catch { /* skip */ }
    } else {
      cleanData[k] = v;
    }
  }
  return {
    id:       node.id,
    type:     node.type     ?? 'default',
    position: node.position ?? { x: 0, y: 0 },
    data:     cleanData,
    ...(node.width  != null ? { width:  node.width }  : {}),
    ...(node.height != null ? { height: node.height } : {}),
  };
}
function sanitizeNodes(nodes: Node[]): Node[] { return nodes.map(sanitizeNode); }

// ── Edge sanitiser ────────────────────────────────────────────────────────────
function sanitizeEdge(e: Edge): Record<string, unknown> {
  const clean: Record<string, unknown> = { id: e.id, source: e.source, target: e.target };
  if (e.sourceHandle != null) clean.sourceHandle = e.sourceHandle;
  if (e.targetHandle != null) clean.targetHandle = e.targetHandle;
  if (e.animated     != null) clean.animated     = e.animated;
  if (e.style        != null) clean.style        = e.style;
  if (e.type         != null) clean.type         = e.type;
  if (e.reconnectable != null) clean.reconnectable = e.reconnectable;
  return clean;
}
function sanitizeEdges(edges: Edge[]): Record<string, unknown>[] { return edges.map(sanitizeEdge); }

/** Ensure loaded/saved edges work with the deletable type and drag-to-rewire handles. */
function normalizeFlowEdge(e: Edge): Edge {
  const isError = (e.sourceHandle ?? '') === ERROR_HANDLE;
  return {
    ...e,
    type:          e.type ?? 'deletable',
    animated:      e.animated ?? true,
    reconnectable: e.reconnectable ?? true,
    style:         e.style ?? { stroke: isError ? '#ef4444' : '#4f8ef7', strokeWidth: 1.5 },
  };
}

const ANCHOR_POSITIONS: Record<string, { x: number; y: number }> = {
  'start-node': { x: 80,  y: 180 },
  'end-node':   { x: 560, y: 180 },
};

/** Repair anchor nodes + dedupe ids so React Flow always renders Start/End. */
function normalizeLoadedNodes(nodes: Node[]): Node[] {
  const byId = new Map<string, Node>();

  for (const raw of nodes) {
    const id = String(raw.id ?? '').trim();
    if (!id) continue;

    let type = String(raw.type ?? '');
    if (id === 'start-node') type = 'startNode';
    if (id === 'end-node')   type = 'endNode';

    const pos = raw.position;
    const position = (
      pos
      && typeof pos.x === 'number' && Number.isFinite(pos.x)
      && typeof pos.y === 'number' && Number.isFinite(pos.y)
    )
      ? pos
      : (ANCHOR_POSITIONS[id] ?? { x: 0, y: 0 });

    const prev = byId.get(id);
    const data = { ...(prev?.data ?? {}), ...(raw.data ?? {}) } as Record<string, unknown>;

    // Start only stores flo-wide error defaults — not per-node catch fields.
    if (type === 'startNode') {
      delete data.catchErrorScope;
      delete data.errorDataSource;
      delete data.errorDataRef;
      delete data._showErrorHandle;
      if (data.floErrorDefaults && typeof data.floErrorDefaults === 'object') {
        const defs = { ...(data.floErrorDefaults as Record<string, unknown>) };
        const scope = defs.catchScope;
        if (scope === 'inherit' || (scope !== 'none' && scope !== 'self' && scope !== 'subtree')) {
          defs.catchScope = 'none';
        }
        data.floErrorDefaults = defs;
      }
    }
    if (type === 'endNode') {
      delete data.catchErrorScope;
      delete data._showErrorHandle;
    }

    const widthNum = typeof raw.width === 'number' && Number.isFinite(raw.width) && raw.width > 20
      ? raw.width
      : undefined;
    const heightNum = typeof raw.height === 'number' && Number.isFinite(raw.height) && raw.height > 20
      ? raw.height
      : undefined;

    byId.set(id, {
      ...(prev ?? raw),
      id,
      type,
      position,
      data,
      ...(widthNum  != null ? { width:  widthNum  } : {}),
      ...(heightNum != null ? { height: heightNum } : {}),
    });
  }

  if (!byId.has('start-node')) {
    byId.set('start-node', {
      id: 'start-node',
      type: 'startNode',
      position: ANCHOR_POSITIONS['start-node'],
      data: { label: 'Start' },
      width: 172,
      height: 64,
    });
  }
  if (!byId.has('end-node')) {
    byId.set('end-node', {
      id: 'end-node',
      type: 'endNode',
      position: ANCHOR_POSITIONS['end-node'],
      data: { label: 'End', output: null },
      width: 172,
      height: 64,
    });
  }

  const start = byId.get('start-node');
  if (start) {
    byId.set('start-node', {
      ...start,
      id: 'start-node',
      type: 'startNode',
      position: (
        start.position
        && Number.isFinite(start.position.x)
        && Number.isFinite(start.position.y)
      ) ? start.position : ANCHOR_POSITIONS['start-node'],
      parentId: undefined,
      hidden: false,
      draggable: true,
      selectable: true,
      width: (typeof start.width === 'number' && start.width > 20) ? start.width : 172,
      height: (typeof start.height === 'number' && start.height > 20) ? start.height : 64,
      data: { ...(start.data as Record<string, unknown>), label: 'Start' },
    });
  }

  const end = byId.get('end-node');
  if (end) {
    byId.set('end-node', {
      ...end,
      id: 'end-node',
      type: 'endNode',
      position: (
        end.position
        && Number.isFinite(end.position.x)
        && Number.isFinite(end.position.y)
      ) ? end.position : ANCHOR_POSITIONS['end-node'],
      parentId: undefined,
      hidden: false,
      draggable: true,
      selectable: true,
      width: (typeof end.width === 'number' && end.width > 20) ? end.width : 172,
      height: (typeof end.height === 'number' && end.height > 20) ? end.height : 64,
      data: { ...(end.data as Record<string, unknown>), label: 'End' },
    });
  }

  return Array.from(byId.values());
}

function startFloErrorDefaults(nodes: Node[]): FloErrorDefaults | undefined {
  const start = nodes.find(n => n.type === 'startNode' || n.id === 'start-node');
  return start?.data?.floErrorDefaults as FloErrorDefaults | undefined;
}

function attachErrorHandleFlags(nodes: Node[], floDefaults?: FloErrorDefaults): Node[] {
  const defs = floDefaults ?? startFloErrorDefaults(nodes);
  return nodes.map(n => {
    if (n.type === 'startNode' || n.type === 'endNode') return n;
    const show = showErrorHandleOnCanvas(n.data as Record<string, unknown>, defs);
    return { ...n, data: { ...n.data, _showErrorHandle: show } };
  });
}

function stripDisabledErrorEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const defs = startFloErrorDefaults(nodes);
  return nodes.reduce(
    (eds, n) => (n.type === 'startNode' || n.type === 'endNode')
      ? eds
      : stripErrorEdgesForNode(n.id, n.data as Record<string, unknown>, eds, defs),
    edges,
  );
}

/** Shared wiring rules for new connections and reconnecting an existing edge. */
function isValidFlowConnection(
  connection: Connection,
  edges: Edge[],
  nodes: Node[],
  ignoreEdgeId?: string,
): boolean {
  const { source, target, sourceHandle } = connection;
  if (!source || !target || source === target) return false;

  const others = ignoreEdgeId ? edges.filter(e => e.id !== ignoreEdgeId) : edges;

  // One outgoing edge per outbound port (node + sourceHandle). FloSwitch routes are separate ports.
  const hasOutgoing = others.some(
    e => e.source === source && e.sourceHandle === (sourceHandle ?? null),
  );
  if (hasOutgoing) return false;

  const srcNode = nodes.find(n => n.id === source);
  const tgtNode = nodes.find(n => n.id === target);
  if (!srcNode || !tgtNode) return false;

  if (!compartmentsCompatible(
    { id: srcNode.id, type: srcNode.type ?? '', data: srcNode.data as Record<string, unknown> },
    { id: tgtNode.id, type: tgtNode.type ?? '', data: tgtNode.data as Record<string, unknown> },
  )) {
    return false;
  }

  if ((sourceHandle ?? '') === ERROR_HANDLE) {
    if (!(srcNode.data as Record<string, unknown>)._showErrorHandle) return false;
  }

  return true;
}

// ── New Flow Modal ────────────────────────────────────────────────────────────
interface NewFlowModalProps {
  open:     boolean;
  onClose:  () => void;
  onCreate: (form: NewFloForm) => Promise<void>;
}

const NewFlowModal: React.FC<NewFlowModalProps> = ({ open, onClose, onCreate }) => {
  const [form,   setForm]   = useState<NewFloForm>({ name: '', shortCode: '', integrationId: '' });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  if (!open) return null;

  const handleShortCodeChange = (sc: string) => {
    const clean = sc.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setForm(f => ({
      ...f,
      shortCode:     clean,
      integrationId: (f.integrationId === '' || f.integrationId === `fl-${f.shortCode.toLowerCase()}`)
        ? `fl-${clean.toLowerCase()}`
        : f.integrationId,
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim())          { setError('Name is required');           return; }
    if (!form.shortCode.trim())     { setError('Short code is required');     return; }
    if (!form.integrationId.trim()) { setError('Integration ID is required'); return; }
    setSaving(true);
    setError('');
    try {
      await onCreate(form);
      setForm({ name: '', shortCode: '', integrationId: '' });
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create flow');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalOverlay}>
      <div style={modalBox}>
        <div style={modalHeader}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#f0f0f4' }}>New Flow</span>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        {error && <div style={errBox}>{error}</div>}
        <div style={fieldGroup}>
          <label style={fieldLabel}>Flow Name *</label>
          <input style={fieldInput} placeholder="e.g. Employee Sync"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div style={fieldGroup}>
          <label style={fieldLabel}>Short Code * <span style={{ color: '#3a3a50' }}>(uppercase, no spaces)</span></label>
          <input style={fieldInput} placeholder="e.g. EMP-SYNC"
            value={form.shortCode} onChange={e => handleShortCodeChange(e.target.value)} />
        </div>
        <div style={fieldGroup}>
          <label style={fieldLabel}>Integration ID * <span style={{ color: '#3a3a50' }}>(auto-filled, override if needed)</span></label>
          <input style={fieldInput} placeholder="e.g. fl-emp-sync"
            value={form.integrationId}
            onChange={e => setForm(f => ({ ...f, integrationId: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose}      style={btnGhostSm}  disabled={saving}>Cancel</button>
          <button onClick={handleSubmit} style={btnCreateSm} disabled={saving}>
            {saving ? 'Creating…' : 'Create Flow'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const DesignerInner: React.FC<DesignerProps> = ({
  hubId, tenantId, tenantType: _tenantType, userId, userRole, workspaceIds, floId, isAdmin = false,
  permissions = [], onSignOut,
  onActiveFloChange,
}) => {
  const functions = getFunctions();

  // ── State ──────────────────────────────────────────────────────────────────
  const {
    allWorkspaces,
    activeWs,
    loading: wsLoading,
    switchWorkspace,
    createWorkspace,
    renameWorkspace,
    setDefaultWorkspace,
  } = useDeveloperWorkspaces(hubId, tenantId, userId, workspaceIds);

  const [view, setViewRaw] = useState<TenantViewId>(() =>
    readTenantUiState(hubId, tenantId).view ?? 'designer',
  );
  const setView = useCallback((next: TenantViewId) => {
    setViewRaw(next);
    writeTenantUiState(hubId, tenantId, { view: next });
  }, [hubId, tenantId]);
  const [userInfo,       setUserInfo]                    = useState({ displayName: '', email: '' });

  const [nodes,          setNodes,        onNodesChange] = useNodesState<Node>(makeDefaultNodes());
  const [edges,          setEdges,        onEdgesChange] = useEdgesState<Edge>([]);
  const [rfInstance,     setRfInstance]                  = useState<ReactFlowInstance | null>(null);
  const pendingViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const pendingFitView = useRef(false);
  const uiRestoredRef = useRef(false);
  const [selectedNode,   setSelectedNode]                = useState<Node | null>(null);
  const [nodeContextMenu, setNodeContextMenu]            = useState<NodeContextMenuState | null>(null);
  const [nodeQuickHelp,   setNodeQuickHelp]              = useState<NodeQuickHelpState | null>(null);
  const [inspectorExpanded, setInspectorExpanded]        = useState(false);
  const [paletteWidth, setPaletteWidth]                  = useState(128);
  const [activeFlo,     setActiveFlo]                  = useState<FloMeta | null>(null);
  const [flos,          setFlos]                       = useState<FloMeta[]>([]);
  const [saving,         setSaving]                      = useState(false);
  const [autoSaving,     setAutoSaving]                  = useState(false);
  const [draftSavedFingerprint, setDraftSavedFingerprint] = useState<string | null>(null);
  const [draftLoadAlert, setDraftLoadAlert] = useState<{ floName: string; publishedVersion?: number } | null>(null);
  const [statusMsg,      setStatusMsg]                   = useState('');
  const [newFlowModalOpen, setNewFlowModalOpen]          = useState(false);
  const [runModalOpen,     setRunModalOpen]              = useState(false);
  const [running,          setRunning]                   = useState(false);
  const [runResult,        setRunResult]                 = useState<RunResult | null>(null);
  const [alertsOpen,       setAlertsOpen]                = useState(false);
  const [isHubAdmin,       setIsHubAdmin]                  = useState(false);
  const [plugs,            setPlugs]                     = useState<PlugConfig[]>([]);
  const [connections,      setConnections]               = useState<FloConnectionSafe[]>([]);
  const [resourcesLoaded,  setResourcesLoaded]           = useState(false);
  const [floActions,       setFloActions]               = useState<FloActionPaletteItem[]>([]);
  const [testingNodeId,    setTestingNodeId]               = useState<string | null>(null);
  const lastRunInputRef    = useRef<Record<string, unknown>>({});
  const floActionNodeMap   = useRef<Map<string, HubActionNodeDoc>>(new Map());
  

  // Branding — logo URL + display name loaded from hub doc
  const [hubLogoUrl,  setHubLogoUrl]  = useState<string>('');
  const [hubName,     setHubName]     = useState<string>('FloPlug');

  const wrapperRef = useRef<HTMLDivElement>(null);
  const nodesRef   = useRef<Node[]>(nodes);
  const edgesRef   = useRef<Edge[]>(edges);
  const pendingFloIdRef = useRef<string | null>(null);
  const publishedBaselineRef = useRef<string | null>(null);
  const reconnectingEdgeId = useRef<string | null>(null);
  const canvasHistory = useCanvasHistory();
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  /** Apply pending pan/zoom after nodes are on canvas (fixes refresh / flow switch). */
  useEffect(() => {
    if (!rfInstance || nodes.length === 0) return;
    if (pendingViewport.current) {
      const vp = pendingViewport.current;
      pendingViewport.current = null;
      restoreCanvasViewport(rfInstance, clampCanvasViewport(vp), nodes, wrapperRef.current);
      pendingFitView.current = false;
      return;
    }
    if (pendingFitView.current) {
      pendingFitView.current = false;
      fitCanvasToFlow(rfInstance);
    }
  }, [rfInstance, nodes, activeFlo?.id]);

  useEffect(() => {
    onActiveFloChange?.(activeFlo);
  }, [activeFlo, onActiveFloChange]);

  /** Restore last workspace after refresh (session UI state). */
  useEffect(() => {
    if (wsLoading || uiRestoredRef.current || allWorkspaces.length === 0) return;
    uiRestoredRef.current = true;
    const ui = readTenantUiState(hubId, tenantId);
    if (ui.activeWorkspaceId) {
      const ws = allWorkspaces.find(w => w.id === ui.activeWorkspaceId);
      if (ws && ws.id !== activeWs?.id) switchWorkspace(ws);
    }
  }, [wsLoading, allWorkspaces, activeWs, hubId, tenantId, switchWorkspace]);

  const onViewportMoveEnd = useCallback((
    _event: unknown,
    viewport: { x: number; y: number; zoom: number },
  ) => {
    if (!activeFlo || !activeWs) return;
    writeCanvasViewport(hubId, tenantId, activeWs.id, activeFlo.id, clampCanvasViewport(viewport));
  }, [hubId, tenantId, activeFlo, activeWs]);

  const validationResources = useMemo(() => {
    const plugIds = new Set(plugs.map(p => p.id));
    const activePlugIds = new Set(
      plugs.filter(p => p.isActive !== false).map(p => p.id),
    );
    const connectionIds = new Set(connections.map(c => c.id));
    const activeConnectionIds = new Set(
      connections.filter(c => c.isActive !== false).map(c => c.id),
    );
    const plugConnectionPolicy: Record<string, { allowedConnectionIds: string[]; defaultConnectionId?: string }> = {};
    for (const p of plugs) {
      const allowed = p.allowedConnectionIds?.length
        ? p.allowedConnectionIds
        : (p.connectionId ? [p.connectionId] : []);
      plugConnectionPolicy[p.id] = {
        allowedConnectionIds: allowed,
        defaultConnectionId:  p.defaultConnectionId ?? p.connectionId,
      };
    }
    const connectionsById: Record<string, {
      urlTokenValues?: Record<string, string>;
      hostname?: string;
      tenantKey?: string;
      baseUrl?: string;
    }> = {};
    for (const c of connections) {
      connectionsById[c.id] = {
        urlTokenValues: c.urlTokenValues,
        hostname:       c.hostname,
        tenantKey:      c.tenantKey,
        baseUrl:        c.baseUrl,
      };
    }
    return { plugIds, activePlugIds, connectionIds, activeConnectionIds, plugConnectionPolicy, connectionsById };
  }, [plugs, connections]);

  const nodesForValidation = useMemo(() => {
    return nodes.map(n => {
      if (n.type !== 'floActionNode') return n;
      const floKitId = n.data?.floKitId as string | undefined;
      if (!floKitId) return n;
      const liveDoc = floActionNodeMap.current.get(floKitId);
      if (!liveDoc) return n;
      return {
        ...n,
        data: {
          ...n.data,
          kitUrlContext: liveDoc.kitUrlContext ?? n.data?.kitUrlContext,
          urlTokensSnapshot: liveDoc.urlTokensSnapshot ?? n.data?.urlTokensSnapshot,
          floActionUrlValuesByConnection:
            liveDoc.floActionUrlValuesByConnection ?? n.data?.floActionUrlValuesByConnection,
          floActionNodeUrlTokens: liveDoc.floActionNodeUrlTokens ?? n.data?.floActionNodeUrlTokens,
        },
      };
    });
  }, [nodes, floActions]);

  const validationReport = useMemo((): FloValidationReport => {
    if (!activeFlo) {
      return {
        validatedAt: new Date().toISOString(),
        nodeSnapshots: [],
        errors: [],
        warnings: [],
        infos: [],
        canSave: true,
        canPublish: false,
        canRunProduction: false,
      };
    }
    return validateFloGraph({
      floId:   activeFlo.id,
      floName: activeFlo.name,
      nodes:   sanitizeNodes(nodesForValidation) as { id: string; type: string; data: Record<string, unknown> }[],
      edges:   sanitizeEdges(edgesRef.current) as { source: string; target: string }[],
      resources: validationResources,
      checkResources: resourcesLoaded,
    });
  }, [nodesForValidation, edges, activeFlo, validationResources, resourcesLoaded]);

  const displayNodes = useMemo(() => {
    const errorIds = new Set(validationReport.errors.map(e => e.nodeId));
    const warnIds  = new Set(validationReport.warnings.map(w => w.nodeId));
    return nodes.map(n => {
      let cls = '';
      if (errorIds.has(n.id)) cls = 'fp-node-validation-error';
      else if (warnIds.has(n.id)) cls = 'fp-node-validation-warning';
      return cls ? { ...n, className: cls } : n;
    });
  }, [nodes, validationReport]);

  const hasUnpublishedChanges = useMemo(() => {
    const fp = canvasFingerprint(nodes, edges);
    if (publishedBaselineRef.current === null) return true;
    return fp !== publishedBaselineRef.current;
  }, [nodes, edges, activeFlo?.id, activeFlo?.publishState]);

  /** Canvas differs from last draft write to Firestore (Save / auto-save baseline). */
  const hasDraftChanges = useMemo(() => {
    if (!activeFlo) return false;
    const fp = canvasFingerprint(nodes, edges);
    if (draftSavedFingerprint === null) return true;
    return fp !== draftSavedFingerprint;
  }, [nodes, edges, activeFlo, draftSavedFingerprint]);

  const canPublish = Boolean(activeFlo)
    && hasUnpublishedChanges
    && validationReport.errors.length === 0;

  const focusValidationNode = useCallback((nodeId: string) => {
    const n = nodesRef.current.find(x => x.id === nodeId);
    if (!n) return;
    setSelectedNode(n);
    rfInstance?.setCenter(n.position.x + 80, n.position.y + 40, { zoom: 1.1, duration: 300 });
  }, [rfInstance]);

  const handleWorkspaceChange = useCallback((wsId: string) => {
    const ws = allWorkspaces.find(w => w.id === wsId);
    if (!ws) return;
    switchWorkspace(ws);
    writeTenantUiState(hubId, tenantId, { activeWorkspaceId: ws.id, activeFloId: undefined });
    setActiveFlo(null);
    setFlos([]);
    setDraftLoadAlert(null);
    setRunResult(null);
    setSelectedNode(null);
  }, [allWorkspaces, switchWorkspace, hubId, tenantId]);

  const handleSetDefaultFlo = useCallback(async (floId: string) => {
    if (!activeWs) return;
    await setDefaultFloForWorkspace(hubId, tenantId, activeWs.id, floId);
    setFlos(prev => prev.map(f => ({ ...f, defaultToLoad: f.id === floId })));
    setActiveFlo(prev => (prev ? { ...prev, defaultToLoad: prev.id === floId } : prev));
  }, [hubId, tenantId, activeWs]);

  const handleMoveFlo = useCallback(async (targetWsId: string) => {
    if (!activeFlo || !activeWs || targetWsId === activeWs.id) return;
    const floId = activeFlo.id;
    await moveFloToWorkspace(hubId, tenantId, floId, activeWs.id, targetWsId);
    setFlos(prev => prev.filter(f => f.id !== floId));
    pendingFloIdRef.current = floId;
    const targetWs = allWorkspaces.find(w => w.id === targetWsId);
    if (targetWs) {
      switchWorkspace(targetWs);
      writeTenantUiState(hubId, tenantId, {
        activeWorkspaceId: targetWs.id,
        activeFloId: floId,
      });
    }
    setStatusMsg('Flo moved ✓');
    setTimeout(() => setStatusMsg(''), 2000);
  }, [activeFlo, activeWs, allWorkspaces, hubId, tenantId, switchWorkspace]);

  // ── Derive isHubAdmin from Firebase auth token ─────────────────────────────
  // Never trust the isAdmin prop alone; validate against the actual custom claim.
  useEffect(() => {
    const auth = getAuth();
    auth.currentUser?.getIdTokenResult().then(result => {
      const fromToken = result.claims.isHubAdmin === true;
      setIsHubAdmin(fromToken);
      const cu = auth.currentUser;
      setUserInfo({ displayName: cu?.displayName ?? '', email: cu?.email ?? '' });
    }).catch(err => {
      console.warn('[Designer] getIdTokenResult failed:', err);
      setIsHubAdmin(false);
    });
  }, []);

  // ── Load hub branding ──────────────────────────────────────────────────────
  useEffect(() => {
    const loadHubMeta = async () => {
      try {
        const hubDoc = await getDoc(doc(db, COLLECTIONS.HUBS, hubId));
        if (hubDoc.exists()) {
          const data = hubDoc.data();
          if (data.logoUrl)     setHubLogoUrl(data.logoUrl);
          if (data.displayName) setHubName(data.displayName);
          else if (data.name)   setHubName(data.name);
        }
      } catch (err) {
        console.warn('[Designer] loadHubMeta error:', err);
      }
    };
    loadHubMeta();
  }, [hubId]);

  const recordCanvasHistory = useCallback(() => {
    canvasHistory.pushSnapshot(nodesRef.current, edgesRef.current);
  }, [canvasHistory]);

  // ── Load plugs + connections for validation & palette ─────────────────────
  useEffect(() => {
    let cancelled = false;
    const loadResources = async () => {
      setResourcesLoaded(false);
      try {
        const [plugSnap, connRes] = await Promise.all([
          getDocs(query(
            collection(db, 'FloPlugHubs', hubId, 'Tenants', tenantId, 'Plugs'),
            orderBy('createdAt', 'desc'),
          )),
          httpsCallable<
            { hubId: string; tenantId: string },
            { connections: FloConnectionSafe[] }
          >(functions, 'getFloConnections')({ hubId, tenantId }),
        ]);
        if (cancelled) return;
        const list = plugSnap.docs.map(d => ({ id: d.id, ...d.data() } as PlugConfig));
        setPlugs(list);
        setConnections(connRes.data.connections ?? []);
        setResourcesLoaded(true);
        console.log(`[Designer] Loaded ${list.length} plugs, ${connRes.data.connections?.length ?? 0} connections`);
      } catch (err) {
        console.warn('[Designer] loadResources error:', err);
        if (!cancelled) setResourcesLoaded(true);
      }
    };
    loadResources();
    return () => { cancelled = true; };
  }, [hubId, tenantId, functions]);

  // Re-hydrate plug nodes when plug catalog loads (allowed connections from hub admin)
  useEffect(() => {
    if (!plugs.length) return;
    setNodes(prev => prev.map(n => {
      if (n.type !== 'plugNode') return n;
      const plugId = n.data?.plugId as string | undefined;
      const livePlug = plugId ? plugs.find(p => p.id === plugId) : undefined;
      if (!livePlug) return n;
      const allowed = livePlug.allowedConnectionIds?.length
        ? livePlug.allowedConnectionIds
        : (livePlug.connectionId ? [livePlug.connectionId] : []);
      const defaultConn = livePlug.defaultConnectionId ?? livePlug.connectionId ?? allowed[0] ?? '';
      return {
        ...n,
        data: {
          ...n.data,
          allowedConnectionIds: allowed,
          defaultConnectionId:  defaultConn,
          connectionId: (n.data.connectionId as string) || defaultConn,
          urlPattern:     livePlug.urlPattern,
          variableHints:  livePlug.variableHints ?? [],
          plugUrlValuesByConnection: livePlug.plugUrlValuesByConnection ?? {},
          plugNodeUrlTokens: livePlug.plugNodeUrlTokens ?? [],
          urlTokensSnapshot: livePlug.urlTokensSnapshot ?? [],
        },
      };
    }));
  }, [plugs, setNodes]);

  // ── Load FloActions for palette (developer-enabled hub action nodes) ───────
  useEffect(() => {
    const loadFloActions = async () => {
      try {
        const cf = httpsCallable<
          { hubId: string; tenantId: string },
          { nodes: HubActionNodeDoc[] }
        >(functions, 'getHubActionNodes');
        const res = await cf({ hubId, tenantId });
        const docs = res.data.nodes ?? [];

        // Build ref map immediately — keyed by floKitId
        // Using a ref (not state) so openFlow can read it synchronously
        const nextMap = new Map<string, HubActionNodeDoc>();
        for (const d of docs) nextMap.set(d.floKitId, d);
        floActionNodeMap.current = nextMap;

        // Palette items for the drag source
        setFloActions(docs.map(toFloActionPaletteItem));
        console.log(`[Designer] Loaded ${docs.length} FloActionNodes into map + palette`);

        // Re-hydrate any floActionNodes already on canvas that lost the race
        // (openFlow ran before this CF returned → arrays were empty)
        setNodes(prev => prev.map(n => {
          if (n.type !== 'floActionNode') return n;
          const liveDoc = nextMap.get(n.data.floKitId as string);
          if (!liveDoc) return n;
          return {
            ...n,
            data: {
              ...n.data,
              actionIds:            liveDoc.actionIds            ?? [],
              allowedConnectionIds: liveDoc.allowedConnectionIds ?? [],
              defaultConnectionId:  liveDoc.defaultConnectionId  ?? '',
              templateActionId:     liveDoc.templateActionId     ?? liveDoc.actionIds?.[0] ?? '',
              connectorId:          liveDoc.connectorId,
              flaLabel:             liveDoc.displayName,
              urlTokensSnapshot:    liveDoc.urlTokensSnapshot ?? [],
              kitUrlContext:        liveDoc.kitUrlContext ?? {},
              floActionUrlValuesByConnection: liveDoc.floActionUrlValuesByConnection ?? {},
              floActionNodeUrlTokens: liveDoc.floActionNodeUrlTokens ?? [],
              connectionId: (n.data.connectionId as string) || liveDoc.defaultConnectionId || liveDoc.allowedConnectionIds?.[0] || '',
              actionId:     (n.data.actionId     as string) || liveDoc.templateActionId    || liveDoc.actionIds?.[0]            || '',
            },
          };
        }));
        // Patch selectedNode too if it's a floActionNode
        setSelectedNode(prev => {
          if (!prev || prev.type !== 'floActionNode') return prev;
          const liveDoc = nextMap.get(prev.data.floKitId as string);
          if (!liveDoc) return prev;
          return {
            ...prev,
            data: {
              ...prev.data,
              actionIds:            liveDoc.actionIds            ?? [],
              allowedConnectionIds: liveDoc.allowedConnectionIds ?? [],
              defaultConnectionId:  liveDoc.defaultConnectionId  ?? '',
              templateActionId:     liveDoc.templateActionId     ?? liveDoc.actionIds?.[0] ?? '',
              connectorId:          liveDoc.connectorId,
              flaLabel:             liveDoc.displayName,
              urlTokensSnapshot:    liveDoc.urlTokensSnapshot ?? [],
              kitUrlContext:        liveDoc.kitUrlContext ?? {},
              floActionUrlValuesByConnection: liveDoc.floActionUrlValuesByConnection ?? {},
              floActionNodeUrlTokens: liveDoc.floActionNodeUrlTokens ?? [],
              connectionId: (prev.data.connectionId as string) || liveDoc.defaultConnectionId || '',
              actionId:     (prev.data.actionId     as string) || liveDoc.templateActionId    || liveDoc.actionIds?.[0] || '',
            },
          };
        });
      } catch (err) {
        console.warn('[Designer] loadFloActions error:', err);
      }
    };
    loadFloActions();
  }, [hubId, tenantId, functions]);

  // ── Load flos when workspace changes — open workspace default flo ───────────
  useEffect(() => {
    if (!activeWs) return;
    const loadFlows = async () => {
      try {
        const snap = await getDocs(
          query(flosCol(hubId, tenantId, activeWs.id), orderBy('createdAt', 'desc')),
        );
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as FloMeta));
        setFlos(list);

        const pendingId = pendingFloIdRef.current;
        pendingFloIdRef.current = null;

        const ui = readTenantUiState(hubId, tenantId);
        const target = pendingId
          ? list.find(f => f.id === pendingId)
          : floId
            ? list.find(f => f.id === floId)
            : ui.activeFloId && ui.activeWorkspaceId === activeWs.id
              ? list.find(f => f.id === ui.activeFloId)
              : list.find(f => f.defaultToLoad) ?? list[0];

        if (target) openFlow(target);
        else { setNodes(makeDefaultNodes()); setEdges([]); setActiveFlo(null); }
      } catch (err) {
        console.error('[Designer] loadFlows error:', err);
      }
    };
    loadFlows();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWs?.id, hubId, tenantId]);

  // ── updateNodeData / deleteNode ────────────────────────────────────────────
  const updateNodeData = useCallback((nodeId: string, patch: Record<string, unknown>) => {
    const prev = nodesRef.current;
    const isStart = prev.find(n => n.id === nodeId)?.type === 'startNode';
    const touchesCatch = 'catchErrorScope' in patch || ('floErrorDefaults' in patch && isStart);

    let nextNodes = prev.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
    );

    if (touchesCatch) {
      const defs = startFloErrorDefaults(nextNodes);
      nextNodes = attachErrorHandleFlags(nextNodes, defs);
      setNodes(nextNodes);
      if ('catchErrorScope' in patch) {
        const node = nextNodes.find(n => n.id === nodeId);
        if (node) {
          setEdges(eds => stripErrorEdgesForNode(
            nodeId, node.data as Record<string, unknown>, eds, defs,
          ));
        }
      } else {
        setEdges(eds => stripDisabledErrorEdges(nextNodes, eds));
      }
    } else {
      setNodes(nextNodes);
    }

    setSelectedNode(sel => {
      if (sel?.id !== nodeId) return sel;
      return nextNodes.find(n => n.id === nodeId) ?? { ...sel, data: { ...sel.data, ...patch } };
    });
  }, [setNodes, setEdges]);

  const floList = useMemo(
    () => flos.map(f => ({ id: f.id, name: f.name })),
    [flos],
  );

  const testNode = useCallback(async (nodeId: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node || node.type === 'startNode' || node.type === 'endNode') return;

    setTestingNodeId(nodeId);
    updateNodeData(nodeId, { _loading: true, _result: 'Running…', _isError: false });

    try {
      if (await testConnectorNode(functions, hubId, tenantId, node, updateNodeData)) {
        return;
      }
      if (await testPlugNode(functions, hubId, tenantId, node, updateNodeData)) {
        return;
      }
      if (await testFloActionNode(functions, hubId, tenantId, node, updateNodeData)) {
        return;
      }

      const rawTestInput = String((node.data as Record<string, unknown>).testInputJson ?? DEFAULT_NODE_TEST_INPUT);
      const parsedInput = parseNodeTestInput(rawTestInput);
      if (parsedInput.ok === false) {
        updateNodeData(nodeId, { _loading: false, _result: parsedInput.error, _isError: true });
        return;
      }

      if (!activeFlo) {
        updateNodeData(nodeId, {
          _loading: false,
          _result: 'Open a flow to test transform/logic nodes, or use connector/plug test.',
          _isError: true,
        });
        return;
      }

      const subgraphNodes = nodesForNodeTest(nodesRef.current, edgesRef.current, nodeId);
      const ids = new Set(subgraphNodes.map(n => n.id));
      const subgraphEdges = edgesForNodeTest(edgesRef.current, ids);

      const fn = httpsCallable<
        { hubId: string; tenantId: string; wsId: string; floId: string;
          nodes: Node[]; edges: Edge[]; inputJson: Record<string, unknown>;
          mode?: 'test' | 'production'; source?: string; },
        { log: string[]; status: string; output: Record<string, unknown> | null }
      >(functions, 'executeFlo');

      const res = await fn({
        hubId, tenantId,
        wsId:   activeWs?.id ?? '',
        floId:  activeFlo.id,
        nodes:  sanitizeNodes(subgraphNodes) as unknown as Node[],
        edges:  sanitizeEdges(subgraphEdges) as unknown as Edge[],
        inputJson: parsedInput.value,
        mode:      'test',
        source:    'nodeTest',
      });

      const log = res.data.log ?? [];
      const snippet = log.slice(-8).join('\n');
      const hasError = res.data.status === 'error' || log.some(l => l.startsWith('Error'));
      updateNodeData(nodeId, {
        _loading: false,
        _result: hasError ? snippet : `✓ Test complete\n${snippet}`,
        _isError: hasError,
      });
    } catch (err: any) {
      updateNodeData(nodeId, {
        _loading: false,
        _result: err.message ?? String(err),
        _isError: true,
      });
    } finally {
      setTestingNodeId(null);
    }
  }, [activeFlo, activeWs, functions, hubId, tenantId, updateNodeData]);

  const floErrorDefaults = useMemo(
    () => startFloErrorDefaults(nodes),
    [nodes],
  );

  const inspectorCtx: DesignerInspectorContext = useMemo(() => ({
    functions,
    hubId,
    tenantId,
    flos:          floList,
    activeFloId:   activeFlo?.id ?? null,
    nodes,
    edges,
    lastRunInput:  lastRunInputRef.current,
    onTestNode:    testNode,
    testingNodeId,
    floErrorDefaults,
    floActions,
    getHubActionDoc: (floKitId: string) => floActionNodeMap.current.get(floKitId),
  }), [functions, hubId, tenantId, floList, activeFlo?.id, nodes, edges, testNode, testingNodeId, floErrorDefaults, floActions]);

  const deleteNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node?.type === 'startNode' || node?.type === 'endNode') return;
    recordCanvasHistory();
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(prev => prev?.id === nodeId ? null : prev);
    setNodeContextMenu(null);
    setNodeQuickHelp(prev => (prev?.nodeId === nodeId ? null : prev));
  }, [setNodes, setEdges, recordCanvasHistory]);

  const removeNodeWiring = useCallback((nodeId: string, direction: 'inbound' | 'outbound') => {
    recordCanvasHistory();
    setEdges(prev => prev.filter(e =>
      direction === 'inbound' ? e.target !== nodeId : e.source !== nodeId,
    ));
    setNodeContextMenu(null);
  }, [setEdges, recordCanvasHistory]);

  const hydrateCanvasNodes = useCallback((savedNodes: Node[]): Node[] => {
    const hydrated = savedNodes.map(n => {
      const legacyData = { ...n.data } as Record<string, unknown>;
      if (n.type === 'subFloNode' && !legacyData.displayName && legacyData.canvasName) {
        legacyData.displayName = legacyData.canvasName;
      }

      const baseData = {
        ...legacyData,
        hubId,
        tenantId,
        onUpdate:       updateNodeData,
        onDelete:       deleteNode,
        availablePlugs: plugs.filter(p =>
          p.isActive !== false
          && (p.connectorId === n.type || p.connectorId === 'genericNode')
        ),
        ...(n.type === 'plugNode' ? {
          _placeholders: getPlugPlaceholders(n.data?.category as string),
        } : {}),
        availableFlos: flos.map(f => ({ id: f.id, name: f.name })),
      };

      if (n.type === 'plugNode') {
        const plugId = n.data?.plugId as string | undefined;
        const livePlug = plugId ? plugs.find(p => p.id === plugId) : undefined;
        if (livePlug) {
          const allowed = livePlug.allowedConnectionIds?.length
            ? livePlug.allowedConnectionIds
            : (livePlug.connectionId ? [livePlug.connectionId] : []);
          const defaultConn = livePlug.defaultConnectionId ?? livePlug.connectionId ?? allowed[0] ?? '';
          return {
            ...n,
            ...(n.width  != null ? { width:  n.width  } : {}),
            ...(n.height != null ? { height: n.height } : {}),
            data: {
              ...baseData,
              plugId:               livePlug.id,
              plugName:             livePlug.name,
              urlPattern:           livePlug.urlPattern,
              variableHints:        livePlug.variableHints ?? [],
              plugUrlValuesByConnection: livePlug.plugUrlValuesByConnection ?? {},
              plugNodeUrlTokens:    livePlug.plugNodeUrlTokens ?? [],
              urlTokensSnapshot:    livePlug.urlTokensSnapshot ?? [],
              authProtocol:         livePlug.authProtocol,
              connectorId:          livePlug.connectorId,
              connectorLabel:     livePlug.connectorLabel,
              allowedConnectionIds: allowed,
              defaultConnectionId:  defaultConn,
              connectionId: (n.data?.connectionId as string) || defaultConn,
            },
          };
        }
      }

      if (n.type === 'floActionNode') {
        const liveDoc = floActionNodeMap.current.get(n.data?.floKitId as string);
        if (liveDoc) {
          return {
            ...n,
            ...(n.width  != null ? { width:  n.width  } : {}),
            ...(n.height != null ? { height: n.height } : {}),
            data: {
              ...baseData,
              actionIds:            liveDoc.actionIds            ?? [],
              allowedConnectionIds: liveDoc.allowedConnectionIds ?? [],
              defaultConnectionId:  liveDoc.defaultConnectionId  ?? '',
              templateActionId:     liveDoc.templateActionId     ?? liveDoc.actionIds?.[0] ?? '',
              connectorId:          liveDoc.connectorId,
              flaLabel:             liveDoc.displayName,
              floKitId:             liveDoc.floKitId,
              urlTokensSnapshot:    liveDoc.urlTokensSnapshot ?? [],
              kitUrlContext:        liveDoc.kitUrlContext ?? {},
              floActionUrlValuesByConnection: liveDoc.floActionUrlValuesByConnection ?? {},
              floActionNodeUrlTokens: liveDoc.floActionNodeUrlTokens ?? [],
              connectionId: (n.data?.connectionId as string) || liveDoc.defaultConnectionId || liveDoc.allowedConnectionIds?.[0] || '',
              actionId:     (n.data?.actionId     as string) || liveDoc.templateActionId    || liveDoc.actionIds?.[0]            || '',
            },
          };
        }
        return {
          ...n,
          ...(n.width  != null ? { width:  n.width  } : {}),
          ...(n.height != null ? { height: n.height } : {}),
          data: {
            ...baseData,
            actionIds:            (n.data?.actionIds            as string[]) ?? [],
            allowedConnectionIds: (n.data?.allowedConnectionIds as string[]) ?? [],
            defaultConnectionId:  (n.data?.defaultConnectionId  as string)  ?? '',
          },
        };
      }

      return {
        ...n,
        ...(n.width  != null ? { width:  n.width  } : {}),
        ...(n.height != null ? { height: n.height } : {}),
        data: baseData,
      };
    });
    return attachErrorHandleFlags(hydrated);
  }, [hubId, tenantId, updateNodeData, deleteNode, plugs, flos]);

  const applyCanvasSnapshot = useCallback((snap: CanvasSnapshot) => {
    setNodes(hydrateCanvasNodes(normalizeLoadedNodes(snap.nodes)));
    setEdges(snap.edges.map(normalizeFlowEdge));
    setSelectedNode(null);
  }, [hydrateCanvasNodes, setNodes, setEdges]);

  const performUndo = useCallback(() => {
    const snap = canvasHistory.undo(nodesRef.current, edgesRef.current);
    if (snap) applyCanvasSnapshot(snap);
  }, [canvasHistory, applyCanvasSnapshot]);

  const performRedo = useCallback(() => {
    const snap = canvasHistory.redo(nodesRef.current, edgesRef.current);
    if (snap) applyCanvasSnapshot(snap);
  }, [canvasHistory, applyCanvasSnapshot]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const recordable = changes.some(c => c.type === 'remove' || c.type === 'add' || c.type === 'dimensions');
    if (recordable && !canvasHistory.isApplying()) {
      recordCanvasHistory();
    }
    onNodesChange(changes);
  }, [onNodesChange, canvasHistory, recordCanvasHistory]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    const recordable = changes.some(c => c.type === 'remove' || c.type === 'add');
    if (recordable && !canvasHistory.isApplying()) {
      recordCanvasHistory();
    }
    onEdgesChange(changes);
  }, [onEdgesChange, canvasHistory, recordCanvasHistory]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const el = e.target as HTMLElement | null;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        performUndo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        performRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [performUndo, performRedo]);

  // ── Open a saved flow — always loads the draft graph (never published) ───────
  const openFlow = async (flow: FloMeta) => {
    try {
      const snap = await getDoc(flowDocRef(hubId, tenantId, flow.workspaceId, flow.id));
      if (!snap.exists()) { console.warn('[Designer] openFlow: doc not found', flow); return; }

      const data = snap.data() as Record<string, unknown>;
      const draft = getDraftGraph(data);
      const published = getPublishedGraph(data);
      const inProgressDraft = hasInProgressDraft(data);
      const floName = (data.name as string) ?? flow.name;
      const publishedVersion = (data.publishedVersion as number | undefined) ?? flow.publishedVersion;
      const savedNodes = normalizeLoadedNodes((draft.nodes as Node[]) ?? []);

      const hasStart = savedNodes.some(n => n.type === 'startNode' || n.id === 'start-node');
      const hasEnd   = savedNodes.some(n => n.type === 'endNode'   || n.id === 'end-node');
      const defaults = makeDefaultNodes();
      const merged   = normalizeLoadedNodes([
        ...savedNodes,
        ...(!hasStart ? [defaults[0]] : []),
        ...(!hasEnd   ? [defaults[1]] : []),
      ]);

      const hydrated = hydrateCanvasNodes(merged);
      const loadedEdges = ((draft.edges as Edge[]) ?? []).map(normalizeFlowEdge);

      setNodes(hydrated);
      setEdges(loadedEdges);
      publishedBaselineRef.current = published
        ? canvasFingerprint(published.nodes as Node[], published.edges as Edge[])
        : null;
      setDraftSavedFingerprint(canvasFingerprint(hydrated, loadedEdges));
      canvasHistory.resetHistory();
      setActiveFlo({
        ...flow,
        name:          floName,
        shortCode:     (data.shortCode as string) ?? flow.shortCode,
        integrationId: (data.integrationId as string) ?? flow.integrationId,
        publishState:  (data.publishState as FloMeta['publishState']) ?? flow.publishState,
        publishedVersion,
        hasUnpublishedChanges: inProgressDraft
          || ((data.hasUnpublishedChanges as boolean | undefined) ?? flow.hasUnpublishedChanges),
        validationStatus: (data.validationStatus as FloMeta['validationStatus']) ?? flow.validationStatus,
      });
      setDraftLoadAlert(inProgressDraft
        ? { floName, publishedVersion }
        : null);
      setSelectedNode(null);
      setRunResult(null);

      writeTenantUiState(hubId, tenantId, {
        activeFloId: flow.id,
        activeWorkspaceId: flow.workspaceId,
      });

      const firestoreViewport = draft.viewport ?? (
        data.viewport as { x: number; y: number; zoom: number } | undefined
      );
      const sessionViewport = readCanvasViewport(hubId, tenantId, flow.workspaceId, flow.id);
      const rawViewport = firestoreViewport ?? sessionViewport ?? null;
      const viewportToApply = rawViewport ? clampCanvasViewport(rawViewport) : null;

      pendingViewport.current = viewportToApply;
      pendingFitView.current = !viewportToApply;

      if (rfInstance && hydrated.length > 0) {
        if (viewportToApply) {
          pendingViewport.current = null;
          restoreCanvasViewport(rfInstance, viewportToApply, hydrated, wrapperRef.current);
          pendingFitView.current = false;
        } else {
          pendingFitView.current = false;
          fitCanvasToFlow(rfInstance);
        }
      }
    } catch (err) {
      console.error('[Designer] openFlow error:', err);
    }
  };

  // ── Create a new flow ───────────────────────────────────────────────────────
  const handleCreateFlow = async (form: NewFloForm) => {
    if (!activeWs) return;
    const defaults = makeDefaultNodes();

    const newDocRef = await addDoc(flosCol(hubId, tenantId, activeWs.id), {
      name:          form.name,
      shortCode:     form.shortCode,
      integrationId: form.integrationId,
      ownerUid:      userId,
      workspaceId:   activeWs.id,
      hubId,
      tenantId,
      draft: {
        nodes:         sanitizeNodes(defaults),
        edges:         [],
      },
      publishedVersion:      0,
      hasUnpublishedChanges: true,
      publishState:          'draft',
      nodes:         sanitizeNodes(defaults),
      edges:         [],
      status:        'idle',
      isDefault:     false,
      defaultToLoad: false,
      createdAt:     serverTimestamp(),
      updatedAt:     serverTimestamp(),
    });
    await setDoc(newDocRef, { id: newDocRef.id }, { merge: true });

    const meta: FloMeta = {
      id:            newDocRef.id,
      name:          form.name,
      shortCode:     form.shortCode,
      integrationId: form.integrationId,
      workspaceId:   activeWs.id,
      status:        'idle',
      isDefault:     false,
      defaultToLoad: false,
    };
    setFlos(prev => [meta, ...prev]);
    setNodes(hydrateCanvasNodes(defaults));
    setEdges([]);
    canvasHistory.resetHistory();
    setActiveFlo(meta);
    publishedBaselineRef.current = null;
    setDraftSavedFingerprint(canvasFingerprint(defaults, []));
    setDraftLoadAlert(null);
    setSelectedNode(null);
    setRunResult(null);
    setStatusMsg('Flow created ✓');
    setTimeout(() => setStatusMsg(''), 2000);
  };

  // ── Save the current flow ───────────────────────────────────────────────────
  const saveFlo = useCallback(async (opts?: { silent?: boolean }) => {
    if (!activeFlo) return;
    const silent = opts?.silent === true;
    if (silent) setAutoSaving(true);
    else setSaving(true);
    if (!silent) setStatusMsg('Saving…');
    try {
      const cleanNodes = sanitizeNodes(nodesRef.current);
      const cleanEdges = sanitizeEdges(edgesRef.current);
      const rawVp = rfInstance?.getViewport();
      const viewport = rawVp ? clampCanvasViewport(rawVp) : undefined;

      if (viewport && activeFlo && activeWs) {
        writeCanvasViewport(hubId, tenantId, activeWs.id, activeFlo.id, viewport);
      }

      await setDoc(
        flowDocRef(hubId, tenantId, activeFlo.workspaceId, activeFlo.id),
        {
          draft: {
            nodes:         cleanNodes,
            edges:         cleanEdges,
            ...(viewport ? { viewport } : {}),
          },
          nodes:         cleanNodes,
          edges:         cleanEdges,
          ...(viewport ? { viewport } : {}),
          draftGraphHash: computeGraphHash({ nodes: cleanNodes, edges: cleanEdges }),
          hasUnpublishedChanges: true,
          name:          activeFlo.name          ?? '',
          shortCode:     activeFlo.shortCode     ?? '',
          integrationId: activeFlo.integrationId ?? '',
          ownerUid:      userId,
          updatedAt:     serverTimestamp(),
        },
        { merge: true }
      );
      const validation = validateFloGraph({
        floId:    activeFlo.id,
        floName:  activeFlo.name,
        nodes:    cleanNodes as { id: string; type: string; data: Record<string, unknown> }[],
        edges:    cleanEdges as { source: string; target: string }[],
        resources: validationResources,
        checkResources: resourcesLoaded,
      });
      await setDoc(flowDocRef(hubId, tenantId, activeFlo.workspaceId, activeFlo.id), {
        validationStatus:       validation.errors.length ? 'invalid' : (validation.warnings.length ? 'warnings' : 'valid'),
        validationErrorCount:   validation.errors.length,
        validationWarningCount: validation.warnings.length,
        lastValidatedAt:        validation.validatedAt,
      }, { merge: true });

      const fp = canvasFingerprint(cleanNodes, cleanEdges);
      setDraftSavedFingerprint(fp);
      setActiveFlo(prev => prev ? { ...prev, hasUnpublishedChanges: true } : prev);
      setFlos(prev => prev.map(f => f.id === activeFlo.id ? { ...f, hasUnpublishedChanges: true } : f));

      if (!silent) {
        if (validation.errors.length) {
          setStatusMsg(`Saved · ${validation.errors.length} validation error(s) — publish blocked`);
        } else if (validation.warnings.length) {
          setStatusMsg(`Saved ✓ · ${validation.warnings.length} warning(s)`);
        } else {
          setStatusMsg('Saved ✓');
        }
      }
    } catch (err: any) {
      console.error('[Designer] saveFlo error:', err);
      if (!silent) setStatusMsg(`Save failed: ${err.message}`);
    } finally {
      if (silent) setAutoSaving(false);
      else setSaving(false);
      if (!silent) setTimeout(() => setStatusMsg(''), 2500);
    }
  }, [activeFlo, activeWs, hubId, tenantId, userId, rfInstance, validationResources, resourcesLoaded]);

  /** Revert canvas to last published graph and persist as draft. */
  const discardDraft = useCallback(async () => {
    if (!activeFlo || !activeWs) return;
    if (!window.confirm('Discard unsaved draft changes and reload the last published version?')) return;
    setSaving(true);
    setStatusMsg('Loading published version…');
    try {
      const snap = await getDoc(flowDocRef(hubId, tenantId, activeFlo.workspaceId, activeFlo.id));
      if (!snap.exists()) return;
      const data = snap.data() as Record<string, unknown>;
      const published = getPublishedGraph(data);
      if (!published?.nodes?.length) {
        setStatusMsg('No published version to load.');
        setTimeout(() => setStatusMsg(''), 3000);
        return;
      }
      const pubNodes = hydrateCanvasNodes(normalizeLoadedNodes(published.nodes as Node[]));
      const pubEdges = ((published.edges as Edge[]) ?? []).map(normalizeFlowEdge);
      setNodes(pubNodes);
      setEdges(pubEdges);
      canvasHistory.resetHistory();
      setDraftSavedFingerprint(canvasFingerprint(pubNodes, pubEdges));
      setDraftLoadAlert(null);
      await saveFlo({ silent: true });
      setStatusMsg(
        activeFlo.publishedVersion
          ? `Loaded published v${activeFlo.publishedVersion} ✓`
          : 'Loaded published version ✓',
      );
      setTimeout(() => setStatusMsg(''), 2500);
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to discard draft');
      setTimeout(() => setStatusMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  }, [activeFlo, activeWs, hubId, tenantId, saveFlo]);

  /** Auto-save draft every 30s when there are unsaved canvas edits. */
  useEffect(() => {
    if (!activeFlo || !hasDraftChanges || saving || autoSaving) return;
    const timer = window.setInterval(() => {
      if (saving || autoSaving) return;
      void saveFlo({ silent: true });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [activeFlo?.id, hasDraftChanges, saving, autoSaving, saveFlo]);

  // ── Run the flow ────────────────────────────────────────────────────────────
  const handleRun = async (inputJson: Record<string, unknown>, runLabel?: string, dryRun = true) => {
    if (!activeFlo) return;

    if (validationReport.errors.length > 0) {
      const first = validationReport.errors[0];
      setStatusMsg(
        `Full flow run blocked (${validationReport.errors.length} error(s)). ` +
        `${first.nodeLabel}: ${first.message} — use ▶ Test node in the inspector to try one node.`,
      );
      setTimeout(() => setStatusMsg(''), 6000);
      return;
    }

    const perms = (activeFlo as any).invokePermissions as FloInvokePermissions | undefined;
    if (perms && !isHubAdmin) {
      const canRun = perms.canRunInDesigner &&
        (perms.allowedUids.includes('*') || perms.allowedUids.includes(userId) ||
         perms.allowedRoles.includes(userRole));
      if (!canRun) {
        setStatusMsg('❌ You do not have permission to run this flow');
        setTimeout(() => setStatusMsg(''), 3000);
        return;
      }
    }

    setRunning(true);
    lastRunInputRef.current = inputJson;
    try {
      const fn = httpsCallable<
        { hubId: string; tenantId: string; wsId: string; floId: string;
          nodes: Node[]; edges: Edge[]; inputJson: Record<string, unknown>;
          mode?: 'test' | 'production'; persistNodes?: boolean; source?: string; runLabel?: string;
          dryRun?: boolean; simulate?: boolean; },
        { log: string[]; status: string; output: Record<string, unknown> | null; executionId?: string; simulated?: boolean }
      >(functions, 'executeFlo');

      const res = await fn({
        hubId, tenantId,
        wsId:      activeWs?.id ?? '',
        floId:    activeFlo.id,
        nodes:     sanitizeNodes(nodesRef.current) as unknown as Node[],
        edges:     sanitizeEdges(edgesRef.current) as unknown as Edge[],
        inputJson,
        mode:      'test',
        persistNodes: true,
        source:    'designer',
        dryRun:    dryRun || undefined,
        simulate:  dryRun || undefined,
        ...(runLabel ? { runLabel } : {}),
      });

      const result: RunResult = {
        log:    res.data.log    ?? [],
        output: res.data.output ?? null,
        status: (res.data.status as RunResult['status']) ?? 'success',
        executionId: res.data.executionId,
        runLabel,
        simulated: res.data.simulated ?? dryRun,
      };
      setRunResult(result);

      if (result.output) {
        setNodes(prev => prev.map(n =>
          n.type === 'endNode'
            ? { ...n, data: { ...n.data, output: JSON.stringify(result.output, null, 2) } }
            : n
        ));
      }
    } catch (err: any) {
      console.error('[Designer] run error:', err);
      const msg = String(err?.message ?? err);
      const platform = isPlatformFailureMessage(msg);
      setRunResult({
        log:    [platform ? `Platform error: ${msg}` : `Error: ${msg}`],
        output: null,
        status: platform ? 'fatal' : 'error',
      });
    } finally {
      setRunning(false);
    }
  };

  // ── Publish ─────────────────────────────────────────────────────────────────
  const publishFlow = async () => {
    if (!activeFlo) return;
    setStatusMsg('Validating…');
    try {
      await saveFlo();
      const fn = httpsCallable<
        { hubId: string; tenantId: string; workspaceId: string; floId: string;
          nodes: Node[]; edges: Edge[] },
        { ok: boolean; validationStatus: string; publishedVersion?: number;
          report?: { errors: { message: string }[] } }
      >(functions, 'publishFlo');

      const res = await fn({
        hubId,
        tenantId,
        workspaceId: activeFlo.workspaceId,
        floId:       activeFlo.id,
        nodes:       sanitizeNodes(nodesRef.current) as unknown as Node[],
        edges:       sanitizeEdges(edgesRef.current) as unknown as Edge[],
      });

      setActiveFlo(prev => prev ? {
        ...prev,
        status: 'active',
        publishState: 'published',
        validationStatus: res.data.validationStatus as FloMeta['validationStatus'],
        publishedVersion: res.data.publishedVersion,
        hasUnpublishedChanges: false,
      } : prev);
      setFlos(prev => prev.map(f => f.id === activeFlo.id ? {
        ...f,
        status: 'active',
        publishState: 'published',
        validationStatus: res.data.validationStatus as FloMeta['validationStatus'],
        publishedVersion: res.data.publishedVersion,
        hasUnpublishedChanges: false,
      } : f));
      publishedBaselineRef.current = canvasFingerprint(nodesRef.current, edgesRef.current);
      setDraftSavedFingerprint(canvasFingerprint(nodesRef.current, edgesRef.current));
      setDraftLoadAlert(null);
      setStatusMsg(res.data.publishedVersion
        ? `Published v${res.data.publishedVersion} ✓`
        : 'Published ✓');
      setTimeout(() => setStatusMsg(''), 2500);
    } catch (err: unknown) {
      const e = err as { message?: string; details?: { report?: { errors: { message: string }[] } } };
      const n = e.details?.report?.errors?.length;
      setStatusMsg(n
        ? `Publish blocked: ${n} error(s) — see validation`
        : `Publish failed: ${e.message ?? String(err)}`);
      setTimeout(() => setStatusMsg(''), 6000);
    }
  };

  // ── ReactFlow event handlers ────────────────────────────────────────────────
  const isValidConnection = useCallback((connection: Connection) => (
    isValidFlowConnection(
      connection,
      edgesRef.current,
      nodesRef.current,
      reconnectingEdgeId.current ?? undefined,
    )
  ), []);

  const onConnect = useCallback((params: Connection) => {
    if (!isValidFlowConnection(params, edgesRef.current, nodesRef.current)) {
      console.warn('[Designer] onConnect: blocked by flow wiring rules');
      return;
    }
    recordCanvasHistory();
    const isError = (params.sourceHandle ?? '') === ERROR_HANDLE;
    setEdges(eds => addEdge({
      ...params,
      type:          'deletable',
      animated:      true,
      reconnectable: true,
      style:         { stroke: isError ? '#ef4444' : '#4f8ef7', strokeWidth: 1.5 },
    }, eds));

    const sourceNode = nodesRef.current.find(n => n.id === params.source);
    const subId = sourceNode
      ? nodeCompartmentId({ id: sourceNode.id, type: sourceNode.type ?? '', data: sourceNode.data as Record<string, unknown> })
      : '';
    if (subId && params.target) {
      setNodes(prev => prev.map(n => {
        if (n.id !== params.target) return n;
        if (n.type === 'startNode' || n.type === 'endNode' || n.type === 'loopNode') return n;
        if (n.type === 'invokeSubFloNode') return n;
        const existing = (n.data as Record<string, unknown>).subFloId;
        if (existing) return n;
        return { ...n, data: { ...n.data, subFloId: subId } };
      }));
    }
  }, [setEdges, setNodes, recordCanvasHistory]);

  const onReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    if (!newConnection.source || !newConnection.target) return;
    if (!isValidFlowConnection(
      newConnection,
      edgesRef.current,
      nodesRef.current,
      oldEdge.id,
    )) {
      setStatusMsg('Cannot rewire: source already has an outgoing wire on this handle');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }
    recordCanvasHistory();
    setEdges(eds => reconnectEdge(oldEdge, newConnection, eds));
  }, [setEdges, recordCanvasHistory]);

  const edgeRewireApi = useMemo<EdgeRewireApi>(() => ({
    onReconnect,
    onReconnectStart: (edge) => { reconnectingEdgeId.current = edge.id; },
    onReconnectEnd:   () => { reconnectingEdgeId.current = null; },
    isValidConnection,
    recordHistory: recordCanvasHistory,
  }), [onReconnect, isValidConnection, recordCanvasHistory]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const latest = nodesRef.current.find(n => n.id === node.id) ?? node;
    setSelectedNode(latest);
    setNodeContextMenu(null);
    setNodeQuickHelp(null);
    setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)));
  }, [setEdges]);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    const latest = nodesRef.current.find(n => n.id === node.id) ?? node;
    setSelectedNode(latest);
    setNodeQuickHelp(null);
    setNodeContextMenu({ nodeId: node.id, x: e.clientX, y: e.clientY });
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedNode(null);
    setNodeContextMenu(null);
    setNodeQuickHelp(null);
    setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === edge.id })));
  }, [setEdges]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setNodeContextMenu(null);
    setNodeQuickHelp(null);
    setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)));
  }, [setEdges]);

  const contextMenuNode = nodeContextMenu
    ? (nodes.find(n => n.id === nodeContextMenu.nodeId) ?? null)
    : null;

  const quickHelpNode = nodeQuickHelp
    ? (nodes.find(n => n.id === nodeQuickHelp.nodeId) ?? null)
    : null;
  const onDragOver  = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  }, []);

  const COMPACT_NODE = { width: 172, height: 64 };
  const RESIZABLE_DEFAULTS: Record<string, { width: number; height: number }> = {
    startNode:         COMPACT_NODE,
    endNode:           COMPACT_NODE,
    plugNode:          COMPACT_NODE,
    floActionNode:     COMPACT_NODE,
    workdayNode:       COMPACT_NODE,
    salesforceNode:    COMPACT_NODE,
    sapNode:           COMPACT_NODE,
    oracleNode:        COMPACT_NODE,
    mapperNode:        COMPACT_NODE,
    filterNode:        COMPACT_NODE,
    floSwitchNode:     { width: 200, height: 120 },
    variableStoreNode: COMPACT_NODE,
    fifNode:           COMPACT_NODE,
    loopNode:          { width: 188, height: 72 },
    subFloNode:        { width: 188, height: 64 },
    subFloReturnNode:  COMPACT_NODE,
    invokeSubFloNode:  COMPACT_NODE,
    functionNode:      COMPACT_NODE,
    templateNode:      COMPACT_NODE,
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!rfInstance || !wrapperRef.current) return;

    const type  = e.dataTransfer.getData('application/flonode-type');
    const label = e.dataTransfer.getData('application/flonode-label');
    const meta  = e.dataTransfer.getData('application/flonode-meta');
    if (!type) return;

    if (type === 'startNode' && nodesRef.current.some(n => n.type === 'startNode')) {
      alert('A flow can only have one Start node.'); return;
    }
    if (type === 'endNode' && nodesRef.current.some(n => n.type === 'endNode')) {
      alert('A flow can only have one End node.'); return;
    }

    const bounds   = wrapperRef.current.getBoundingClientRect();
    const position = rfInstance.screenToFlowPosition({
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    });

    const nodeMeta = meta ? JSON.parse(meta) : {};
    const dims     = RESIZABLE_DEFAULTS[type] ?? COMPACT_NODE;

    // For plug nodes, inject category-aware placeholders at drop time
    const categoryPlaceholders = type === 'plugNode'
      ? {
          _placeholders: getPlugPlaceholders(nodeMeta?.category),
          testInputJson: DEFAULT_NODE_TEST_INPUT,
          defaultConnectionId: (nodeMeta.defaultConnectionId as string) ?? (nodeMeta.connectionId as string) ?? '',
          allowedConnectionIds: (nodeMeta.allowedConnectionIds as string[]) ?? [],
          connectionId: (nodeMeta.connectionId as string) ?? (nodeMeta.defaultConnectionId as string) ?? '',
        }
      : type === 'floActionNode'
          ? (() => {
              // Always read from the live map — never from palette meta
              // so the developer always gets the current HubAdmin config
              const floKitId = nodeMeta.floKitId as string | undefined;
              const liveDoc  = floKitId ? floActionNodeMap.current.get(floKitId) : undefined;
              if (liveDoc) {
                return {
                  floKitId:             liveDoc.floKitId,
                  connectorId:          liveDoc.connectorId,
                  flaLabel:             liveDoc.displayName,
                  // Live metadata — never saved to flo doc (stripped by STRIP_KEYS)
                  actionIds:            liveDoc.actionIds            ?? [],
                  allowedConnectionIds: liveDoc.allowedConnectionIds ?? [],
                  defaultConnectionId:  liveDoc.defaultConnectionId  ?? '',
                  templateActionId:     liveDoc.templateActionId     ?? liveDoc.actionIds?.[0] ?? '',
                  urlTokensSnapshot:    liveDoc.urlTokensSnapshot ?? [],
                  kitUrlContext:        liveDoc.kitUrlContext ?? {},
                  floActionUrlValuesByConnection: liveDoc.floActionUrlValuesByConnection ?? {},
                  floActionNodeUrlTokens: liveDoc.floActionNodeUrlTokens ?? [],
                  // Developer's initial picks
                  actionId:      liveDoc.templateActionId    ?? liveDoc.actionIds?.[0]            ?? '',
                  connectionId:  liveDoc.defaultConnectionId ?? liveDoc.allowedConnectionIds?.[0] ?? '',
                  outputTarget:  'cStream',
                  outputVarName: '',
                  inputSource:       'cStream',
                  inputVarName:      '',
                  inputContentType:  'application/json',
                };
              }
              // Fallback: map not ready — use palette meta, re-hydration will correct it
              return {
                floKitId:             nodeMeta.floKitId,
                connectorId:          nodeMeta.connectorId,
                flaLabel:             nodeMeta.flaLabel,
                actionIds:            (nodeMeta.actionIds            as string[]) ?? [],
                allowedConnectionIds: (nodeMeta.allowedConnectionIds as string[]) ?? [],
                defaultConnectionId:  (nodeMeta.defaultConnectionId  as string)  ?? '',
                templateActionId:     (nodeMeta.templateActionId     as string)  ?? '',
                actionId:      (nodeMeta.templateActionId as string) ?? (nodeMeta.actionIds as string[])?.[0] ?? '',
                connectionId:  (nodeMeta.defaultConnectionId as string) ?? (nodeMeta.allowedConnectionIds as string[])?.[0] ?? '',
                outputTarget:  'cStream',
                outputVarName: '',
                inputSource:       'cStream',
                inputVarName:      '',
                inputContentType:  'application/json',
              };
            })()
          : {};

    const typeDefaults = type === 'loopNode'
      ? {
        continueExpr: 'local.continue == true',
        executeAtLeastOnce: true,
        maxIterations: 100,
        outputTarget: 'cStream',
      }
        : type === 'subFloNode'
          ? { description: '', inputArgs: [], returnArgs: [] }
          : {};

    const switchDefaults = type === 'floSwitchNode'
      ? (() => {
          const br = createSwitchBranch('Route 1');
          return { branches: [br], activeBranchId: br.id };
        })()
      : type === 'filterNode'
        ? { conditionRows: defaultConditionRows() }
        : {};

    const newId = `${type}-${Date.now()}`;
    const selected = nodesRef.current.find(n => n.id === selectedNode?.id) ?? selectedNode;
    const inheritSubFloId = selected?.type === 'subFloNode'
      ? selected.id
      : String((selected?.data as Record<string, unknown> | undefined)?.subFloId ?? '');

    const subFloPatch = type === 'subFloNode'
      ? { subFloId: newId }
      : (type === 'subFloReturnNode' || (inheritSubFloId && type !== 'startNode' && type !== 'endNode'
          && type !== 'invokeSubFloNode' && type !== 'loopNode'))
        ? { subFloId: inheritSubFloId || undefined }
        : {};

    recordCanvasHistory();
    setNodes(prev => {
      const newNode = {
      id:   newId,
      type,
      position,
      ...dims,
      data: {
        label,
        hubId,
        tenantId,
        onUpdate:       updateNodeData,
        onDelete:       deleteNode,
        availablePlugs: plugs.filter(p =>
          p.isActive !== false
          && (p.connectorId === type || p.connectorId === 'genericNode')
        ),
        ...nodeMeta,
        ...categoryPlaceholders,
        ...(type !== 'startNode' && type !== 'endNode'
          ? {
            testInputJson: DEFAULT_NODE_TEST_INPUT,
            dataPersistence: { mode: 'none' as const },
          }
          : {}),
        availableFlos: flos.map(f => ({ id: f.id, name: f.name })),
        ...switchDefaults,
        ...typeDefaults,
        ...subFloPatch,
      },
    };
      queueMicrotask(() => setSelectedNode(newNode as Node));
      return [...prev, newNode as Node];
    });
  }, [rfInstance, hubId, tenantId, updateNodeData, deleteNode, plugs, flos, recordCanvasHistory, selectedNode]);

  const onNodeDragStart = useCallback(() => {
    if (!canvasHistory.isApplying()) recordCanvasHistory();
  }, [canvasHistory, recordCanvasHistory]);

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (wsLoading) {
    return (
      <div style={{ ...s.root, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: '#6b6b80' }}>Loading workspace…</div>
      </div>
    );
  }

  // ── FloExecution Hub (all authenticated users) ─────────────────────────────
  if (view === 'executions') {
    return (
      <FloExecutionHubApp
        hubId={hubId}
        tenantId={tenantId}
        hubName={hubName}
        onBack={() => setView('designer')}
      />
    );
  }

  // ── Admin Dashboard view ──────────────────────────────────────────────────
  if (view === 'admin' || view === 'scheduler') {
    const persistedUi = readTenantUiState(hubId, tenantId);
    return (
      <HubAdminDashboard
        hubId={hubId}
        tenantId={tenantId}
        userId={userId}
        permissions={permissions}
        isHubAdmin={isHubAdmin}
        hubName={hubName}
        hubLogoUrl={hubLogoUrl}
        initialTab={
          view === 'scheduler'
            ? 'scheduler'
            : (persistedUi.adminTab ?? 'plugs')
        }
        onTabChange={(tab: AdminTabId) => writeTenantUiState(hubId, tenantId, { adminTab: tab })}
        onBack={() => setView('designer')}
      />
    );
  }

  if (wsLoading) {
    return (
      <div style={{ ...s.root, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: '#6b6b80' }}>Loading workspaces…</div>
      </div>
    );
  }

  if (!activeWs) {
    return (
      <div style={{ ...s.root, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 14, color: '#c0c0cc' }}>No workspace yet</div>
        <div style={{ fontSize: 11, color: '#6b6b80', maxWidth: 360, textAlign: 'center' }}>
          Create a workspace to organize your flos (e.g. Revenue, Billing).
        </div>
        <button
          type="button"
          onClick={async () => {
            const name = window.prompt('New workspace name', '');
            if (name?.trim()) await createWorkspace(name.trim());
          }}
          style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: '0.5px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)',
            color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          + Create workspace
        </button>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="floplug-designer" style={s.root}>

      <NewFlowModal
        open={newFlowModalOpen}
        onClose={() => setNewFlowModalOpen(false)}
        onCreate={handleCreateFlow}
      />

      <RunModal
        open={runModalOpen}
        running={running}
        result={runResult}
        onRun={handleRun}
        onClose={() => { setRunModalOpen(false); setRunResult(null); }}
        runBlockedReason={
          validationReport.errors.length > 0
            ? `This flow has ${validationReport.errors.length} validation error(s). Fix them or use ▶ Test node on individual nodes.`
            : undefined
        }
      />

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={s.topbar}>

        {/* Branding: hub logo + name. Falls back to "FloPlug" text. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {hubLogoUrl ? (
            <img
              src={hubLogoUrl}
              alt={hubName}
              style={{ height: 24, width: 'auto', objectFit: 'contain', borderRadius: 4 }}
            />
          ) : (
            /* Fallback icon when no logo URL is configured */
            <div style={{
              width: 26, height: 26, borderRadius: 6,
              background: 'linear-gradient(135deg, #4f8ef7 0%, #7c3aed 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="14" height="14" fill="none" stroke="#fff" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
          )}
          <span style={s.tbLogo}>{hubName}</span>
        </div>

        <div style={s.tbSep} />

        <DesignerWorkspaceFloBar
          workspaces={allWorkspaces}
          activeWorkspace={activeWs}
          onWorkspaceChange={handleWorkspaceChange}
          onCreateWorkspace={async (name) => { await createWorkspace(name); }}
          onRenameWorkspace={renameWorkspace}
          onSetDefaultWorkspace={setDefaultWorkspace}
          flos={flos}
          activeFlo={activeFlo}
          onFloChange={(floId) => {
            const f = flos.find(x => x.id === floId);
            if (f) openFlow(f);
          }}
          onSetDefaultFlo={handleSetDefaultFlo}
          onMoveFlo={handleMoveFlo}
          onNewFlo={() => setNewFlowModalOpen(true)}
        />

        {statusMsg && (
          <span style={{ fontSize: 11, color: '#22c55e', fontStyle: 'italic' }}>
            {statusMsg}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#6b6b80' }}>
            {nodes.length} nodes
          </span>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setAlertsOpen(o => !o)}
              style={{
                ...s.btnGhost,
                color: validationReport.errors.length ? '#f87171' : '#e0e0e8',
                borderColor: validationReport.errors.length ? 'rgba(248,113,113,0.45)' : undefined,
              }}
            >
              🔔 Alerts
              {(validationReport.errors.length + validationReport.warnings.length) > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 9, fontWeight: 700,
                  background: validationReport.errors.length ? '#dc2626' : '#ca8a04',
                  color: '#fff', borderRadius: 10, padding: '1px 6px',
                }}>
                  {validationReport.errors.length + validationReport.warnings.length}
                </span>
              )}
            </button>
            <ValidationAlertsPanel
              open={alertsOpen}
              onClose={() => setAlertsOpen(false)}
              errors={validationReport.errors}
              warnings={validationReport.warnings}
              onSelectNode={focusValidationNode}
            />
          </div>
          <div style={s.tbSep} />
          <button
            type="button"
            onClick={performUndo}
            disabled={!canvasHistory.canUndo}
            title="Undo (⌘Z)"
            style={{ ...s.btnGhost, opacity: canvasHistory.canUndo ? 1 : 0.4, cursor: canvasHistory.canUndo ? 'pointer' : 'not-allowed' }}
          >
            ↶ Undo
          </button>
          <button
            type="button"
            onClick={performRedo}
            disabled={!canvasHistory.canRedo}
            title="Redo (⌘⇧Z)"
            style={{ ...s.btnGhost, opacity: canvasHistory.canRedo ? 1 : 0.4, cursor: canvasHistory.canRedo ? 'pointer' : 'not-allowed' }}
          >
            ↷ Redo
          </button>
          <div style={s.tbSep} />
          {activeFlo && (
            <FloDraftStatusBar
              flo={activeFlo}
              hasDraftChanges={hasDraftChanges}
              saving={saving}
              autoSaving={autoSaving}
            />
          )}
          <div style={s.tbSep} />
          <button
            onClick={() => void saveFlo()}
            disabled={saving || autoSaving || !activeFlo || !hasDraftChanges}
            title={
              !activeFlo ? 'Open a flo first'
                : !hasDraftChanges ? 'No unsaved changes'
                : 'Save draft to Firestore'
            }
            style={{
              ...s.btnGhost,
              opacity: saving || autoSaving || !activeFlo || !hasDraftChanges ? 0.45 : 1,
              cursor: !activeFlo || !hasDraftChanges ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : autoSaving ? 'Auto-saving…' : 'Save'}
          </button>
          {(activeFlo?.publishedVersion ?? 0) > 0 && hasDraftChanges && (
            <button
              type="button"
              onClick={() => void discardDraft()}
              disabled={saving || autoSaving}
              title="Discard draft edits and reload last published version"
              style={{
                ...s.btnGhost,
                opacity: saving || autoSaving ? 0.45 : 1,
                fontSize: 10,
              }}
            >
              Discard draft
            </button>
          )}
          <button
            onClick={() => { setRunResult(null); setRunModalOpen(true); }}
            disabled={!activeFlo}
            style={{ ...s.btnRun, opacity: !activeFlo ? 0.6 : 1, cursor: !activeFlo ? 'not-allowed' : 'pointer' }}
          >
            ▶ Run
          </button>
          <button
            onClick={publishFlow}
            disabled={!canPublish || saving}
            title={
              !activeFlo ? 'Open a flo first'
                : validationReport.errors.length ? 'Fix validation errors before publishing'
                : !hasUnpublishedChanges ? 'No changes since last publish'
                : 'Publish this flo for production'
            }
            style={{
              ...s.btnPub,
              opacity: !canPublish || saving ? 0.45 : 1,
              cursor: !canPublish || saving ? 'not-allowed' : 'pointer',
            }}
          >
            Publish{activeFlo?.publishState === 'published' && !hasUnpublishedChanges ? ' ✓' : ''}
          </button>
          {activeFlo?.publishState === 'published' && hasUnpublishedChanges && (
            <span style={{ fontSize: 9, color: '#fbbf24', fontWeight: 600 }}>unpublished edits</span>
          )}
          <div style={s.tbSep} />

          <button
            type="button"
            onClick={() => enterProductDocs({ category: 'product' })}
            title="Product help (opens in new tab)"
            style={{
              ...s.btnGhost,
              fontSize: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            📘 Help
          </button>

          {/* Profile drawer — replaces raw Admin button + HUB ADMIN badge */}
          <ProfileDrawer
            user={{ displayName: userInfo.displayName, email: userInfo.email, role: userRole }}
            isHubAdmin={isHubAdmin}
            permissions={permissions}
            hubName={hubName}
            hubLogoUrl={hubLogoUrl}
            onNavigate={(section: DashboardSection) => {
              if (section === 'admin') {
                writeTenantUiState(hubId, tenantId, { adminTab: 'plugs' });
                setView('admin');
              } else if (section === 'scheduler') {
                writeTenantUiState(hubId, tenantId, { adminTab: 'scheduler' });
                setView('scheduler');
              } else if (section === 'executions') {
                setView('executions');
              } else {
                setView('designer');
              }
            }}
            onSignOut={() => onSignOut?.()}
          />
        </div>
      </div>

      {draftLoadAlert && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '8px 14px', flexShrink: 0,
          background: 'rgba(251,191,36,0.12)', borderBottom: '0.5px solid rgba(251,191,36,0.35)',
          color: '#fde68a', fontSize: 12,
        }}>
          <span>
            <strong>In-progress draft loaded</strong>
            {' — '}
            {draftLoadAlert.floName}
            {draftLoadAlert.publishedVersion ? ` (published v${draftLoadAlert.publishedVersion} unchanged)` : ''}
            . Production and webhooks still use the published version until you publish this draft.
          </span>
          <button
            type="button"
            onClick={() => setDraftLoadAlert(null)}
            style={{
              padding: '2px 8px', borderRadius: 4, border: '0.5px solid rgba(251,191,36,0.45)',
              background: 'transparent', color: '#fde68a', cursor: 'pointer', fontSize: 11, flexShrink: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <InspectorPanelProvider
        expanded={inspectorExpanded}
        setExpanded={setInspectorExpanded}
        paletteWidth={paletteWidth}
        hubId={hubId}
        tenantId={tenantId}
      >
      <div style={s.body}>

        {/* Node palette */}
        <NodePalette
          plugs={plugs.filter(p => p.isActive !== false)}
          floActions={floActions}
          onPaletteWidthChange={setPaletteWidth}
        />

        <div
          ref={wrapperRef}
          className="fp-designer-canvas"
          style={{ flex: 1, minWidth: DESIGNER_CANVAS_MIN_WIDTH, position: 'relative', overflow: 'hidden' }}
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <EdgeRewireContext.Provider value={edgeRewireApi}>
          <ReactFlow
            snapToGrid={true}
            snapGrid={[20, 20]}
            nodes={displayNodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeDragStart={onNodeDragStart}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onInit={(instance) => {
              setRfInstance(instance);
              if (nodesRef.current.length === 0) return;
              if (pendingViewport.current) {
                const vp = pendingViewport.current;
                pendingViewport.current = null;
                restoreCanvasViewport(
                  instance,
                  clampCanvasViewport(vp),
                  nodesRef.current,
                  wrapperRef.current,
                );
                pendingFitView.current = false;
              } else if (pendingFitView.current) {
                pendingFitView.current = false;
                fitCanvasToFlow(instance);
              }
            }}
            onMoveEnd={onViewportMoveEnd}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            nodeOrigin={[0, 0]}
            elevateEdgesOnSelect={false}
            edgesReconnectable
            reconnectRadius={28}
            connectionRadius={28}
            isValidConnection={isValidConnection}
            onReconnect={onReconnect}
            onReconnectStart={(_, edge) => { reconnectingEdgeId.current = edge.id; }}
            onReconnectEnd={() => { reconnectingEdgeId.current = null; }}
            style={{ background: '#0f1117' }}
            defaultEdgeOptions={{ type: 'deletable', animated: true, reconnectable: true }}
          >
            <Background
              variant={BackgroundVariant.Lines}
              color="rgba(255,255,255,0.025)"
              gap={[220, 80]}
            />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              position="bottom-right"
              nodeColor="#4f8ef7"
              maskColor="rgba(15,17,23,.75)"
              pannable
              zoomable
            />
          </ReactFlow>
          </EdgeRewireContext.Provider>

          {nodeContextMenu && contextMenuNode && (
            <NodeCanvasContextMenu
              state={nodeContextMenu}
              node={contextMenuNode}
              edges={edges}
              onClose={() => setNodeContextMenu(null)}
              onRemoveWiring={removeNodeWiring}
              onDelete={deleteNode}
              onQuickHelp={setNodeQuickHelp}
            />
          )}

          {nodeQuickHelp && quickHelpNode && (
            <DesignerHelpPopup
              x={nodeQuickHelp.x}
              y={nodeQuickHelp.y}
              content={getNodeQuickHelp(quickHelpNode, plugs, floActions)}
              onClose={() => setNodeQuickHelp(null)}
            />
          )}

          {rfInstance && nodes.length > 0 && (
            <button
              type="button"
              className="fp-canvas-fit-btn"
              title="Fit entire flow in view"
              onClick={() => fitCanvasToFlow(rfInstance)}
            >
              Fit flow
            </button>
          )}

          {flos.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(79,142,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="22" height="22" fill="none" stroke="#4f8ef7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6b6b80' }}>Click "+ New flow" to get started</div>
              <div style={{ fontSize: 11, color: '#3a3a50' }}>Or select a flow from the dropdown above</div>
            </div>
          )}
        </div>

        {/* Right panel — resize, collapse strip, widen within body row */}
        <InspectorRightColumn>
          <InspectorPanelToolbar />
          <NodeInspector node={selectedNode} onUpdate={updateNodeData} ctx={inspectorCtx} />
          <div style={{
            ...s.logPanel,
            ...(inspectorExpanded ? { height: 150, flexShrink: 0 } : {}),
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#3a3a50', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              Last run
            </div>
            <div style={{ flex: 1, overflowY: 'auto', background: '#0a0c12', border: '0.5px solid rgba(255,255,255,.05)', borderRadius: 5, padding: '6px 8px' }}>
              {!runResult
                ? <div style={{ color: '#3a3a50', fontSize: 10 }}>No runs yet — click ▶ Run</div>
                : runResult.log.map((line, i) => (
                  <div key={i} style={{
                    fontSize: 10, fontFamily: 'monospace', lineHeight: 1.6,
                    color: line.startsWith('Error') ? '#f87171'
                         : line.startsWith('✓')     ? '#22c55e'
                         : '#c0c0cc',
                  }}>
                    {line}
                  </div>
                ))
              }
            </div>
            {runResult && (
              <button
                onClick={() => setRunModalOpen(true)}
                style={{ ...s.btnGhost, marginTop: 8, fontSize: 10, width: '100%' }}
              >
                View full output
              </button>
            )}
          </div>
        </InspectorRightColumn>
      </div>
      </InspectorPanelProvider>
    </div>
  );
};

const Designer: React.FC<DesignerProps> = props => (
  <ReactFlowProvider><DesignerInner {...props} /></ReactFlowProvider>
);

export default Designer;

// ── App styles ────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:       { display: 'flex', flexDirection: 'column', height: '100%', background: '#0f1117', color: '#f0f0f4', fontFamily: "'Inter',-apple-system,sans-serif", overflow: 'hidden' },
  topbar:     { height: 46, background: '#181b24', borderBottom: '0.5px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0 },
  tbLogo:     { fontSize: 13, fontWeight: 700, color: '#ffffff' },
  tbSep:      { width: 0.5, height: 14, background: 'rgba(255,255,255,.1)', flexShrink: 0 },
  // ↑ Plug screen visibility fix: select text is white (#fff), placeholder via option disabled
  flowSelect: {
    padding: '4px 8px', borderRadius: 5,
    border: '0.5px solid rgba(255,255,255,.15)',
    background: '#0f1117', color: '#ffffff',
    fontSize: 12, fontFamily: 'inherit', maxWidth: 200, outline: 'none',
  },
  btnGhost:   { padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.06)', color: '#e0e0e8' },
  btnRun:     { padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: '#22c55e', color: '#fff' },
  btnPub:     { padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: '#4f8ef7', color: '#fff' },
  body:       { display: 'flex', flex: 1, overflow: 'hidden' },
  rightPanel: { width: 300, background: '#141720', borderLeft: '0.5px solid rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' },
  logPanel:   { borderTop: '0.5px solid rgba(255,255,255,.06)', padding: 12, height: 220, display: 'flex', flexDirection: 'column' },
};

// ── Modal styles ──────────────────────────────────────────────────────────────
const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, backdropFilter: 'blur(4px)',
};
const modalBox: React.CSSProperties = {
  background: '#181b24', border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 12, padding: '24px 28px', width: 420, maxWidth: '95vw',
  fontFamily: "'Inter',-apple-system,sans-serif",
};
const modalHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20,
};
const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#9090a0', fontSize: 14, cursor: 'pointer',
};
const errBox: React.CSSProperties = {
  background: 'rgba(220,38,38,0.1)', border: '0.5px solid rgba(220,38,38,0.2)',
  borderRadius: 7, padding: '8px 12px', color: '#f87171', fontSize: 12, marginBottom: 14,
};
const fieldGroup: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 };
// Plug screen visibility: labels are now bright white, not the previous dim #9090a0
const fieldLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#e0e0e8' };
const fieldInput: React.CSSProperties = {
  padding: '8px 11px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.15)',
  background: '#0f1117', color: '#ffffff', fontSize: 13, fontFamily: 'inherit', outline: 'none',
};
const btnGhostSm: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'inherit', border: '0.5px solid rgba(255,255,255,.15)',
  background: 'rgba(255,255,255,.06)', color: '#e0e0e8',
};
const btnCreateSm: React.CSSProperties = {
  padding: '6px 18px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit', border: 'none', background: '#4f8ef7', color: '#fff',
};

// ── Global CSS for plug input placeholder visibility ──────────────────────────
// Injected once so placeholder text is readable on all dark inputs inside Designer.
// Uses fluorescent green (#39ff14) to match the hub-admin accent colour.
if (typeof document !== 'undefined') {
  const STYLE_ID = 'floplug-designer-placeholder-fix';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .floplug-designer input::placeholder,
      .floplug-designer textarea::placeholder,
      .floplug-designer select option[disabled] {
        color: #39ff14 !important;
        opacity: 0.7;
      }
      .floplug-designer input,
      .floplug-designer textarea,
      .floplug-designer select {
        color: #ffffff !important;
      }
      .floplug-designer .plug-field-hint {
        color: #39ff14;
        font-size: 10px;
        margin-top: 3px;
        font-style: italic;
        opacity: 0.85;
      }
      .floplug-designer .react-flow__node.fp-node-validation-error > div {
        box-shadow: 0 0 0 2px rgba(248, 113, 113, 0.9), 0 0 16px rgba(248, 113, 113, 0.4) !important;
        border-color: rgba(248, 113, 113, 0.95) !important;
      }
      .floplug-designer .react-flow__node.fp-node-validation-warning > div {
        box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.55), 0 0 10px rgba(251, 191, 36, 0.2) !important;
        border-color: rgba(251, 191, 36, 0.5) !important;
      }
      /* Selected edge: blue line (override React Flow default orange) */
      .floplug-designer .react-flow__edge.selected .react-flow__edge-path {
        stroke: #93c5fd !important;
        stroke-width: 3px !important;
      }
      .floplug-designer .react-flow__edgeupdater {
        display: none !important;
      }
      .floplug-designer .edge-rewire-handle:active {
        cursor: grabbing;
      }
    `;
    document.head.appendChild(style);
  }
}

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
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type Connection,
  type EdgeProps,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { db }                          from '../firebaseConfig';
import { getAuth }                     from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  doc, setDoc, getDoc, addDoc, collection, getDocs,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';

import { WorkdayNode }                                                 from './nodes/WorkdayNode';
import { SalesforceNode, SapNode, OracleNode, MapperNode, FilterNode } from './nodes/ConnectorNodes';
import { VariableStoreNode, FIFNode, FunctionNode }                    from './nodes/AdvancedNodes';
import TemplateNode                                                    from './nodes/TemplateNode';
import { LoopNode }                                                    from './nodes/LoopNode';
import { StartNode, EndNode }                                          from './nodes/StartEndNodes';
import { NodeInspector, NodePalette }                                  from './NodePaletteAndInspector';
import type { DesignerInspectorContext }                               from '../inspector/types';
import { nodesForNodeTest, edgesForNodeTest }                          from '../inspector/testSubgraph';
import { testConnectorNode }                                           from '../inspector/connectorTest';
import { testPlugNode }                                                from '../inspector/plugTest';
import { RunModal, type RunResult }                                    from './RunModal';
import PlugManager                                                     from './PlugManager.tsx';
import type { PlugConfig,
  FloInvokePermissions,
  DesignerProps,
  NewFloForm,
  FloMeta,
  WorkspaceMeta,
} from '@floplug/shared';
import { COLLECTIONS, HUB_COLLECTIONS, NODE_TYPES as NODE_TYPE_KEYS } from '@floplug/shared';
import PlugNodeComponent from './nodes/PlugNode';
import ProfileDrawer, { type DashboardSection } from './ProfileDrawer';
import HubAdminDashboard                        from './HubAdminDashboard';

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
  [NODE_TYPE_KEYS.VAR_STORE]:  VariableStoreNode,
  [NODE_TYPE_KEYS.FIF]:        FIFNode,
  [NODE_TYPE_KEYS.FUNCTION]:   FunctionNode,
  [NODE_TYPE_KEYS.LOOP]:       LoopNode,
  [NODE_TYPE_KEYS.TEMPLATE]:   TemplateNode,
  [NODE_TYPE_KEYS.PLUG]:       PlugNodeComponent,
};

// ── Custom deletable edge ────────────────────────────────────────────────────
const DeletableEdge: React.FC<EdgeProps> = ({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, selected, markerEnd,
}) => {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke:      selected ? '#f59e0b' : '#4f8ef7',
          strokeWidth: selected ? 2.5 : 1.5,
          filter:      selected ? 'drop-shadow(0 0 4px rgba(245,158,11,0.6))' : 'none',
          transition:  'stroke 0.15s, stroke-width 0.15s',
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position:  'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            opacity: selected ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
          className="edge-delete-btn-wrap"
        >
          <button
            onClick={() => setEdges(eds => eds.filter(e => e.id !== id))}
            title="Delete connection"
            style={{
              width: 18, height: 18, borderRadius: '50%',
              background: '#f87171', border: '2px solid #0f1117',
              color: '#fff', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, padding: 0,
            }}
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
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
const workspacesCol = (hubId: string, tenantId: string) =>
  collection(db, COLLECTIONS.HUBS, hubId, HUB_COLLECTIONS.TENANTS, tenantId, HUB_COLLECTIONS.WORKSPACES);

const flosCol = (hubId: string, tenantId: string, wsId: string) =>
  collection(db, COLLECTIONS.HUBS, hubId, HUB_COLLECTIONS.TENANTS, tenantId, HUB_COLLECTIONS.WORKSPACES, wsId, HUB_COLLECTIONS.FLOS);

const flowDocRef = (hubId: string, tenantId: string, wsId: string, fId: string) =>
  doc(db, COLLECTIONS.HUBS, hubId, HUB_COLLECTIONS.TENANTS, tenantId, HUB_COLLECTIONS.WORKSPACES, wsId, HUB_COLLECTIONS.FLOS, fId);

// ── Default canvas nodes ──────────────────────────────────────────────────────
const makeDefaultNodes = (): Node[] => [
  { id: 'start-node', type: 'startNode', position: { x: 80,  y: 180 }, data: { label: 'Start' } },
  { id: 'end-node',   type: 'endNode',   position: { x: 560, y: 180 }, data: { label: 'End', output: null } },
];

// ── Node sanitiser ────────────────────────────────────────────────────────────
const STRIP_KEYS = new Set(['functions', 'onLogEntry', 'onUpdate', 'onDelete', '__rf', 'measured', 'availablePlugs', 'availableFlos']);

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
  return clean;
}
function sanitizeEdges(edges: Edge[]): Record<string, unknown>[] { return edges.map(sanitizeEdge); }

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
  hubId, tenantId, tenantType, userId, userRole, workspaceIds, floId, isAdmin = false,
  permissions = [], onSignOut,
}) => {
  const functions = getFunctions();

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeWs,       setActiveWs]                   = useState<WorkspaceMeta | null>(null);
  const [allWorkspaces,  setAllWorkspaces]               = useState<WorkspaceMeta[]>([]);
  const [isHubAdmin,     setIsHubAdmin]                  = useState(false);
  const [view,           setView]                        = useState<string>('designer'); // 'designer' | 'admin' | 'executions' | 'scheduler'
  const [userInfo,       setUserInfo]                    = useState({ displayName: '', email: '' });

  const [nodes,          setNodes,        onNodesChange] = useNodesState<Node>(makeDefaultNodes());
  const [edges,          setEdges,        onEdgesChange] = useEdgesState<Edge>([]);
  const [rfInstance,     setRfInstance]                  = useState<ReactFlowInstance | null>(null);
  const pendingViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const [selectedNode,   setSelectedNode]                = useState<Node | null>(null);
  const [activeFlo,     setActiveFlo]                  = useState<FloMeta | null>(null);
  const [flos,          setFlos]                       = useState<FloMeta[]>([]);
  const [saving,         setSaving]                      = useState(false);
  const [statusMsg,      setStatusMsg]                   = useState('');
  const [wsLoading,      setWsLoading]                   = useState(true);
  const [newFlowModalOpen, setNewFlowModalOpen]          = useState(false);
  const [runModalOpen,     setRunModalOpen]              = useState(false);
  const [running,          setRunning]                   = useState(false);
  const [runResult,        setRunResult]                 = useState<RunResult | null>(null);
  const [adminPanelOpen,   setAdminPanelOpen]            = useState(false);
  const [plugs,            setPlugs]                     = useState<PlugConfig[]>([]);
  const [testingNodeId,    setTestingNodeId]               = useState<string | null>(null);
  const lastRunInputRef    = useRef<Record<string, unknown>>({});

  // Branding — logo URL + display name loaded from hub doc
  const [hubLogoUrl,  setHubLogoUrl]  = useState<string>('');
  const [hubName,     setHubName]     = useState<string>('FloPlug');

  const wrapperRef = useRef<HTMLDivElement>(null);
  const nodesRef   = useRef<Node[]>(nodes);
  const edgesRef   = useRef<Edge[]>(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

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

  // ── Step 1: Resolve active workspace on mount ───────────────────────────────
  // Hub admins get ALL workspaces so they can switch between them.
  // Regular users only see their assigned workspace.
  useEffect(() => {
    const resolveWorkspace = async () => {
      setWsLoading(true);
      try {
        let ws: WorkspaceMeta | null = null;

        if (isHubAdmin) {
          // Hub admin: load every workspace under this tenant
          const snap = await getDocs(workspacesCol(hubId, tenantId));
          const all  = snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkspaceMeta));
          setAllWorkspaces(all);
          ws = all.find(w => w.defaultToLoad) ?? all[0] ?? null;
        } else {
          // Regular user: prefer defaultToLoad, fall back to first workspaceId
          const wsSnap = await getDocs(
            query(workspacesCol(hubId, tenantId), where('defaultToLoad', '==', true))
          );
          if (!wsSnap.empty) {
            const d = wsSnap.docs[0];
            ws = { id: d.id, ...d.data() } as WorkspaceMeta;
          } else if (workspaceIds.length > 0) {
            const fallbackSnap = await getDoc(doc(workspacesCol(hubId, tenantId), workspaceIds[0]));
            if (fallbackSnap.exists()) {
              ws = { id: fallbackSnap.id, ...fallbackSnap.data() } as WorkspaceMeta;
            }
          }
        }

        console.log('[Designer] resolved workspace:', ws);
        setActiveWs(ws);
      } catch (err) {
        console.error('[Designer] resolveWorkspace error:', err);
      } finally {
        setWsLoading(false);
      }
    };

    // Wait until isHubAdmin is resolved before fetching workspaces
    // (isHubAdmin starts false, gets set after token check)
    resolveWorkspace();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubId, tenantId, isHubAdmin]);

  // ── Load plugs ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const loadPlugs = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'FloPlugHubs', hubId, 'Tenants', tenantId, 'Plugs'),
            where('isActive', '==', true),
            orderBy('createdAt', 'desc')
          )
        );
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as PlugConfig));
        setPlugs(list);
        console.log(`[Designer] Loaded ${list.length} active plugs`);
      } catch (err) {
        console.warn('[Designer] loadPlugs error (index may be building):', err);
      }
    };
    loadPlugs();
  }, [hubId, tenantId]);

  // ── Step 2: Load flos once workspace is known ──────────────────────────────
  // Hub admins see ALL flos in the workspace (no ownerUid filter).
  useEffect(() => {
    if (!activeWs) return;
    const loadFlows = async () => {
      try {
        const snap = await getDocs(
          query(
            flosCol(hubId, tenantId, activeWs.id),
            ...(isHubAdmin ? [] : [where('ownerUid', '==', userId)]),
            orderBy('createdAt', 'desc')
          )
        );
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as FloMeta));
        console.log(`[Designer] Found ${list.length} flos in ws=${activeWs.id}`);
        setFlos(list);

        const target = floId
          ? list.find(f => f.id === floId)
          : list.find(f => f.defaultToLoad) ?? list[0];

        if (target) openFlow(target);
        else { setNodes(makeDefaultNodes()); setEdges([]); setActiveFlo(null); }
      } catch (err) {
        console.error('[Designer] loadFlows error:', err);
      }
    };
    loadFlows();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWs, hubId, tenantId, userId, isHubAdmin]);

  // ── updateNodeData / deleteNode ────────────────────────────────────────────
  const updateNodeData = useCallback((nodeId: string, patch: Record<string, unknown>) => {
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
    ));
    setSelectedNode(prev =>
      prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...patch } } : prev
    );
  }, []);

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
          nodes: Node[]; edges: Edge[]; inputJson: Record<string, unknown>; },
        { log: string[]; status: string; output: Record<string, unknown> | null }
      >(functions, 'executeFlo');

      const res = await fn({
        hubId, tenantId,
        wsId:   activeWs?.id ?? '',
        floId:  activeFlo.id,
        nodes:  sanitizeNodes(subgraphNodes) as unknown as Node[],
        edges:  sanitizeEdges(subgraphEdges) as unknown as Edge[],
        inputJson: lastRunInputRef.current,
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
  }), [functions, hubId, tenantId, floList, activeFlo?.id, nodes, edges, testNode, testingNodeId]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes(prev => {
      const node = prev.find(n => n.id === nodeId);
      if (node?.type === 'startNode' || node?.type === 'endNode') return prev;
      return prev.filter(n => n.id !== nodeId);
    });
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(prev => prev?.id === nodeId ? null : prev);
  }, [setNodes, setEdges]);

  // ── Open a saved flow ───────────────────────────────────────────────────────
  const openFlow = async (flow: FloMeta) => {
    try {
      const snap = await getDoc(flowDocRef(hubId, tenantId, flow.workspaceId, flow.id));
      if (!snap.exists()) { console.warn('[Designer] openFlow: doc not found', flow); return; }

      const data        = snap.data();
      const savedNodes: Node[] = data.nodes ?? [];

      const hasStart = savedNodes.some(n => n.type === 'startNode');
      const hasEnd   = savedNodes.some(n => n.type === 'endNode');
      const defaults = makeDefaultNodes();
      const merged   = [
        ...savedNodes,
        ...(!hasStart ? [defaults[0]] : []),
        ...(!hasEnd   ? [defaults[1]] : []),
      ];

      const hydrated = merged.map(n => ({
        ...n,
        ...(n.width  != null ? { width:  n.width  } : {}),
        ...(n.height != null ? { height: n.height } : {}),
        data: {
          ...n.data,
          hubId,
          tenantId,
          onUpdate:       updateNodeData,
          onDelete:       deleteNode,
          availablePlugs: plugs.filter(p =>
            p.connectorId === n.type || p.connectorId === 'genericNode'
          ),
          // Inject category-aware placeholders for plug nodes
          ...(n.type === 'plugNode' ? {
            _placeholders: getPlugPlaceholders(n.data?.category as string),
          } : {}),
          availableFlos: flos.map(f => ({ id: f.id, name: f.name })),
        },
      }));

      setNodes(hydrated);
      setEdges(data.edges ?? []);
      setActiveFlo(flow);
      setSelectedNode(null);
      setRunResult(null);

      if (data.viewport) {
        if (rfInstance) {
          setTimeout(() => rfInstance.setViewport(data.viewport, { duration: 0 }), 50);
        } else {
          pendingViewport.current = data.viewport;
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
    setNodes(defaults);
    setEdges([]);
    setActiveFlo(meta);
    setSelectedNode(null);
    setRunResult(null);
    setStatusMsg('Flow created ✓');
    setTimeout(() => setStatusMsg(''), 2000);
  };

  // ── Save the current flow ───────────────────────────────────────────────────
  const saveFlo = async () => {
    if (!activeFlo) return;
    setSaving(true);
    setStatusMsg('Saving…');
    try {
      const cleanNodes = sanitizeNodes(nodesRef.current);
      const cleanEdges = sanitizeEdges(edgesRef.current);
      const viewport   = rfInstance?.getViewport() ?? undefined;

      await setDoc(
        flowDocRef(hubId, tenantId, activeFlo.workspaceId, activeFlo.id),
        {
          nodes:         cleanNodes,
          edges:         cleanEdges,
          ...(viewport ? { viewport } : {}),
          name:          activeFlo.name          ?? '',
          shortCode:     activeFlo.shortCode     ?? '',
          integrationId: activeFlo.integrationId ?? '',
          ownerUid:      userId,
          updatedAt:     serverTimestamp(),
        },
        { merge: true }
      );
      setStatusMsg('Saved ✓');
    } catch (err: any) {
      console.error('[Designer] saveFlo error:', err);
      setStatusMsg(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMsg(''), 2500);
    }
  };

  // ── Run the flow ────────────────────────────────────────────────────────────
  const handleRun = async (inputJson: Record<string, unknown>) => {
    if (!activeFlo) return;

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
          nodes: Node[]; edges: Edge[]; inputJson: Record<string, unknown>; },
        { log: string[]; status: string; output: Record<string, unknown> | null }
      >(functions, 'executeFlo');

      const res = await fn({
        hubId, tenantId,
        wsId:      activeWs?.id ?? '',
        floId:    activeFlo.id,
        nodes:     sanitizeNodes(nodesRef.current) as unknown as Node[],
        edges:     sanitizeEdges(edgesRef.current) as unknown as Edge[],
        inputJson,
      });

      const result: RunResult = {
        log:    res.data.log    ?? [],
        output: res.data.output ?? null,
        status: (res.data.status as 'success' | 'error') ?? 'success',
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
      setRunResult({ log: [`Error: ${err.message}`], output: null, status: 'error' });
    } finally {
      setRunning(false);
    }
  };

  // ── Publish ─────────────────────────────────────────────────────────────────
  const publishFlow = async () => {
    if (!activeFlo) return;
    try {
      await setDoc(
        flowDocRef(hubId, tenantId, activeFlo.workspaceId, activeFlo.id),
        { status: 'active', publishedAt: serverTimestamp() },
        { merge: true }
      );
      setStatusMsg('Published ✓');
      setTimeout(() => setStatusMsg(''), 2500);
    } catch (err: any) {
      setStatusMsg(`Publish failed: ${err.message}`);
    }
  };

  // ── ReactFlow event handlers ────────────────────────────────────────────────
  const onConnect = useCallback((params: Connection) => {
    const hasOutgoing = edgesRef.current.some(
      e => e.source === params.source && e.sourceHandle === (params.sourceHandle ?? null)
    );
    if (hasOutgoing) {
      console.warn('[Designer] onConnect: source already has an outgoing wire — blocked');
      return;
    }
    const targetNode = nodesRef.current.find(n => n.id === params.target);
    if (targetNode?.type === 'endNode') {
      const hasIncoming = edgesRef.current.some(e => e.target === params.target);
      if (hasIncoming) {
        console.warn('[Designer] onConnect: endNode already has an incoming wire — blocked');
        return;
      }
    }
    setEdges(eds => addEdge({
      ...params,
      type:     'deletable',
      animated: true,
      style:    { stroke: '#4f8ef7', strokeWidth: 1.5 },
    }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const latest = nodesRef.current.find(n => n.id === node.id) ?? node;
    setSelectedNode(latest);
  }, []);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);
  const onDragOver  = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  }, []);

  const COMPACT_NODE = { width: 172, height: 64 };
  const RESIZABLE_DEFAULTS: Record<string, { width: number; height: number }> = {
    startNode:         COMPACT_NODE,
    endNode:           COMPACT_NODE,
    plugNode:          COMPACT_NODE,
    workdayNode:       COMPACT_NODE,
    salesforceNode:    COMPACT_NODE,
    sapNode:           COMPACT_NODE,
    oracleNode:        COMPACT_NODE,
    mapperNode:        COMPACT_NODE,
    filterNode:        COMPACT_NODE,
    variableStoreNode: COMPACT_NODE,
    fifNode:           COMPACT_NODE,
    loopNode:          COMPACT_NODE,
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

    const plugMeta = meta ? JSON.parse(meta) : {};
    const dims     = RESIZABLE_DEFAULTS[type] ?? COMPACT_NODE;

    // For plug nodes, inject category-aware placeholders at drop time
    const categoryPlaceholders = type === 'plugNode'
      ? {
          _placeholders: getPlugPlaceholders(plugMeta?.category),
          testInputJson: JSON.stringify({ message: 'Hello FloPlug', value: 42 }, null, 2),
        }
      : {};

    setNodes(prev => [...prev, {
      id:   `${type}-${Date.now()}`,
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
          p.connectorId === type || p.connectorId === 'genericNode'
        ),
        ...plugMeta,
        ...categoryPlaceholders,
        availableFlos: flos.map(f => ({ id: f.id, name: f.name })),
      },
    }]);
  }, [rfInstance, hubId, tenantId, updateNodeData, deleteNode, plugs, flos]);

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (wsLoading) {
    return (
      <div style={{ ...s.root, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: '#6b6b80' }}>Loading workspace…</div>
      </div>
    );
  }

  // ── Admin Dashboard view ──────────────────────────────────────────────────
  if (view === 'admin' || view === 'executions' || view === 'scheduler') {
    return (
      <HubAdminDashboard
        hubId={hubId}
        tenantId={tenantId}
        userId={userId}
        permissions={permissions}
        isHubAdmin={isHubAdmin}
        hubName={hubName}
        hubLogoUrl={hubLogoUrl}
        onBack={() => setView('designer')}
      />
    );
  }

  // ── Admin / Dashboard views ────────────────────────────────────────────────
  if (view === 'admin' || view === 'executions' || view === 'scheduler') {
    return (
      <HubAdminDashboard
        hubId={hubId}
        tenantId={tenantId}
        userId={userId}
        permissions={permissions}
        isHubAdmin={isHubAdmin}
        hubName={hubName}
        hubLogoUrl={hubLogoUrl}
        onBack={() => setView('designer')}
      />
    );
  }

  if (!activeWs) {
    return (
      <div style={{ ...s.root, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 14, color: '#6b6b80' }}>No workspace found.</div>
        <div style={{ fontSize: 11, color: '#3a3a50' }}>
          workspaceIds received: [{workspaceIds.join(', ')}]
        </div>
        <div style={{ fontSize: 11, color: '#3a3a50', maxWidth: 360, textAlign: 'center' }}>
          Check that your user profile in Firestore has a populated workspaceIds array
          and that the workspace doc exists under FloPlugHubs/{hubId}/Tenants/{tenantId}/Workspaces/
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={s.root}>

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

        {/* Workspace label — or switcher dropdown for hub admins */}
        {isHubAdmin && allWorkspaces.length > 1 ? (
          <select
            style={{ ...s.flowSelect, maxWidth: 160, color: '#39ff14', fontWeight: 600 }}
            value={activeWs.id}
            onChange={e => {
              const ws = allWorkspaces.find(w => w.id === e.target.value) ?? null;
              if (ws) { setActiveWs(ws); setFlos([]); setActiveFlo(null); }
            }}
          >
            {allWorkspaces.map(ws => (
              <option key={ws.id} value={ws.id}>{ws.workspaceName}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 11, color: '#c0c0cc', flexShrink: 0, fontWeight: 500 }}>
            {activeWs.workspaceName}
          </span>
        )}

        <div style={s.tbSep} />

        {/* Flow selector */}
        <select
          value={activeFlo?.id ?? ''}
          onChange={e => { const f = flos.find(x => x.id === e.target.value); if (f) openFlow(f); }}
          style={s.flowSelect}
        >
          <option value="" disabled>
            {flos.length === 0 ? 'No flos yet…' : 'Select a flow…'}
          </option>
          {flos.map(f => (
            <option key={f.id} value={f.id}>
              {f.isDefault ? '⭐ ' : ''}{f.name}
            </option>
          ))}
        </select>

        <button onClick={() => setNewFlowModalOpen(true)} style={s.btnGhost}>
          + New flow
        </button>

        {/* Hub Admin button — only shown when isHubAdmin confirmed by token */}
        {isHubAdmin && (
          <button
            onClick={() => setAdminPanelOpen(p => !p)}
            style={{
              ...s.btnGhost,
              borderColor: adminPanelOpen ? '#39ff14' : undefined,
              color:        adminPanelOpen ? '#39ff14' : undefined,
            }}
          >
            ⚙ Admin
          </button>
        )}

        {statusMsg && (
          <span style={{ fontSize: 11, color: '#22c55e', fontStyle: 'italic' }}>
            {statusMsg}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {activeFlo?.shortCode && (
            <span style={{ fontSize: 10, color: '#6b6b80', fontFamily: 'monospace' }}>
              {activeFlo.shortCode}
            </span>
          )}
          <span style={{ fontSize: 10, color: '#6b6b80' }}>
            {nodes.length} nodes · {tenantType.toUpperCase()}
          </span>
          {isHubAdmin && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#39ff14',
              background: 'rgba(57,255,20,0.1)', border: '0.5px solid rgba(57,255,20,0.3)',
              borderRadius: 4, padding: '1px 5px', letterSpacing: '0.5px',
            }}>
              HUB ADMIN
            </span>
          )}
          <div style={s.tbSep} />
          <button
            onClick={saveFlo}
            disabled={saving || !activeFlo}
            style={{ ...s.btnGhost, opacity: saving || !activeFlo ? 0.5 : 1, cursor: !activeFlo ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => { setRunResult(null); setRunModalOpen(true); }}
            disabled={!activeFlo}
            style={{ ...s.btnRun, opacity: !activeFlo ? 0.6 : 1, cursor: !activeFlo ? 'not-allowed' : 'pointer' }}
          >
            ▶ Run
          </button>
          <button
            onClick={publishFlow}
            disabled={!activeFlo}
            style={{ ...s.btnPub, opacity: !activeFlo ? 0.5 : 1, cursor: !activeFlo ? 'not-allowed' : 'pointer' }}
          >
            Publish
          </button>
          <div style={s.tbSep} />

          {/* Profile drawer — replaces raw Admin button + HUB ADMIN badge */}
          <ProfileDrawer
            user={{ displayName: userInfo.displayName, email: userInfo.email, role: userRole }}
            isHubAdmin={isHubAdmin}
            permissions={permissions}
            hubName={hubName}
            hubLogoUrl={hubLogoUrl}
            onNavigate={(section: DashboardSection) => setView(section)}
            onSignOut={() => onSignOut?.()}
          />
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div style={s.body}>

        {/* Admin panel — slides in from left when open */}
        <NodePalette plugs={plugs} />

        <div
          ref={wrapperRef}
          style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <ReactFlow
            snapToGrid={true}
            snapGrid={[20, 20]}
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={(instance) => {
              setRfInstance(instance);
              if (pendingViewport.current) {
                instance.setViewport(pendingViewport.current, { duration: 0 });
                pendingViewport.current = null;
              }
            }}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            nodeOrigin={[0, 0]}
            elevateEdgesOnSelect
            reconnectRadius={20}
            onReconnect={(oldEdge, newConnection) => {
              setEdges(eds => eds.map(e =>
                e.id === oldEdge.id
                  ? {
                      ...e,
                      source:       newConnection.source!,
                      target:       newConnection.target!,
                      sourceHandle: newConnection.sourceHandle ?? null,
                      targetHandle: newConnection.targetHandle ?? null,
                    }
                  : e
              ));
            }}
            style={{ background: '#0f1117' }}
            defaultEdgeOptions={{ type: 'deletable', animated: true }}
          >
            <Background
              variant={BackgroundVariant.Lines}
              color="rgba(255,255,255,0.025)"
              gap={[220, 80]}
            />
            <Controls style={{ background: '#181b24', border: '0.5px solid rgba(255,255,255,.1)', borderRadius: 8 }} />
            <MiniMap style={{ background: '#141720', borderRadius: 8 }} nodeColor="#4f8ef7" maskColor="rgba(15,17,23,.7)" />
          </ReactFlow>

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

        {/* Right panel */}
        <div style={s.rightPanel}>
          <NodeInspector node={selectedNode} onUpdate={updateNodeData} ctx={inspectorCtx} />
          <div style={s.logPanel}>
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
        </div>
      </div>
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
    `;
    document.head.appendChild(style);
  }
}

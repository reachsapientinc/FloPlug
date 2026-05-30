import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { FloConnectionSafe, ConnectorUrlToken } from '@floplug/shared';
import { normalizeKitUrlContext, resolveConnectorUrlPreview } from '@floplug/shared';
import type { NodeInspectorProps } from './types';
import { Field, Inp, Sel, TextArea, Btn, Help, Section } from './ui';
import ConnectorUrlPreviewBox from '../components/ConnectorUrlPreviewBox';
import { OutputTargetSection } from './OutputTargetSection';
import { DataPersistenceSection } from './DataPersistenceSection';
import type { NodeDataPersistence } from '@floplug/shared';
import { DEFAULT_NODE_DATA_PERSISTENCE } from '@floplug/shared';
import { InputSourceSection } from './InputSourceSection';
import { NodeTestPanel } from './InspectorChrome';
import { DEFAULT_NODE_TEST_INPUT } from './nodeTestPayload';
import { TemplateEditorModal, CONTENT_TYPES } from '../components/nodes/TemplateNode';
import type { StoreRow } from '../components/nodes/AdvancedNodes';
import { FloActionFieldMapper } from './FloActionFieldMapper';
import type { MappingRuleClient } from '../lib/floActionMapper';
import { MapperInspectorCore } from './MapperInspector';
import { LoopInspectorCore } from './subFloInspectors';
import { ExpressionFieldWithLibrary } from './expression/ExpressionEditorKit';
import { BindingValueInput, type BindingSourceType } from './BindingValueInput';
import {
  FILTER_COMPARE_OPERATORS,
  defaultConditionRows,
  type ConditionRow,
} from '@floplug/shared';
import { ConditionRowsEditor } from './ConditionRowsEditor';
import { SwitchInspectorCore } from './SwitchInspector';
import { IconFilter } from './icons';

const SF_OBJECTS = ['Contact', 'Account', 'Opportunity', 'Lead', 'Case'];
const SF_OPS = ['Query', 'Upsert', 'Insert', 'Update', 'Delete'];
const SAP_MODULES = ['FI', 'MM', 'HR', 'SD', 'PP'];
const SAP_ACTIONS = ['READ_BAPI', 'POST_DOCUMENT', 'GET_TABLE'];
const ORACLE_ACTIONS = ['QUERY', 'INSERT', 'UPDATE', 'CALL_PROC'];
const FILTER_OPERATOR_LABELS: Record<string, string> = {
  '==':  'equals (==)',
  '!=':  'not equals (!=)',
  '>':   'greater than (>)',
  '<':   'less than (<)',
  '>=':  'greater or equal (>=)',
  '<=':  'less or equal (<=)',
};
const TRANSFORMS = ['', 'Upper', 'Lower', 'Trim', 'Round', 'JSON', 'String'];
const WORKDAY_ACTIONS = ['Get_Suppliers', 'Get_Customers', 'Get_Sales_Items', 'Get_Supplier_Invoices', 'Get_Workers'];

const withOutput = (
  Panel: React.FC<NodeInspectorProps>,
  showOutput = true,
): React.FC<NodeInspectorProps> => props => {
  const d = props.node.data as Record<string, unknown>;
  const canTest = props.node.type !== 'startNode' && props.node.type !== 'endNode';
  const testInputJson = String(d.testInputJson ?? DEFAULT_NODE_TEST_INPUT);
  return (
    <>
      <Panel {...props} />
      {showOutput && (
        <OutputTargetSection
          outputTarget={(d.outputTarget as string) ?? 'cStream'}
          outputVarName={(d.outputVarName as string) ?? ''}
          onChange={p => props.onUpdate(props.node.id, p)}
        />
      )}
      <DataPersistenceSection
        value={(d.dataPersistence as NodeDataPersistence | undefined) ?? DEFAULT_NODE_DATA_PERSISTENCE}
        onChange={dataPersistence => props.onUpdate(props.node.id, { dataPersistence })}
      />
      <NodeTestPanel
        nodeId={props.node.id}
        testingNodeId={props.ctx.testingNodeId}
        onTest={() => props.ctx.onTestNode(props.node.id)}
        canTest={canTest}
        testInputJson={canTest ? testInputJson : undefined}
        onTestInputChange={canTest
          ? json => props.onUpdate(props.node.id, { testInputJson: json })
          : undefined}
        result={d._result as string}
        isError={d._isError as boolean}
        loading={d._loading as boolean}
      />
    </>
  );
};

export const MapperInspector = withOutput(MapperInspectorCore);
export const LoopInspector = withOutput(LoopInspectorCore, false);
export const SwitchInspector = withOutput(SwitchInspectorCore);

export {
  SubFloInspector,
  InvokeSubFloInspector,
  SubFloReturnInspector,
} from './subFloInspectors';

export const WorkdayInspector: React.FC<NodeInspectorProps> = withOutput(({ node, onUpdate, ctx: _ctx }) => {
  const d = node.data as Record<string, unknown>;
  return (
    <>
      <Field label="Reference ID"><Inp value={String(d.refId ?? '')} onChange={e => onUpdate(node.id, { refId: e.target.value })} /></Field>
      <Field label="Reference ID Type"><Inp value={String(d.refIdType ?? '')} onChange={e => onUpdate(node.id, { refIdType: e.target.value })} /></Field>
      <Field label="Action">
        <Sel value={String(d.actionType ?? 'Get_Workers')} onChange={e => onUpdate(node.id, { actionType: e.target.value })}>
          {WORKDAY_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </Sel>
      </Field>
    </>
  );
});

export const SalesforceInspector: React.FC<NodeInspectorProps> = withOutput(({ node, onUpdate, ctx: _ctx }) => {
  const d = node.data as Record<string, unknown>;
  return (
    <>
      <Field label="Object"><Sel value={String(d.sfObject ?? 'Contact')} onChange={e => onUpdate(node.id, { sfObject: e.target.value })}>{SF_OBJECTS.map(o => <option key={o}>{o}</option>)}</Sel></Field>
      <Field label="Operation"><Sel value={String(d.operation ?? 'Query')} onChange={e => onUpdate(node.id, { operation: e.target.value })}>{SF_OPS.map(o => <option key={o}>{o}</option>)}</Sel></Field>
      <Field label="Filter / payload"><Inp value={String(d.filter ?? '')} onChange={e => onUpdate(node.id, { filter: e.target.value })} /></Field>
    </>
  );
});

export const SapInspector: React.FC<NodeInspectorProps> = withOutput(({ node, onUpdate, ctx: _ctx }) => {
  const d = node.data as Record<string, unknown>;
  return (
    <>
      <Field label="Module"><Sel value={String(d.sapModule ?? 'FI')} onChange={e => onUpdate(node.id, { sapModule: e.target.value })}>{SAP_MODULES.map(m => <option key={m}>{m}</option>)}</Sel></Field>
      <Field label="Action"><Sel value={String(d.action ?? 'READ_BAPI')} onChange={e => onUpdate(node.id, { action: e.target.value })}>{SAP_ACTIONS.map(a => <option key={a}>{a}</option>)}</Sel></Field>
      <Field label="BAPI / Table"><Inp value={String(d.bapi ?? '')} onChange={e => onUpdate(node.id, { bapi: e.target.value })} /></Field>
    </>
  );
});

export const OracleInspector: React.FC<NodeInspectorProps> = withOutput(({ node, onUpdate, ctx: _ctx }) => {
  const d = node.data as Record<string, unknown>;
  return (
    <>
      <Field label="Action"><Sel value={String(d.action ?? 'QUERY')} onChange={e => onUpdate(node.id, { action: e.target.value })}>{ORACLE_ACTIONS.map(a => <option key={a}>{a}</option>)}</Sel></Field>
      <Field label="SQL / Procedure"><Inp value={String(d.sqlOrProc ?? '')} onChange={e => onUpdate(node.id, { sqlOrProc: e.target.value })} /></Field>
    </>
  );
});

export const FilterInspector: React.FC<NodeInspectorProps> = withOutput(({ node, onUpdate }) => {
  const d = node.data as Record<string, unknown>;
  const operator = String(d.operator ?? '==');
  const legacyExpressionMode = operator === 'expression';
  const rows = (d.conditionRows as ConditionRow[] | undefined)?.length
    ? (d.conditionRows as ConditionRow[])
    : defaultConditionRows();

  return (
    <>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconFilter color="#0f766e" />
        <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af' }}>Filter conditions</span>
      </div>

      {legacyExpressionMode ? (
        <>
          <Field label="Boolean expression (legacy)">
            <ExpressionFieldWithLibrary
              value={String(d.value ?? '')}
              onChange={v => onUpdate(node.id, { value: v })}
              placeholder="e.g. exists(cStream.email) AND tonumber(cStream.amount) > 0"
              layout="stack"
            />
          </Field>
          <Btn variant="ghost" fullWidth onClick={() => onUpdate(node.id, { operator: '==', conditionRows: defaultConditionRows() })}>
            Switch to row-based conditions
          </Btn>
        </>
      ) : (
        <ConditionRowsEditor
          rows={rows}
          onChange={conditionRows => onUpdate(node.id, { conditionRows, operator: '==' })}
        />
      )}

      <Field label="If condition fails">
        <Sel value={String(d.onSkip ?? 'stop')} onChange={e => onUpdate(node.id, { onSkip: e.target.value })}>
          <option value="stop">Stop flow</option>
          <option value="continue">Continue with empty payload</option>
        </Sel>
      </Field>
    </>
  );
});


const defaultStoreRow = (): StoreRow => ({ action: 'set', scope: 'global', varName: '', sourcePath: '', targetPath: '' });

export const VariableStoreInspector: React.FC<NodeInspectorProps> = withOutput(({ node, onUpdate }) => {
  const d = node.data as Record<string, unknown>;
  const rows = (d.rows as StoreRow[]) ?? [defaultStoreRow()];
  const setRows = (next: StoreRow[]) => onUpdate(node.id, { rows: next });
  return (
    <>
      {rows.map((row, i) => (
        <Section key={i} title={`Row ${i + 1}`}>
          <Field label="Action">
            <Sel value={row.action} onChange={e => setRows(rows.map((r, idx) => idx === i ? { ...r, action: e.target.value as StoreRow['action'] } : r))}>
              <option value="set">Set</option><option value="get">Get</option><option value="clear">Clear</option>
            </Sel>
          </Field>
          <Field label="Scope">
            <Sel value={row.scope} onChange={e => setRows(rows.map((r, idx) => idx === i ? { ...r, scope: e.target.value as StoreRow['scope'] } : r))}>
              <option value="global">Global</option><option value="local">Local</option>
            </Sel>
          </Field>
          <Field label="Variable"><Inp value={row.varName} onChange={e => setRows(rows.map((r, idx) => idx === i ? { ...r, varName: e.target.value } : r))} /></Field>
          {row.action === 'set' && <Field label="Source path"><Inp value={row.sourcePath} onChange={e => setRows(rows.map((r, idx) => idx === i ? { ...r, sourcePath: e.target.value } : r))} /></Field>}
          {row.action === 'get' && <Field label="Target path"><Inp value={row.targetPath} onChange={e => setRows(rows.map((r, idx) => idx === i ? { ...r, targetPath: e.target.value } : r))} /></Field>}
          <Btn variant="danger" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}>Remove row</Btn>
        </Section>
      ))}
      <Btn variant="ghost" fullWidth onClick={() => setRows([...rows, defaultStoreRow()])}>+ Add operation</Btn>
    </>
  );
});

export const FIFInspector: React.FC<NodeInspectorProps> = withOutput(({ node, onUpdate, ctx }) => {
  const d = node.data as Record<string, unknown>;
  const disabled = ctx.activeFloId ? [ctx.activeFloId] : [];
  return (
    <>
      <Field label="Sub-flow">
        <Sel value={String(d.selectedFloId ?? '')} onChange={e => onUpdate(node.id, { selectedFloId: e.target.value })}>
          <option value="">— Select —</option>
          {ctx.flos.map(f => (
            <option key={f.id} value={f.id} disabled={disabled.includes(f.id)}>{f.name}</option>
          ))}
        </Sel>
      </Field>
      <Help>cStream passes into sub-flow and returns its output.</Help>
    </>
  );
});


const FN_PLACEHOLDER = `return { processed: cStream.message?.value };`;

export const FunctionInspector: React.FC<NodeInspectorProps> = withOutput(({ node, onUpdate }) => {
  const d = node.data as Record<string, unknown>;
  return (
    <>
      <Field label="Output mode">
        <Sel value={String(d.outputMode ?? 'overwrite')} onChange={e => onUpdate(node.id, { outputMode: e.target.value })}>
          <option value="overwrite">Overwrite cStream.message</option>
          <option value="append">Append at path</option>
        </Sel>
      </Field>
      {d.outputMode === 'append' && (
        <Field label="Target path"><Inp value={String(d.targetPath ?? '')} onChange={e => onUpdate(node.id, { targetPath: e.target.value })} /></Field>
      )}
      <Field label="Code"><TextArea rows={12} value={String(d.code ?? FN_PLACEHOLDER)} onChange={e => onUpdate(node.id, { code: e.target.value })} spellCheck={false} /></Field>
    </>
  );
});

export const TemplateInspector: React.FC<NodeInspectorProps> = withOutput(({ node, onUpdate }) => {
  const d = node.data as Record<string, unknown>;
  const [open, setOpen] = useState(false);
  return (
    <>
      <Field label="Content type">
        <Sel value={String(d.contentType ?? 'text/plain')} onChange={e => onUpdate(node.id, { contentType: e.target.value })}>
          {CONTENT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Sel>
      </Field>
      <Field label="Output mode">
        <Sel value={String(d.outputMode ?? 'overwrite')} onChange={e => onUpdate(node.id, { outputMode: e.target.value })}>
          <option value="overwrite">Overwrite cStream</option>
          <option value="store">Store in variable</option>
        </Sel>
      </Field>
      {d.outputMode === 'store' && (
        <>
          <Field label="Scope"><Sel value={String(d.storeScope ?? 'global')} onChange={e => onUpdate(node.id, { storeScope: e.target.value })}><option value="global">Global</option><option value="local">Local</option></Sel></Field>
          <Field label="Variable name"><Inp value={String(d.storeName ?? '')} onChange={e => onUpdate(node.id, { storeName: e.target.value })} /></Field>
        </>
      )}
      <Btn fullWidth onClick={() => setOpen(true)}>Edit template</Btn>
      <Help>{(String(d.template ?? '').split('\n').length)} lines</Help>
      {open && (
        <TemplateEditorModal
          value={String(d.template ?? '')}
          contentType={String(d.contentType ?? 'text/plain')}
          outputMode={String(d.outputMode ?? 'overwrite')}
          storeScope={String(d.storeScope ?? 'global')}
          storeName={String(d.storeName ?? '')}
          onSave={(t, ct, om, sc, sn) => { onUpdate(node.id, { template: t, contentType: ct, outputMode: om, storeScope: sc, storeName: sn }); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
});

export const StartInspector: React.FC<NodeInspectorProps> = ({ node, onUpdate, ctx }) => {
  const d = node.data as Record<string, unknown>;
  const initVars = (d.initVars as { key: string; value: string }[]) ?? [];
  const patch = (next: typeof initVars) => onUpdate(node.id, { initVars: next });
  return (
    <>
      {initVars.map((v, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 24px', gap: 4, marginBottom: 6 }}>
          <Inp value={v.key} placeholder="key" onChange={e => patch(initVars.map((x, idx) => idx === i ? { ...x, key: e.target.value } : x))} />
          <Inp value={v.value} placeholder="value" onChange={e => patch(initVars.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))} />
          <button type="button" onClick={() => patch(initVars.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>×</button>
        </div>
      ))}
      <Btn variant="ghost" fullWidth onClick={() => patch([...initVars, { key: '', value: '' }])}>+ Init global variable</Btn>
      <NodeTestPanel nodeId={node.id} testingNodeId={ctx.testingNodeId} onTest={() => ctx.onTestNode(node.id)} canTest={false} />
    </>
  );
};

export const EndInspector: React.FC<NodeInspectorProps> = ({ node, onUpdate, ctx }) => {
  const d = node.data as Record<string, unknown>;
  const params = (d.outputParams as string[]) ?? [];
  const patch = (next: string[]) => onUpdate(node.id, { outputParams: next });
  return (
    <>
      <Help>Leave empty to return full cStream at end of run.</Help>
      {params.map((p, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 24px', gap: 4, marginBottom: 6 }}>
          <Inp value={p} placeholder="e.g. invoice.total" onChange={e => patch(params.map((x, idx) => idx === i ? e.target.value : x))} />
          <button type="button" onClick={() => patch(params.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>×</button>
        </div>
      ))}
      <Btn variant="ghost" fullWidth onClick={() => patch([...params, ''])}>+ Output param</Btn>
      {d.output && (
        <pre style={{ marginTop: 10, fontSize: 9, color: '#22c55e', whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto' }}>{String(d.output)}</pre>
      )}
      <NodeTestPanel nodeId={node.id} testingNodeId={ctx.testingNodeId} onTest={() => ctx.onTestNode(node.id)} canTest={false} />
    </>
  );
};

export const FloActionInspector: React.FC<NodeInspectorProps> = withOutput(({ node, onUpdate, ctx }) => {
  const d = node.data as Record<string, unknown>;

  // Live arrays injected at hydration from FloActionNodeDoc — never fetched here
  const actionIds            = (d.actionIds            as string[]) ?? [];
  const allowedConnectionIds = (d.allowedConnectionIds as string[]) ?? [];
  const defaultConnectionId  = (d.defaultConnectionId  as string)  ?? '';
  const templateActionId     = (d.templateActionId     as string)  ?? '';
  const connectorId          = (d.connectorId          as string)  ?? '';
  const floKitId             = (d.floKitId             as string)  ?? '';

  // Developer's persisted choices — fall back to node defaults
  const selectedActionId = (d.actionId as string)
    || templateActionId
    || actionIds[0]
    || '';

  const selectedConnectionId = (d.connectionId as string)
    || defaultConnectionId
    || allowedConnectionIds[0]
    || '';

  const liveHubDoc = floKitId ? ctx.getHubActionDoc?.(floKitId) : undefined;
  const urlTokensSnapshot = (
    (d.urlTokensSnapshot as ConnectorUrlToken[] | undefined)
    ?? liveHubDoc?.urlTokensSnapshot
    ?? []
  );
  const kitUrlContext = useMemo(
    () => normalizeKitUrlContext(
      (d.kitUrlContext ?? liveHubDoc?.kitUrlContext) as {
        serviceModule?: string;
        serviceVersion?: string;
        schemaLabel?: string;
        schemaVersion?: string;
        urlTokenValues?: Record<string, string>;
      } | undefined,
      floKitId,
      urlTokensSnapshot,
    ),
    [d.kitUrlContext, liveHubDoc?.kitUrlContext, floKitId, urlTokensSnapshot],
  );

  // Sync hub kit URL snapshot onto canvas node when hub doc arrives after load
  React.useEffect(() => {
    if (!liveHubDoc?.kitUrlContext && !liveHubDoc?.urlTokensSnapshot?.length) return;
    const patch: Record<string, unknown> = {};
    if (liveHubDoc.kitUrlContext && !d.kitUrlContext) {
      patch.kitUrlContext = liveHubDoc.kitUrlContext;
    }
    if (liveHubDoc.urlTokensSnapshot?.length && !(d.urlTokensSnapshot as unknown[])?.length) {
      patch.urlTokensSnapshot = liveHubDoc.urlTokensSnapshot;
    }
    if (Object.keys(patch).length > 0) onUpdate(node.id, patch);
  }, [node.id, liveHubDoc?.kitUrlContext, liveHubDoc?.urlTokensSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps
  const floActionNodeTokenDefs = (d.floActionNodeUrlTokens as { key: string; label?: string; description?: string; field?: string }[] | undefined) ?? [];
  const floActionUrlByConn = (d.floActionUrlValuesByConnection as Record<string, Record<string, string>> | undefined) ?? {};
  const urlVariables = (d.urlVariables ?? {}) as Record<string, { source: string; value: string }>;
  const floActionNodeVars = floActionNodeTokenDefs.length > 0
    ? floActionNodeTokenDefs.map(t => t.key)
    : [];

  const [connections, setConnections] = useState<FloConnectionSafe[]>([]);
  const [loadingConns, setLoadingConns] = useState(false);

  const fetchConnections = useCallback(async () => {
    if (!ctx.hubId || !ctx.tenantId || allowedConnectionIds.length === 0) return;
    setLoadingConns(true);
    try {
      const fn = httpsCallable<
        { hubId: string; tenantId: string },
        { connections: FloConnectionSafe[] }
      >(getFunctions(), 'getFloConnections');
      const res = await fn({ hubId: ctx.hubId, tenantId: ctx.tenantId });
      const allowed = new Set(allowedConnectionIds);
      setConnections((res.data.connections ?? []).filter(c => allowed.has(c.id) && c.isActive !== false));
    } catch {
      setConnections([]);
    } finally {
      setLoadingConns(false);
    }
  }, [ctx.hubId, ctx.tenantId, allowedConnectionIds.join(',')]);

  useEffect(() => { void fetchConnections(); }, [fetchConnections]);

  const selectedConn = connections.find(c => c.id === selectedConnectionId);
  const floActionNodeVals = useMemo(() => {
    const out: Record<string, string> = {};
    for (const t of floActionNodeTokenDefs) {
      const b = urlVariables[t.key];
      if (b?.source === 'static' && b.value?.trim()) {
        out[t.key] = b.value.trim();
        if (t.field) out[t.field] = b.value.trim();
      }
    }
    return out;
  }, [floActionNodeTokenDefs, urlVariables]);

  const floActionUrlPreview = useMemo(() => {
    if (!urlTokensSnapshot.length || !selectedConn) return '';
    return resolveConnectorUrlPreview({
      urlTokens: urlTokensSnapshot,
      connection: {
        urlTokenValues: selectedConn.urlTokenValues,
        hostname: selectedConn.hostname,
        tenantKey: selectedConn.tenantKey,
        baseUrl: selectedConn.baseUrl,
      },
      kit: kitUrlContext,
      floActionValues: floActionUrlByConn[selectedConnectionId] ?? {},
      floActionNodeValues: floActionNodeVals,
    });
  }, [urlTokensSnapshot, selectedConn, kitUrlContext, floActionUrlByConn, selectedConnectionId, floActionNodeVals]);

  // Initialise defaults once on mount if missing
  React.useEffect(() => {
    const patch: Record<string, unknown> = {};
    if (!d.inputSource) patch.inputSource = 'cStream';
    if (!d.inputContentType) patch.inputContentType = 'application/json';
    if (!d.outputTarget) patch.outputTarget = 'cStream';
    if (!d.actionId && (templateActionId || actionIds[0]))
      patch.actionId = templateActionId || actionIds[0];
    if (!d.connectionId && (defaultConnectionId || allowedConnectionIds[0]))
      patch.connectionId = defaultConnectionId || allowedConnectionIds[0];
    if (Object.keys(patch).length > 0) onUpdate(node.id, patch);
  }, [node.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const notConfigured = actionIds.length === 0;

  return (
    <>
      {/* Identity — read-only */}
      <Field label="Connector">
        <Inp value={connectorId || '—'} disabled />
      </Field>
      <Field label="FloKit">
        <Inp value={floKitId || '—'} disabled />
      </Field>

      <InputSourceSection
        inputSource={(d.inputSource as string) ?? 'cStream'}
        inputVarName={(d.inputVarName as string) ?? ''}
        inputContentType={(d.inputContentType as string) ?? 'application/json'}
        onChange={p => onUpdate(node.id, p)}
      />

      {/* Warning if live doc hasn't arrived yet */}
      {notConfigured && (
        <div style={{
          fontSize: 10, color: '#f59e0b', padding: '6px 10px', borderRadius: 6,
          background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.25)',
          lineHeight: 1.5, marginBottom: 4,
        }}>
          ⚠ Configuration loading… If this persists, ask your Hub Admin to check the Action Node setup.
        </div>
      )}

      {/* Action chip selector */}
      <Field label="Action">
        {notConfigured ? (
          <span style={{ fontSize: 10, color: '#3a3a50', fontStyle: 'italic' }}>No actions configured.</span>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
              {actionIds.map(id => {
                const isSelected = selectedActionId === id;
                const isDefault  = id === templateActionId;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onUpdate(node.id, { actionId: id })}
                    style={{
                      fontSize: 9, padding: '3px 9px', borderRadius: 12, cursor: 'pointer',
                      border: isSelected ? '1px solid #10b981' : '1px solid #3a3a50',
                      background: isSelected ? 'rgba(16,185,129,0.15)' : 'transparent',
                      color: isSelected ? '#10b981' : '#6b7280',
                      fontWeight: isDefault ? 700 : 400,
                      fontFamily: 'inherit',
                    }}
                  >
                    {id}{isDefault ? ' ★' : ''}
                  </button>
                );
              })}
            </div>
            <Help>★ = Hub Admin default. Click to override for this node.</Help>
          </>
        )}
      </Field>

      {/* Connection dropdown */}
      <Field label="Connection">
        {allowedConnectionIds.length === 0 ? (
          <span style={{ fontSize: 10, color: '#3a3a50', fontStyle: 'italic' }}>No connections configured.</span>
        ) : (
          <>
            <Sel
              value={selectedConnectionId}
              onChange={e => onUpdate(node.id, { connectionId: e.target.value })}
            >
              {allowedConnectionIds.map(cid => (
                <option key={cid} value={cid}>
                  {cid}{cid === defaultConnectionId ? '  (default)' : ''}
                </option>
              ))}
            </Sel>
            {selectedConnectionId !== defaultConnectionId && defaultConnectionId && (
              <Help>
                Default: {defaultConnectionId}.{' '}
                <button
                  type="button"
                  onClick={() => onUpdate(node.id, { connectionId: defaultConnectionId })}
                  style={{
                    background: 'none', border: 'none', color: '#4f8ef7',
                    fontSize: 9, cursor: 'pointer', padding: 0, textDecoration: 'underline',
                  }}
                >
                  Reset
                </button>
              </Help>
            )}
          </>
        )}
      </Field>

      {floActionNodeVars.map(varName => {
        const tokenDef = floActionNodeTokenDefs.find(t => t.key === varName);
        const binding = urlVariables[varName];
        const label = tokenDef?.label ?? varName;
        return (
          <Field key={varName} label={label}>
            <div style={{ display: 'flex', gap: 5 }}>
              <Sel style={{ flex: '0 0 75px' }} value={binding?.source ?? 'static'}
                onChange={e => onUpdate(node.id, {
                  urlVariables: { ...urlVariables, [varName]: { source: e.target.value, value: binding?.value ?? '' } },
                })}>
                <option value="static">Static</option>
                <option value="cStream">cStream</option>
                <option value="global">Global</option>
                <option value="local">Local</option>
              </Sel>
              <Inp value={binding?.value ?? ''} placeholder={varName}
                onChange={e => onUpdate(node.id, {
                  urlVariables: { ...urlVariables, [varName]: { source: binding?.source ?? 'static', value: e.target.value } },
                })} />
            </div>
            {tokenDef?.description && (
              <div style={{ fontSize: 10, color: '#6b6b80', marginTop: 4 }}>{tokenDef.description}</div>
            )}
          </Field>
        );
      })}

      {urlTokensSnapshot.length > 0 && (
        <Field label="Resolved service URL">
          {loadingConns ? (
            <Help>Loading connection details…</Help>
          ) : selectedConn ? (
            <ConnectorUrlPreviewBox
              preview={floActionUrlPreview}
              urlTokens={urlTokensSnapshot}
              captureSources={['floActionNode']}
              connection={{
                urlTokenValues: selectedConn.urlTokenValues,
                hostname: selectedConn.hostname,
                tenantKey: selectedConn.tenantKey,
                baseUrl: selectedConn.baseUrl,
              }}
              kit={kitUrlContext}
              floActionValues={floActionUrlByConn[selectedConnectionId] ?? {}}
              floActionNodeValues={floActionNodeVals}
            />
          ) : (
            <Help>Select a connection to preview the assembled URL.</Help>
          )}
        </Field>
      )}

      {selectedActionId && connectorId && floKitId && (
        <FloActionFieldMapper
          functions={ctx.functions}
          hubId={ctx.hubId}
          tenantId={ctx.tenantId}
          connectorId={connectorId}
          floKitId={floKitId}
          actionId={selectedActionId}
          connectionId={selectedConnectionId}
          mappingRules={(d.mappingRules as MappingRuleClient[]) ?? []}
          onRulesChange={rules => onUpdate(node.id, { mappingRules: rules })}
        />
      )}
    </>
  );
  // withOutput() adds OutputTargetSection + NodeTestPanel automatically
});
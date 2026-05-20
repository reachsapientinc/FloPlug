import React, { useState } from 'react';
import type { NodeInspectorProps } from './types';
import { Field, Inp, Sel, TextArea, Btn, Help, Section } from './ui';
import { OutputTargetSection } from './OutputTargetSection';
import { InputSourceSection } from './InputSourceSection';
import { NodeTestPanel } from './InspectorChrome';
import { TemplateEditorModal, CONTENT_TYPES } from '../components/nodes/TemplateNode';
import type { StoreRow } from '../components/nodes/AdvancedNodes';

const SF_OBJECTS = ['Contact', 'Account', 'Opportunity', 'Lead', 'Case'];
const SF_OPS = ['Query', 'Upsert', 'Insert', 'Update', 'Delete'];
const SAP_MODULES = ['FI', 'MM', 'HR', 'SD', 'PP'];
const SAP_ACTIONS = ['READ_BAPI', 'POST_DOCUMENT', 'GET_TABLE'];
const ORACLE_ACTIONS = ['QUERY', 'INSERT', 'UPDATE', 'CALL_PROC'];
const OPERATORS = ['==', '!=', '>', '<', '>=', '<=', 'contains', 'startsWith'];
const TRANSFORMS = ['', 'Upper', 'Lower', 'Trim', 'Round', 'JSON', 'String'];
const WORKDAY_ACTIONS = ['Get_Suppliers', 'Get_Customers', 'Get_Sales_Items', 'Get_Supplier_Invoices', 'Get_Workers'];

const withOutput = (
  Panel: React.FC<NodeInspectorProps>,
  showOutput = true,
): React.FC<NodeInspectorProps> => props => {
  const d = props.node.data as Record<string, unknown>;
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
      <NodeTestPanel
        nodeId={props.node.id}
        testingNodeId={props.ctx.testingNodeId}
        onTest={() => props.ctx.onTestNode(props.node.id)}
        canTest={props.node.type !== 'startNode' && props.node.type !== 'endNode'}
        result={d._result as string}
        isError={d._isError as boolean}
        loading={d._loading as boolean}
      />
    </>
  );
};

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
  return (
    <>
      <Field label="Field path"><Inp value={String(d.field ?? '')} onChange={e => onUpdate(node.id, { field: e.target.value })} /></Field>
      <Field label="Operator"><Sel value={String(d.operator ?? '==')} onChange={e => onUpdate(node.id, { operator: e.target.value })}>{OPERATORS.map(o => <option key={o}>{o}</option>)}</Sel></Field>
      <Field label="Value"><Inp value={String(d.value ?? '')} onChange={e => onUpdate(node.id, { value: e.target.value })} /></Field>
      <Field label="If condition fails">
        <Sel value={String(d.onSkip ?? 'stop')} onChange={e => onUpdate(node.id, { onSkip: e.target.value })}>
          <option value="stop">Stop flow</option>
          <option value="continue">Continue with empty payload</option>
        </Sel>
      </Field>
    </>
  );
});

export const MapperInspector: React.FC<NodeInspectorProps> = withOutput(({ node, onUpdate }) => {
  const d = node.data as Record<string, unknown>;
  const raw = (d.mappings as string[]) ?? [];
  const mapMode = String(d.mapMode ?? 'pure');
  const pairs = raw.map(m => {
    const [mappingPart = '', tgt = ''] = m.split('→').map(s => s.trim());
    const [src = '', transform = ''] = mappingPart.split('|').map(s => s.trim());
    return { src, transform, tgt };
  });
  const commit = (next: typeof pairs) =>
    onUpdate(node.id, { mappings: next.map(p => `${p.src}${p.transform ? ` | ${p.transform}` : ''} → ${p.tgt}`) });

  return (
    <>
      <Field label="Mode">
        <Sel value={mapMode} onChange={e => onUpdate(node.id, { mapMode: e.target.value })}>
          <option value="pure">Pure — output only mapped fields</option>
          <option value="transform">Transform — keep unmapped fields</option>
        </Sel>
      </Field>
      {pairs.map((pair, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 1fr 20px', gap: 4, marginBottom: 6 }}>
          <Inp value={pair.src} placeholder="source" onChange={e => commit(pairs.map((p, idx) => idx === i ? { ...p, src: e.target.value } : p))} />
          <Sel value={pair.transform} onChange={e => commit(pairs.map((p, idx) => idx === i ? { ...p, transform: e.target.value } : p))}>
            {TRANSFORMS.map(t => <option key={t} value={t}>{t || 'None'}</option>)}
          </Sel>
          <Inp value={pair.tgt} placeholder="target" onChange={e => commit(pairs.map((p, idx) => idx === i ? { ...p, tgt: e.target.value } : p))} />
          <button type="button" onClick={() => commit(pairs.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>×</button>
        </div>
      ))}
      <Btn variant="ghost" fullWidth onClick={() => commit([...pairs, { src: '', transform: '', tgt: '' }])}>+ Add mapping</Btn>
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

const LOOP_EXPR = `// iteration = 0-based count\niteration < 10`;

export const LoopInspector: React.FC<NodeInspectorProps> = withOutput(({ node, onUpdate, ctx }) => {
  const d = node.data as Record<string, unknown>;
  const mode = String(d.mode ?? 'iterator');
  return (
    <>
      <Field label="Loop mode">
        <Sel value={mode} onChange={e => onUpdate(node.id, { mode: e.target.value })}>
          <option value="iterator">Iterator</option>
          <option value="expression">Expression</option>
        </Sel>
      </Field>
      {mode === 'iterator' ? (
        <>
          <Field label="Array path"><Inp value={String(d.arrayPath ?? '')} placeholder="e.g. data.items" onChange={e => onUpdate(node.id, { arrayPath: e.target.value })} /></Field>
          <Field label="Item variable"><Inp value={String(d.itemVar ?? '_item')} onChange={e => onUpdate(node.id, { itemVar: e.target.value })} /></Field>
        </>
      ) : (
        <Field label="Continue while (JS)">
          <TextArea rows={6} value={String(d.expression ?? LOOP_EXPR)} onChange={e => onUpdate(node.id, { expression: e.target.value })} />
        </Field>
      )}
      <Field label="Body flow">
        <Sel value={String(d.bodyFloId ?? '')} onChange={e => onUpdate(node.id, { bodyFloId: e.target.value })}>
          <option value="">— Select —</option>
          {ctx.flos.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Sel>
      </Field>
      <Field label="Max iterations"><Inp type="number" value={Number(d.maxIterations ?? 100)} onChange={e => onUpdate(node.id, { maxIterations: Math.min(500, Math.max(1, Number(e.target.value))) })} /></Field>
      <Field label="Store result as (global)"><Inp value={String(d.storeResultAs ?? '')} onChange={e => onUpdate(node.id, { storeResultAs: e.target.value })} /></Field>
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

export const FloActionInspector: React.FC<NodeInspectorProps> = withOutput(({ node, onUpdate }) => {
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
    </>
  );
  // withOutput() adds OutputTargetSection + NodeTestPanel automatically
});
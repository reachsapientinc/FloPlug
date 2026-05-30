/** Plug + email inspectors (moved from NodePaletteAndInspector). */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { PlugVariableHint, PlugVariableBinding, FloConnectionSafe, ConnectorUrlToken } from '@floplug/shared';
import {
  extractUrlTemplateVarNames,
  isDeveloperPlugUrlVar,
  resolveConnectorUrlPreview,
  tokenHasSource,
} from '@floplug/shared';
import ConnectorUrlPreviewBox from '../components/ConnectorUrlPreviewBox';
import type { NodeInspectorProps } from './types';
import { Section, Field, Inp, Sel, Help } from './ui';
import { NodeTestPanel } from './InspectorChrome';
import { OutputTargetSection } from './OutputTargetSection';
import { DataPersistenceSection } from './DataPersistenceSection';
import type { NodeDataPersistence } from '@floplug/shared';
import { DEFAULT_NODE_DATA_PERSISTENCE } from '@floplug/shared';
import { PlugTestInput } from './PlugTestInput';
import { DEFAULT_PLUG_TEST_INPUT } from './plugTest';
import { useTheme } from '../theme/ThemeContext';

import { BindingValueInput, type BindingSourceType } from './BindingValueInput';

interface EmailFieldBinding {
  source: BindingSourceType;
  value: string;
  asAttachment?: boolean;
  fileName?: string;
  contentType?: string;
}
type EmailBindings = Record<string, EmailFieldBinding>;
const CONTENT_TYPES = [
  'text/plain', 'text/csv', 'text/html', 'text/xml', 'application/pdf',
  'application/json', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
];
const EMAIL_FIELDS: { key: string; label: string; isList?: boolean }[] = [
  { key: 'to', label: 'To', isList: true }, { key: 'cc', label: 'CC', isList: true },
  { key: 'bcc', label: 'BCC', isList: true }, { key: 'subject', label: 'Subject' },
  { key: 'body', label: 'Body' },
];

const EmailFieldRow: React.FC<{
  fieldKey: string; label: string; isList?: boolean;
  binding: EmailFieldBinding; onChange: (p: Partial<EmailFieldBinding>) => void;
}> = ({ fieldKey, label, binding, onChange }) => {
  const t = useTheme();

  if (fieldKey === 'body' && binding.source === 'static') {
    return (
      <Section>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 9, color: t.accent, fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
          <Sel value={binding.source} onChange={e => onChange({ source: e.target.value as BindingSourceType, asAttachment: false })} style={{ width: 88, fontSize: 9 }}>
            <option value="static">Static</option>
            <option value="cStream">cStream</option>
            <option value="local">Local</option>
            <option value="global">Global</option>
            <option value="expression">Expression</option>
          </Sel>
        </div>
        <textarea
          value={binding.value}
          onChange={e => onChange({ value: e.target.value })}
          style={{
            width: '100%', minHeight: 90, padding: '5px 7px', borderRadius: 4,
            border: `0.5px solid ${t.border}`, background: t.inputBg, color: t.inputText,
            fontSize: 10, resize: 'vertical',
          }}
        />
        <BodyAttachmentExtras binding={binding} onChange={onChange} t={t} />
      </Section>
    );
  }

  return (
    <Section>
      <BindingValueInput
        label={label}
        source={binding.source}
        value={binding.value}
        onChange={p => onChange({ ...p, asAttachment: false })}
        pathPlaceholder={
          fieldKey === 'to' || fieldKey === 'cc' || fieldKey === 'bcc'
            ? 'defaultToEmail'
            : 'dot.path'
        }
        compact={binding.source !== 'expression'}
      />
      {fieldKey === 'body' && binding.source !== 'static' && binding.source !== 'expression' && (
        <BodyAttachmentExtras binding={binding} onChange={onChange} t={t} />
      )}
    </Section>
  );
};

const BodyAttachmentExtras: React.FC<{
  binding: EmailFieldBinding;
  onChange: (p: Partial<EmailFieldBinding>) => void;
  t: ReturnType<typeof useTheme>;
}> = ({ binding, onChange, t }) => (
  <>
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      {[{ val: false, label: 'Inline' }, { val: true, label: 'Attachment' }].map(opt => (
        <button key={String(opt.val)} type="button" onClick={() => onChange({ asAttachment: opt.val })} style={{
          flex: 1, padding: '4px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
          border: `0.5px solid ${binding.asAttachment === opt.val ? t.accent : t.border}`,
          background: binding.asAttachment === opt.val ? `${t.accent}22` : 'transparent',
          color: binding.asAttachment === opt.val ? t.accent : t.textMuted,
        }}>{opt.label}</button>
      ))}
    </div>
    {binding.asAttachment && (
      <>
        <Field label="File name"><Inp value={binding.fileName ?? ''} onChange={e => onChange({ fileName: e.target.value })} /></Field>
        <Field label="Content type">
          <Sel value={binding.contentType ?? ''} onChange={e => onChange({ contentType: e.target.value })}>
            <option value="">— Select —</option>
            {CONTENT_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
          </Sel>
        </Field>
      </>
    )}
  </>
);

export const PlugNodeInspectorPanel: React.FC<NodeInspectorProps> = ({ node, onUpdate, ctx }) => {
  const t = useTheme();
  const d = node.data as Record<string, unknown>;
  const isEmail = d.authProtocol === 'smtp_basic' || d.nodeType === 'emailNode';

  const authProtocol = String(d.authProtocol ?? '');
  const allowedConnectionIds = (d.allowedConnectionIds as string[]) ?? [];
  const defaultConnectionId = String(d.defaultConnectionId ?? '');
  const selectedConnectionId = String(d.connectionId ?? defaultConnectionId ?? '');

  const [connections, setConnections] = useState<FloConnectionSafe[]>([]);
  const [loadingConns, setLoadingConns] = useState(false);
  const [connError, setConnError] = useState('');

  const fetchConnections = useCallback(async () => {
    if (!authProtocol || !ctx.hubId || !ctx.tenantId) return;
    setLoadingConns(true);
    setConnError('');
    try {
      const fn = httpsCallable<
        { hubId: string; tenantId: string; authProtocol: string },
        { connections: FloConnectionSafe[] }
      >(getFunctions(), 'getFloConnectionsForPlug');
      const res = await fn({ hubId: ctx.hubId, tenantId: ctx.tenantId, authProtocol });
      let list = res.data.connections ?? [];
      if (allowedConnectionIds.length > 0) {
        const allowed = new Set(allowedConnectionIds);
        list = list.filter(c => allowed.has(c.id));
      }
      setConnections(list);
    } catch (e: unknown) {
      setConnError(e instanceof Error ? e.message : 'Failed to load connections.');
    } finally {
      setLoadingConns(false);
    }
  }, [authProtocol, ctx.hubId, ctx.tenantId, allowedConnectionIds.join(',')]);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  useEffect(() => {
    if (isEmail) return;
    const patch: Record<string, unknown> = {};
    if (!d.connectionId && (defaultConnectionId || connections[0]?.id)) {
      patch.connectionId = defaultConnectionId || connections[0]?.id;
    }
    if (Object.keys(patch).length > 0) onUpdate(node.id, patch);
  }, [node.id, isEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isEmail) {
    const bindings = (d.emailBindings ?? {}) as EmailBindings;
    const get = (k: string): EmailFieldBinding => bindings[k] ?? { source: 'static', value: '' };
    const patch = (k: string, p: Partial<EmailFieldBinding>) =>
      onUpdate(node.id, { emailBindings: { ...bindings, [k]: { ...get(k), ...p } } });

    return (
      <>
        <Section>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.accent }}>✉ {String(d.plugName ?? 'Email plug')}</div>
          <Help>
            Map fields from static, cStream/local/global paths, or FloExpression.
            Reuse hub-wide values: set <code>defaultToEmail</code> in global once (Start/Var Store), then To → Global → <code>defaultToEmail</code>.
            For joins use Expression: <code>concat(cStream.a, '.', cStream.b)</code> — not <code>{'{{ }}'}</code> (that is Template node only).
          </Help>
        </Section>
        {EMAIL_FIELDS.map(f => (
          <EmailFieldRow key={f.key} fieldKey={f.key} label={f.label} isList={f.isList}
            binding={get(f.key)} onChange={p => patch(f.key, p)} />
        ))}
        <OutputTargetSection
          outputTarget={(d.outputTarget as string) ?? 'cStream'}
          outputVarName={(d.outputVarName as string) ?? ''}
          onChange={p => onUpdate(node.id, p)}
        />
        <DataPersistenceSection
          value={(d.dataPersistence as NodeDataPersistence | undefined) ?? DEFAULT_NODE_DATA_PERSISTENCE}
          onChange={dataPersistence => onUpdate(node.id, { dataPersistence })}
        />
        <PlugTestInput
          value={String(d.testInputJson ?? DEFAULT_PLUG_TEST_INPUT)}
          onChange={json => onUpdate(node.id, { testInputJson: json })}
        />
        <NodeTestPanel nodeId={node.id} testingNodeId={ctx.testingNodeId} onTest={() => ctx.onTestNode(node.id)}
          result={d._result as string} isError={d._isError as boolean} loading={d._loading as boolean} />
      </>
    );
  }

  const plugNodeTokenDefs = (d.plugNodeUrlTokens as { key: string; label?: string; description?: string }[] | undefined) ?? [];
  const devUrlVars = plugNodeTokenDefs.length > 0
    ? plugNodeTokenDefs.map(t => t.key)
    : extractUrlTemplateVarNames(String(d.urlPattern ?? '')).filter(isDeveloperPlugUrlVar);
  const urlVariables = (d.urlVariables ?? {}) as Record<string, PlugVariableBinding>;
  const selectedConn = connections.find(c => c.id === selectedConnectionId);
  const urlTokensSnapshot = (d.urlTokensSnapshot as ConnectorUrlToken[] | undefined) ?? [];
  const plugUrlByConn = (d.plugUrlValuesByConnection as Record<string, Record<string, string>> | undefined) ?? {};

  const resolvedUrlPreview = useMemo(() => {
    if (!urlTokensSnapshot.length || !selectedConn) return '';
    const hubPlugVals = plugUrlByConn[selectedConnectionId] ?? {};
    const plugNodeVals: Record<string, string> = {};
    for (const t of plugNodeTokenDefs) {
      const b = urlVariables[t.key];
      if (b?.source === 'static' && b.value?.trim()) {
        const v = b.value.trim();
        plugNodeVals[t.key] = v;
        if (t.field) plugNodeVals[t.field] = v;
      }
    }
    return resolveConnectorUrlPreview({
      urlTokens: urlTokensSnapshot,
      connection: {
        urlTokenValues: selectedConn.urlTokenValues,
        hostname:  selectedConn.hostname,
        tenantKey: selectedConn.tenantKey,
        baseUrl:   selectedConn.baseUrl,
      },
      kit: (d.kitUrlContext as { urlTokenValues?: Record<string, string>; serviceModule?: string; serviceVersion?: string; schemaLabel?: string; schemaVersion?: string } | undefined),
      plugValues: hubPlugVals,
      plugNodeValues: plugNodeVals,
    });
  }, [urlTokensSnapshot, selectedConn, selectedConnectionId, plugUrlByConn, plugNodeTokenDefs, urlVariables]);

  return (
    <>
      <Section>
        <div style={{ fontSize: 11, fontWeight: 600, color: t.accent }}>{String(d.plugName ?? 'Plug')}</div>
        <div style={{ fontSize: 9, color: t.textMuted }}>{String(d.connectorLabel ?? '')}</div>
        {authProtocol && (
          <span style={{
            display: 'inline-block', marginTop: 6, fontSize: 9, padding: '2px 8px', borderRadius: 12,
            background: `${t.accent}22`, color: t.accent, border: `0.5px solid ${t.accent}44`,
          }}>
            {authProtocol}
          </span>
        )}
      </Section>

      <Field label="Connection">
        {connError && (
          <div style={{ fontSize: 10, color: '#e05555', marginBottom: 6 }}>{connError}</div>
        )}
        {loadingConns ? (
          <span style={{ fontSize: 10, color: t.textMuted, fontStyle: 'italic' }}>Loading connections…</span>
        ) : connections.length === 0 ? (
          <span style={{ fontSize: 10, color: t.warning, fontStyle: 'italic' }}>
            No connections for this protocol. Ask your hub admin to create one.
          </span>
        ) : (
          <Sel
            value={selectedConnectionId}
            onChange={e => onUpdate(node.id, {
              connectionId: e.target.value,
              connectionName: connections.find(c => c.id === e.target.value)?.name ?? '',
            })}
          >
            <option value="">— select connection —</option>
            {connections.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.environmentLabel ? ` (${c.environmentLabel})` : ''}
                {c.id === defaultConnectionId ? ' (default)' : ''}
              </option>
            ))}
          </Sel>
        )}
        {allowedConnectionIds.length > 0 ? (
          <Help>
            Connections are limited to those configured by your hub admin for this plug.
            {defaultConnectionId ? ` Default: ${connections.find(c => c.id === defaultConnectionId)?.name ?? defaultConnectionId}.` : ''}
          </Help>
        ) : selectedConn ? (
          <Help>
            Host and tenant come from connection “{selectedConn.name}” — not configured here.
          </Help>
        ) : null}
      </Field>

      {(resolvedUrlPreview || urlTokensSnapshot.length > 0) && selectedConn ? (
        <Field label="Resolved URL">
          <ConnectorUrlPreviewBox
            preview={resolvedUrlPreview}
            urlTokens={urlTokensSnapshot}
            captureSources={['plugNode']}
            connection={{
              urlTokenValues: selectedConn.urlTokenValues,
              hostname: selectedConn.hostname,
              tenantKey: selectedConn.tenantKey,
              baseUrl: selectedConn.baseUrl,
            }}
            plugValues={plugUrlByConn[selectedConnectionId] ?? {}}
            plugNodeValues={Object.fromEntries(
              plugNodeTokenDefs.flatMap(t => {
                const b = urlVariables[t.key];
                if (b?.source === 'static' && b.value?.trim()) {
                  const v = b.value.trim();
                  return [[t.key, v], ...(t.field ? [[t.field, v] as [string, string]] : [])];
                }
                return [] as [string, string][];
              }),
            )}
          />
        </Field>
      ) : null}

      {devUrlVars.length > 0 && devUrlVars.map(varName => {
        const tokenDef = plugNodeTokenDefs.find(t => t.key === varName);
        const hint = (d.variableHints as PlugVariableHint[] | undefined)?.find(h => h.name === varName);
        const binding = urlVariables[varName];
        const label = tokenDef?.label ?? (varName === 'version' ? 'API version' : varName === 'module' ? 'Module' : varName);
        const isOverride = tokenDef && urlTokensSnapshot.some(
          t => t.key === tokenDef.key && tokenHasSource(t, 'kit') && tokenHasSource(t, 'plugNode'),
        );
        return (
          <BindingValueInput
            key={varName}
            label={isOverride ? `${label} (override)` : label}
            hint={tokenDef?.description ?? hint?.hint}
            source={(binding?.source ?? 'static') as BindingSourceType}
            value={binding?.value ?? hint?.defaultValue ?? ''}
            pathPlaceholder={varName === 'module' || varName === 'version' ? `global.${varName}` : varName}
            onChange={patch => onUpdate(node.id, {
              urlVariables: { ...urlVariables, [varName]: patch },
            })}
            compact={(binding?.source ?? 'static') !== 'expression'}
          />
        );
      })}
      <OutputTargetSection
        outputTarget={(d.outputTarget as string) ?? 'cStream'}
        outputVarName={(d.outputVarName as string) ?? ''}
        onChange={p => onUpdate(node.id, p)}
      />
      <DataPersistenceSection
        value={(d.dataPersistence as NodeDataPersistence | undefined) ?? DEFAULT_NODE_DATA_PERSISTENCE}
        onChange={dataPersistence => onUpdate(node.id, { dataPersistence })}
      />
      <PlugTestInput
        value={String(d.testInputJson ?? DEFAULT_PLUG_TEST_INPUT)}
        onChange={json => onUpdate(node.id, { testInputJson: json })}
      />
      <NodeTestPanel nodeId={node.id} testingNodeId={ctx.testingNodeId} onTest={() => ctx.onTestNode(node.id)}
        result={d._result as string} isError={d._isError as boolean} loading={d._loading as boolean} />
    </>
  );
};

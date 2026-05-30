/**
 * FloActionManager.tsx — Hub Admin FloActionNode configuration
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { ConnectorDoc, ActionDoc, FloConnectionSafe, AddActionNodeParams } from '@floplug/shared';
import { resolveFloActionFields, floActionNodeTokensForConnector } from '@floplug/shared';
import FloActionUrlConfigSection from './FloActionUrlConfigSection';

export interface FloKitMeta {
  id: string;
  connectorId: string;
  label: string;
  description?: string;
  actionIds: string[];
  serviceModule?:  string;
  serviceVersion?: string;
}

export interface ExistingActionNodeRef {
  id: string;
  connectorId: string;
  kitId: string;
  actionIds: string[];
  connectionId: string;
  allowedConnectionIds: string[];
  floActionName?: string;
  flaLabel?: string;
  description?: string;
  floActionUrlValuesByConnection?: Record<string, Record<string, string>>;
}

export interface FloActionManagerProps {
  connectors: ConnectorDoc[];
  floKits: Record<string, FloKitMeta[]>;
  actions: Record<string, ActionDoc[]>;
  connections: FloConnectionSafe[];
  onAddActionNode: (params: AddActionNodeParams) => Promise<string>;
  existingNodes?: ExistingActionNodeRef[];
}

const fieldLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block',
};
const fieldInput: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #D1D5DB',
  borderRadius: 6, boxSizing: 'border-box',
};

export const FloActionManager: React.FC<FloActionManagerProps> = ({
  connectors = [],
  floKits = {},
  actions = {},
  connections = [],
  onAddActionNode,
  existingNodes = [],
}) => {
  const [selectedConnectorId, setSelectedConnectorId] = useState('');
  const [selectedActionsMap, setSelectedActionsMap] = useState<Record<string, string[]>>({});
  const [allowedConnectionsMap, setAllowedConnectionsMap] = useState<Record<string, string[]>>({});
  const [defaultConnectionMap, setDefaultConnectionMap] = useState<Record<string, string>>({});
  const [floActionNameMap, setFloActionNameMap] = useState<Record<string, string>>({});
  const [flaLabelMap, setFlaLabelMap] = useState<Record<string, string>>({});
  const [descriptionMap, setDescriptionMap] = useState<Record<string, string>>({});
  const [floActionUrlValuesMap, setFloActionUrlValuesMap] = useState<
    Record<string, Record<string, Record<string, string>>>
  >({});
  const [processingKitId, setProcessingKitId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');

  const activeKits = selectedConnectorId ? floKits[selectedConnectorId] ?? [] : [];

  const labelsInUse = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of existingNodes) {
      const { flaLabel } = resolveFloActionFields({
        floActionName: n.floActionName,
        flaLabel: n.flaLabel,
        floKitId: n.kitId,
      });
      map.set(flaLabel.trim().toLowerCase(), n.kitId);
    }
    return map;
  }, [existingNodes]);

  useEffect(() => {
    if (!selectedConnectorId && connectors[0]) setSelectedConnectorId(connectors[0].id);
  }, [connectors, selectedConnectorId]);

  useEffect(() => {
    if (!existingNodes.length) return;
    const a: Record<string, string[]> = {};
    const al: Record<string, string[]> = {};
    const d: Record<string, string> = {};
    const names: Record<string, string> = {};
    const labels: Record<string, string> = {};
    const descs: Record<string, string> = {};
    const urlVals: Record<string, Record<string, Record<string, string>>> = {};
    for (const n of existingNodes) {
      const resolved = resolveFloActionFields({
        floActionName: n.floActionName,
        flaLabel: n.flaLabel,
        floKitId: n.kitId,
        description: n.description,
      });
      a[n.kitId] = n.actionIds ?? [];
      al[n.kitId] = n.allowedConnectionIds?.length ? n.allowedConnectionIds : (n.connectionId ? [n.connectionId] : []);
      d[n.kitId] = n.connectionId || n.allowedConnectionIds?.[0] || '';
      names[n.kitId] = resolved.floActionName;
      labels[n.kitId] = resolved.flaLabel;
      descs[n.kitId] = resolved.description;
      urlVals[n.kitId] = n.floActionUrlValuesByConnection ?? {};
    }
    setSelectedActionsMap(prev => ({ ...a, ...prev }));
    setAllowedConnectionsMap(prev => ({ ...al, ...prev }));
    setDefaultConnectionMap(prev => ({ ...d, ...prev }));
    setFloActionNameMap(prev => ({ ...names, ...prev }));
    setFlaLabelMap(prev => ({ ...labels, ...prev }));
    setDescriptionMap(prev => ({ ...descs, ...prev }));
    setFloActionUrlValuesMap(prev => ({ ...urlVals, ...prev }));
  }, [existingNodes]);

  const connectionsForConnector = useMemo(
    () => connections.filter(c => c.connectorId === selectedConnectorId && c.isActive !== false),
    [connections, selectedConnectorId],
  );

  useEffect(() => {
    if (!activeKits.length) return;
    setFloActionNameMap(prev => {
      const next = { ...prev };
      for (const kit of activeKits) {
        if (next[kit.id] === undefined) next[kit.id] = kit.label;
      }
      return next;
    });
    setFlaLabelMap(prev => {
      const next = { ...prev };
      for (const kit of activeKits) {
        if (next[kit.id] === undefined) next[kit.id] = kit.label;
      }
      return next;
    });
  }, [activeKits]);

  const toggleAction = (kitId: string, actionId: string) => {
    setSelectedActionsMap(prev => {
      const cur = prev[kitId] ?? [];
      return { ...prev, [kitId]: cur.includes(actionId) ? cur.filter(x => x !== actionId) : [...cur, actionId] };
    });
  };

  const toggleAllowed = (kitId: string, connId: string) => {
    setAllowedConnectionsMap(prev => {
      const cur = prev[kitId] ?? [];
      const next = cur.includes(connId) ? cur.filter(x => x !== connId) : [...cur, connId];
      setDefaultConnectionMap(def => {
        if (!next.length) return { ...def, [kitId]: '' };
        if (!def[kitId] || !next.includes(def[kitId])) return { ...def, [kitId]: next[0] };
        return def;
      });
      return { ...prev, [kitId]: next };
    });
  };

  const setDefault = (kitId: string, connId: string) => {
    setDefaultConnectionMap(prev => ({ ...prev, [kitId]: connId }));
    setAllowedConnectionsMap(prev => {
      const cur = prev[kitId] ?? [];
      return cur.includes(connId) ? prev : { ...prev, [kitId]: [...cur, connId] };
    });
  };

  const labelConflict = (kitId: string, label: string) => {
    const norm = label.trim().toLowerCase();
    if (!norm) return null;
    const owner = labelsInUse.get(norm);
    if (owner && owner !== kitId) return `Label "${label.trim()}" is already used by another FloAction.`;
    return null;
  };

  const patchFloActionUrlValue = (kitId: string, connectionId: string, tokenKey: string, value: string) => {
    setFloActionUrlValuesMap(prev => ({
      ...prev,
      [kitId]: {
        ...(prev[kitId] ?? {}),
        [connectionId]: { ...(prev[kitId]?.[connectionId] ?? {}), [tokenKey]: value },
      },
    }));
  };

  const saveKit = async (kitId: string, kitLabel: string) => {
    if (!selectedConnectorId) return;
    const actionIds = selectedActionsMap[kitId] ?? [];
    const allowedConnectionIds = allowedConnectionsMap[kitId] ?? [];
    const defaultConnectionId = defaultConnectionMap[kitId] ?? '';
    const floActionName = (floActionNameMap[kitId] ?? kitLabel).trim();
    const flaLabel = (flaLabelMap[kitId] ?? '').trim();
    const description = (descriptionMap[kitId] ?? '').trim();

    if (!floActionName) { setSaveError('FloAction name is required.'); return; }
    if (!flaLabel) { setSaveError('FloAction label (palette name) is required.'); return; }
    const conflict = labelConflict(kitId, flaLabel);
    if (conflict) { setSaveError(conflict); return; }
    if (!actionIds.length) { setSaveError('Select at least one action.'); return; }
    if (!allowedConnectionIds.length) { setSaveError('Select at least one allowed connection.'); return; }
    if (!defaultConnectionId) { setSaveError('Mark a default connection with ★.'); return; }
    if (!allowedConnectionIds.includes(defaultConnectionId)) {
      setSaveError('Default must be one of the allowed connections.'); return;
    }
    setSaveError('');
    setProcessingKitId(kitId);
    try {
      await onAddActionNode({
        floKitId: kitId,
        connectorId: selectedConnectorId,
        actionIds,
        allowedConnectionIds,
        defaultConnectionId,
        outputTarget: 'cStream',
        floActionName,
        flaLabel,
        description: description || undefined,
        floActionUrlValuesByConnection: floActionUrlValuesMap[kitId] ?? {},
        floActionNodeUrlTokens: floActionNodeTokensForConnector(
          connectors.find(c => c.id === selectedConnectorId),
        ).map(t => ({ key: t.key, label: t.label, description: t.description, field: t.field })),
      });
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      const detail = err.message && err.message !== 'Bad Request'
        ? err.message
        : err.code
          ? `${err.code.replace('functions/', '')}: save failed`
          : 'Save failed.';
      setSaveError(detail);
    } finally {
      setProcessingKitId(null);
    }
  };

  const nodeForKit = (kitId: string) => existingNodes.find(n => n.connectorId === selectedConnectorId && n.kitId === kitId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, color: '#111827' }}>
      {saveError && (
        <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#B91C1C', fontSize: 13 }}>
          {saveError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #E5E7EB', paddingBottom: 12, overflowX: 'auto' }}>
        {connectors.map(conn => {
          const isActive = conn.id === selectedConnectorId;
          return (
            <button key={conn.id} type="button" onClick={() => setSelectedConnectorId(conn.id)} style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap',
              border: isActive ? '1px solid #1A56DB' : '1px solid #E5E7EB',
              background: isActive ? '#EFF6FF' : '#FFFFFF',
              color: isActive ? '#1A56DB' : '#4B5563', fontWeight: isActive ? 600 : 500,
            }}>{conn.label || conn.id}</button>
          );
        })}
        {!connectors.length && <span style={{ fontSize: 14, color: '#6B7280' }}>No entitled connectors.</span>}
      </div>

      {activeKits.map(kit => {
        const kitActions = actions[kit.id] || [];
        const chosen = selectedActionsMap[kit.id] || [];
        const allowed = allowedConnectionsMap[kit.id] || [];
        const defaultConn = defaultConnectionMap[kit.id] || '';
        const existing = nodeForKit(kit.id);
        const isUpdate = !!existing;
        const floActionName = floActionNameMap[kit.id] ?? kit.label;
        const flaLabel = flaLabelMap[kit.id] ?? '';
        const description = descriptionMap[kit.id] ?? '';
        const labelErr = labelConflict(kit.id, flaLabel);

        return (
          <div key={kit.id} style={{ border: '1px solid #E5E7EB', borderRadius: 12, background: '#FFF', padding: 24, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>{kit.label}</h3>
            {kit.description && <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B7280' }}>FloKit: {kit.description}</p>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={fieldLabel}>FloAction name *</label>
                <input
                  style={fieldInput}
                  value={floActionName}
                  placeholder="e.g. SAP PO Create"
                  onChange={e => setFloActionNameMap(prev => ({ ...prev, [kit.id]: e.target.value }))}
                />
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>Internal name — editable, not tied to FloKit label</span>
              </div>
              <div>
                <label style={fieldLabel}>Palette label (flaLabel) *</label>
                <input
                  style={{ ...fieldInput, borderColor: labelErr ? '#FCA5A5' : '#D1D5DB' }}
                  value={flaLabel}
                  placeholder="Unique short name for designer palette"
                  onChange={e => setFlaLabelMap(prev => ({ ...prev, [kit.id]: e.target.value }))}
                />
                {labelErr
                  ? <span style={{ fontSize: 11, color: '#B91C1C' }}>{labelErr}</span>
                  : <span style={{ fontSize: 11, color: '#9CA3AF' }}>Must be unique across all FloActions on this hub</span>
                }
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={fieldLabel}>Description</label>
                <textarea
                  style={{ ...fieldInput, minHeight: 64, resize: 'vertical' }}
                  value={description}
                  placeholder="Notes for developers — shown in palette bubble on click"
                  onChange={e => setDescriptionMap(prev => ({ ...prev, [kit.id]: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8, textTransform: 'uppercase' }}>Actions</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {kitActions.map(action => {
                  const on = chosen.includes(action.id);
                  return (
                    <button key={action.id} type="button" onClick={() => toggleAction(kit.id, action.id)} style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                      border: on ? '1px solid #1A56DB' : '1px solid #D1D5DB',
                      background: on ? '#1A56DB' : '#F9FAFB', color: on ? '#FFF' : '#374151',
                    }}>{action.label || action.id}</button>
                  );
                })}
                {!kitActions.length && <span style={{ fontSize: 13, color: '#9CA3AF' }}>No entitled actions.</span>}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8, textTransform: 'uppercase' }}>
                Connections (check allowed · ★ = default for designer)
              </div>
              {connectionsForConnector.length === 0 ? (
                <div style={{ fontSize: 13, color: '#D97706', padding: 10, background: '#FFFBEB', borderRadius: 6 }}>
                  No active connections for this connector. Create one in the Connections tab first.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {connectionsForConnector.map(conn => (
                    <label key={conn.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={allowed.includes(conn.id)} onChange={() => toggleAllowed(kit.id, conn.id)} />
                      <span style={{ flex: 1 }}>{conn.name} <span style={{ color: '#9CA3AF', fontSize: 11 }}>({conn.authProtocol})</span></span>
                      <input type="radio" name={`default-${kit.id}`} checked={defaultConn === conn.id} disabled={!allowed.includes(conn.id)}
                        onChange={() => setDefault(kit.id, conn.id)} title="Default connection" />
                      <span style={{ fontSize: 11, color: defaultConn === conn.id ? '#1A56DB' : '#9CA3AF' }}>★ default</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <FloActionUrlConfigSection
              connector={connectors.find(c => c.id === selectedConnectorId) ?? null}
              connections={connectionsForConnector}
              allowedIds={allowed}
              defaultId={defaultConn}
              kit={{
                serviceModule:  kit.serviceModule,
                serviceVersion: kit.serviceVersion,
                schemaLabel:    kit.label,
              }}
              floActionUrlValues={floActionUrlValuesMap[kit.id] ?? {}}
              onFloActionUrlChange={(connId, key, val) => patchFloActionUrlValue(kit.id, connId, key, val)}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => saveKit(kit.id, kit.label)} disabled={processingKitId === kit.id || !!labelErr} style={{
                padding: '0 20px', height: 38, borderRadius: 6, border: 'none', color: '#FFF', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                background: isUpdate ? '#059669' : '#1A56DB', opacity: processingKitId === kit.id || labelErr ? 0.7 : 1,
              }}>
                {processingKitId === kit.id ? 'Saving…' : isUpdate ? 'Update FloActionNode' : 'Create FloActionNode'}
              </button>
            </div>
          </div>
        );
      })}

      {!activeKits.length && selectedConnectorId && (
        <div style={{ textAlign: 'center', padding: 40, color: '#6B7280', fontSize: 14 }}>No entitled FloKits for this connector.</div>
      )}
    </div>
  );
};
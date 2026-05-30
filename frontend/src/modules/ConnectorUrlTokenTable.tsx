/**
 * Connector URL segment table — product admin builds ordered URL tokens.
 * Keys are auto-assigned (urlToken1, urlToken2, …); labels are admin-defined.
 */

import React, { useMemo } from 'react';
import type { ConnectorUrlToken, ConnectorUrlTokenSource, ConnectorUrlMode } from '@floplug/shared';
import {
  assembleConnectorUrl,
  validateConnectorUrlTokensForMode,
  GENERIC_HTTP_PREFIX_LENGTH,
  reassignUrlTokenKeys,
  createEmptyUrlToken,
  resolveUrlTokenVendorProfile,
  getUrlTokenHintForToken,
  tokenSources,
  tokenHasSource,
  URL_TOKEN_SOURCE_ORDER,
} from '@floplug/shared';

const SOURCES: { value: ConnectorUrlTokenSource; label: string }[] = [
  { value: 'static',        label: 'Static' },
  { value: 'connection',    label: 'Connection' },
  { value: 'kit',           label: 'Kit' },
  { value: 'plug',          label: 'Plug (hub admin)' },
  { value: 'plugNode',      label: 'Plug node (designer)' },
  { value: 'floAction',     label: 'FloAction (hub admin)' },
  { value: 'floActionNode', label: 'FloAction node (designer)' },
];

const FILL_LOCATION_SOURCES = SOURCES.filter(s => s.value !== 'static');
const GENERIC_EXTRA_SOURCES: ConnectorUrlTokenSource[] = [
  'plug', 'plugNode', 'floAction', 'floActionNode',
];
const PLUG_LIKE_SOURCES: ConnectorUrlTokenSource[] = GENERIC_EXTRA_SOURCES;

interface Props {
  mode:              ConnectorUrlMode;
  tokens:            ConnectorUrlToken[];
  confirmed:         boolean;
  connectorLabel?:   string;
  connectorId?:      string;
  connectorCategory?: string;
  onTokensChange:    (next: ConnectorUrlToken[]) => void;
  onConfirmedChange: (v: boolean) => void;
}

export const ConnectorUrlTokenTable: React.FC<Props> = ({
  mode, tokens, confirmed, connectorLabel, connectorId, connectorCategory,
  onTokensChange, onConfirmedChange,
}) => {
  const profile = useMemo(
    () => resolveUrlTokenVendorProfile({ label: connectorLabel, id: connectorId, category: connectorCategory }),
    [connectorLabel, connectorId, connectorCategory],
  );

  const commitTokens = (next: ConnectorUrlToken[]) => {
    onTokensChange(reassignUrlTokenKeys(next));
  };

  const preview = useMemo(
    () => assembleConnectorUrl(tokens, {}, true, profile),
    [tokens, profile],
  );
  const issues  = useMemo(() => validateConnectorUrlTokensForMode(tokens, mode), [tokens, mode]);
  const isGeneric = mode === 'generic';
  const lockedPrefix = isGeneric ? GENERIC_HTTP_PREFIX_LENGTH : 0;

  const patchRow = (index: number, patch: Partial<ConnectorUrlToken>) => {
    onConfirmedChange(false);
    commitTokens(tokens.map((t, i) => i === index ? { ...t, ...patch } : t));
  };

  const toggleSource = (index: number, source: ConnectorUrlTokenSource) => {
    onConfirmedChange(false);
    const row = tokens[index];
    if (!row || row.source === 'static') return;
    const current = tokenSources(row).filter(s => s !== 'static');
    let next = current.includes(source)
      ? current.filter(s => s !== source)
      : [...current, source];
    if (next.length === 0) return;
    next = URL_TOKEN_SOURCE_ORDER.filter(s => next.includes(s)) as ConnectorUrlTokenSource[];
    const primary = next[0];
    commitTokens(tokens.map((t, i) => i === index ? { ...t, sources: next, source: primary } : t));
  };

  const fillSourcesForRow = (index: number, isStatic: boolean): ConnectorUrlTokenSource[] => {
    if (isStatic) return ['static'];
    if (isGeneric && index >= lockedPrefix) {
      return PLUG_LIKE_SOURCES;
    }
    return FILL_LOCATION_SOURCES.map(s => s.value);
  };

  const addRowAfter = (index: number, kind: 'static' | 'variable' = 'static') => {
    onConfirmedChange(false);
    const insertIndex = index + 1;
    const source: ConnectorUrlTokenSource = isGeneric
      ? 'plug'
      : kind === 'static'
        ? 'static'
        : 'connection';
    const next = [...tokens];
    next.splice(insertIndex, 0, createEmptyUrlToken(source, tokens, profile, insertIndex));
    commitTokens(next);
  };

  const removeRow = (index: number) => {
    if (isGeneric && index < lockedPrefix) return;
    onConfirmedChange(false);
    commitTokens(tokens.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: '#9090a0', lineHeight: 1.6, marginBottom: 10 }}>
        {isGeneric ? (
          <>
            <strong>Generic HTTP</strong> — fixed <code>https://</code> scheme plus the API URL from each FloConnection.
            Optional plug rows add path segments after the base URL.
          </>
        ) : (
          <>
            Build the service URL <strong>segment by segment</strong> (top to bottom).
            A <code>/</code> is inserted between rows automatically — do not add slash-only rows.
            Token keys (<code>urlToken1</code>, …) are assigned automatically; use <strong>Label</strong> for the admin-friendly name.
            Select one or more <strong>fill locations</strong> per segment — e.g. Kit + Plug node so module/version default on the FloKit and can be overridden on the canvas.
            Hint text adapts to this connector&apos;s target system ({profile}).
          </>
        )}
      </div>

      <div style={{ overflowX: 'auto', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <th style={th}>#</th>
              <th style={th}>Fill locations</th>
              <th style={th}>Static value</th>
              <th style={th}>Token key</th>
              <th style={th}>Label</th>
              <th style={th}>Description</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...td, color: '#6b6b80', fontStyle: 'italic' }}>
                  {isGeneric
                    ? 'Generic HTTP uses a fixed https:// + connection API URL — rows appear when URL mode is set.'
                    : 'No segments yet — click + Add row to start (e.g. static https:, ccx, then connection/kit segments).'}
                </td>
              </tr>
            )}
            {tokens.map((row, index) => {
              const locked = isGeneric && index < lockedPrefix;
              const isStatic = row.source === 'static';
              const rowSources = tokenSources(row).filter(s => s !== 'static');
              const availableSources = fillSourcesForRow(index, isStatic);
              const hint = !isStatic ? getUrlTokenHintForToken(profile, row, tokens) : null;
              const readOnlyInput: React.CSSProperties = { ...input, opacity: 0.7, cursor: 'not-allowed' };
              return (
                <tr key={index} style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)', ...(locked ? { background: 'rgba(255,255,255,0.02)' } : {}) }}>
                  <td style={td}>{index + 1}{locked ? ' 🔒' : ''}</td>
                  <td style={td}>
                    {isStatic ? (
                      <span style={{ color: '#c0c0cc' }}>Static</span>
                    ) : locked ? (
                      <span style={{ color: '#c0c0cc' }}>
                        {FILL_LOCATION_SOURCES.find(s => tokenHasSource(row, s.value))?.label ?? row.source}
                      </span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
                        {availableSources.map(src => {
                          const meta = FILL_LOCATION_SOURCES.find(s => s.value === src);
                          const checked = rowSources.includes(src);
                          return (
                            <label key={src} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 10, color: checked ? '#e8e8f0' : '#6b6b80' }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSource(index, src)}
                              />
                              <span>{meta?.label ?? src}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    {isStatic ? (
                      <input
                        style={locked ? readOnlyInput : input}
                        value={row.staticValue ?? ''}
                        placeholder="e.g. https: or ccx"
                        readOnly={locked}
                        onChange={e => patchRow(index, { staticValue: e.target.value })}
                      />
                    ) : (
                      <span style={{ color: '#45455a' }}>—</span>
                    )}
                  </td>
                  <td style={td}>
                    {!isStatic ? (
                      <code style={{ fontSize: 11, color: '#93c5fd' }}>{row.key || '—'}</code>
                    ) : (
                      <span style={{ color: '#45455a' }}>—</span>
                    )}
                  </td>
                  <td style={td}>
                    {!isStatic ? (
                      <input
                        style={locked ? readOnlyInput : input}
                        value={row.label ?? ''}
                        placeholder={hint?.labelSuggestion ?? 'UI label'}
                        readOnly={locked}
                        onChange={e => patchRow(index, { label: e.target.value })}
                      />
                    ) : (
                      <span style={{ color: '#45455a' }}>—</span>
                    )}
                  </td>
                  <td style={td}>
                    {!isStatic ? (
                      <input
                        style={locked ? readOnlyInput : input}
                        value={row.description ?? ''}
                        placeholder={hint?.descriptionSuggestion ?? 'Help text for admins'}
                        readOnly={locked}
                        onChange={e => patchRow(index, { description: e.target.value })}
                      />
                    ) : (
                      <span style={{ color: '#45455a' }}>—</span>
                    )}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" onClick={() => addRowAfter(index)} style={iconBtn} title="Add row after">+</button>
                      {!locked && (
                        <button type="button" onClick={() => removeRow(index)} style={iconBtnDel} title="Remove row">−</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!isGeneric ? (
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="button" onClick={() => addRowAfter(tokens.length - 1, 'static')} style={addLink}>
            + Add static segment
          </button>
          <button type="button" onClick={() => addRowAfter(tokens.length - 1, 'variable')} style={addLink}>
            + Add variable segment
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => addRowAfter(tokens.length - 1)}
          style={addLink}
        >
          + Add plug path segment
        </button>
      )}

      {issues.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#fbbf24' }}>
          {issues.map((iss, i) => (
            <div key={i}>Row {iss.index + 1}: {iss.message}</div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: 'rgba(79,142,247,0.08)', border: '0.5px solid rgba(79,142,247,0.2)' }}>
        <div style={{ fontSize: 10, color: '#6b6b80', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Preview URL (sample values)
        </div>
        <code style={{ fontSize: 12, color: '#93c5fd', wordBreak: 'break-all' }}>
          {preview || '(empty)'}
        </code>
      </div>

      {tokens.length > 0 && issues.length === 0 && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, cursor: 'pointer', fontSize: 11, color: '#c0c0cc' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => onConfirmedChange(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            I confirm this URL pattern is correct and matches how this connector&apos;s API should be called.
            The connector cannot be saved with URL segments until this is checked.
          </span>
        </label>
      )}
    </div>
  );
};

const th: React.CSSProperties = { padding: '8px 10px', color: '#6b6b80', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' };
const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
const input: React.CSSProperties = {
  width: '100%', minWidth: 72, padding: '5px 8px', borderRadius: 6, fontSize: 11,
  border: '0.5px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: '#e8e8f0',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const iconBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 6, border: '0.5px solid rgba(79,142,247,0.4)',
  background: 'rgba(79,142,247,0.12)', color: '#4f8ef7', cursor: 'pointer', fontSize: 16, lineHeight: 1,
};
const iconBtnDel: React.CSSProperties = { ...iconBtn, border: '0.5px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.1)', color: '#f87171' };
const addLink: React.CSSProperties = {
  marginTop: 8, background: 'none', border: 'none', color: '#4f8ef7', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', padding: 0,
};

export default ConnectorUrlTokenTable;

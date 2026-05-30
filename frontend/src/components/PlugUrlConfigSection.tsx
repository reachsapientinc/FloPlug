/**
 * Hub plug URL config — preview from connector + connection; capture plug-sourced tokens only.
 */

import React, { useMemo } from 'react';
import type { ConnectorDoc, FloConnectionSafe } from '@floplug/shared';
import {
  plugTokensForConnector,
  plugNodeTokensForConnector,
  resolveConnectorUrlPreview,
} from '@floplug/shared';
import ConnectorUrlPreviewBox from './ConnectorUrlPreviewBox';

interface Props {
  connector:      ConnectorDoc | null;
  connections:    FloConnectionSafe[];
  allowedIds:     string[];
  defaultId:      string;
  plugUrlValues:  Record<string, Record<string, string>>;
  onPlugUrlChange:(connectionId: string, tokenKey: string, value: string) => void;
  css:            Record<string, React.CSSProperties>;
}

export const PlugUrlConfigSection: React.FC<Props> = ({
  connector, connections, allowedIds, defaultId, plugUrlValues, onPlugUrlChange, css,
}) => {
  const plugTokens = plugTokensForConnector(connector);
  const plugNodeTokens = plugNodeTokensForConnector(connector);
  const previewConnId = defaultId || allowedIds[0] || '';

  const previewConn = useMemo(
    () => connections.find(c => c.id === previewConnId),
    [connections, previewConnId],
  );

  const previewUrl = useMemo(() => {
    if (!connector || !previewConn) return '';
    const plugVals = plugUrlValues[previewConn.id] ?? {};
    return resolveConnectorUrlPreview({
      connector,
      connection: {
        urlTokenValues: previewConn.urlTokenValues,
        hostname:  previewConn.hostname,
        tenantKey: previewConn.tenantKey,
        baseUrl:   previewConn.baseUrl,
      },
      plugValues: plugVals,
    });
  }, [connector, previewConn, plugUrlValues]);

  if (!connector) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={css.fg}>
        <label style={css.fl}>Resolved URL (connector + connection)</label>
        <ConnectorUrlPreviewBox
          preview={previewUrl}
          emptyMessage="(select a default connection to preview)"
          urlTokens={connector.urlTokens ?? []}
          captureSources={['plug']}
          connection={previewConn ? {
            urlTokenValues: previewConn.urlTokenValues,
            hostname: previewConn.hostname,
            tenantKey: previewConn.tenantKey,
            baseUrl: previewConn.baseUrl,
          } : undefined}
          plugValues={previewConn ? (plugUrlValues[previewConn.id] ?? {}) : undefined}
        />
        {plugNodeTokens.length > 0 && (
          <div style={{ fontSize: 9, color: '#6b6b80', marginTop: 6, lineHeight: 1.5 }}>
            Plug-node segments ({plugNodeTokens.map(t => t.label ?? t.key).join(', ')}) are set on the designer canvas.
          </div>
        )}
      </div>

      {plugTokens.length > 0 && allowedIds.map(connId => {
        const conn = connections.find(c => c.id === connId);
        if (!conn) return null;
        const vals = plugUrlValues[connId] ?? {};
        return (
          <div
            key={connId}
            style={{
              background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: '#4f8ef7', marginBottom: 10, textTransform: 'uppercase' }}>
              Plug values — {conn.name}
              {connId === defaultId && <span style={{ color: '#6b6b80', fontWeight: 400 }}> (default)</span>}
            </div>
            {plugTokens.map(token => (
              <div key={token.key} style={{ marginBottom: 10 }}>
                <label style={{ ...css.fl, marginBottom: 4 }}>{token.label ?? token.key}</label>
                <input
                  style={css.fi}
                  value={vals[token.key] ?? vals[token.field ?? ''] ?? ''}
                  placeholder={token.description ?? token.label ?? token.key}
                  onChange={e => onPlugUrlChange(connId, token.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default PlugUrlConfigSection;

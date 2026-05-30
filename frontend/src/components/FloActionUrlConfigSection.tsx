/**
 * Hub FloAction URL config — preview from connector + connection; capture floAction-sourced tokens only.
 */

import React, { useMemo } from 'react';
import type { ConnectorDoc, FloConnectionSafe } from '@floplug/shared';
import {
  floActionTokensForConnector,
  floActionNodeTokensForConnector,
  resolveConnectorUrlPreview,
} from '@floplug/shared';
import ConnectorUrlPreviewBox from './ConnectorUrlPreviewBox';

interface Props {
  connector:      ConnectorDoc | null;
  connections:    FloConnectionSafe[];
  allowedIds:     string[];
  defaultId:      string;
  kit?:           { serviceModule?: string; serviceVersion?: string; schemaLabel?: string; schemaVersion?: string };
  floActionUrlValues:  Record<string, Record<string, string>>;
  onFloActionUrlChange:(connectionId: string, tokenKey: string, value: string) => void;
  theme?:         'dark' | 'light';
}

export const FloActionUrlConfigSection: React.FC<Props> = ({
  connector, connections, allowedIds, defaultId, kit,
  floActionUrlValues, onFloActionUrlChange, theme = 'light',
}) => {
  const floActionTokens = floActionTokensForConnector(connector);
  const floActionNodeTokens = floActionNodeTokensForConnector(connector);
  const previewConnId = defaultId || allowedIds[0] || '';

  const previewConn = useMemo(
    () => connections.find(c => c.id === previewConnId),
    [connections, previewConnId],
  );

  const previewUrl = useMemo(() => {
    if (!connector || !previewConn) return '';
    return resolveConnectorUrlPreview({
      connector,
      connection: {
        urlTokenValues: previewConn.urlTokenValues,
        hostname:  previewConn.hostname,
        tenantKey: previewConn.tenantKey,
        baseUrl:   previewConn.baseUrl,
      },
      kit,
      floActionValues: floActionUrlValues[previewConn.id] ?? {},
    });
  }, [connector, previewConn, floActionUrlValues, kit]);

  if (!connector || floActionTokens.length === 0) return null;

  const fieldLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block',
  };
  const fieldInput: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #D1D5DB',
    borderRadius: 6, boxSizing: 'border-box',
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8, textTransform: 'uppercase' }}>
        FloAction URL segments
      </div>
      <ConnectorUrlPreviewBox
        preview={previewUrl}
        emptyMessage="(select a default connection to preview)"
        urlTokens={connector.urlTokens ?? []}
        captureSources={['floAction']}
        connection={previewConn ? {
          urlTokenValues: previewConn.urlTokenValues,
          hostname: previewConn.hostname,
          tenantKey: previewConn.tenantKey,
          baseUrl: previewConn.baseUrl,
        } : undefined}
        kit={kit}
        floActionValues={previewConn ? (floActionUrlValues[previewConn.id] ?? {}) : undefined}
        theme={theme}
      />
      {floActionNodeTokens.length > 0 && (
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
          FloAction-node segments ({floActionNodeTokens.map(t => t.label ?? t.key).join(', ')}) are set on the designer canvas.
        </div>
      )}
      {allowedIds.map(connId => {
        const conn = connections.find(c => c.id === connId);
        if (!conn) return null;
        const vals = floActionUrlValues[connId] ?? {};
        return (
          <div key={connId} style={{ marginTop: 12, padding: 12, border: '1px solid #E5E7EB', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1A56DB', marginBottom: 8 }}>
              FloAction values — {conn.name}
              {connId === defaultId && <span style={{ color: '#9CA3AF', fontWeight: 400 }}> (default)</span>}
            </div>
            {floActionTokens.map(token => (
              <div key={token.key} style={{ marginBottom: 8 }}>
                <label style={fieldLabel}>{token.label ?? token.key}</label>
                <input
                  style={fieldInput}
                  value={vals[token.key] ?? vals[token.field ?? ''] ?? ''}
                  placeholder={token.description ?? token.label ?? token.key}
                  onChange={e => onFloActionUrlChange(connId, token.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default FloActionUrlConfigSection;

/**
 * Unified URL preview for connector token inheritance — used on connection, kit, plug, and FloAction surfaces.
 */

import React, { useMemo } from 'react';
import type { ConnectorUrlToken, ConnectorUrlTokenSource } from '@floplug/shared';
import {
  TOKEN_SOURCE_FILL_LOCATION,
  missingConnectorUrlValues,
  tokenHasSource,
  unresolvedUrlPlaceholdersForCapture,
} from '@floplug/shared';

export interface ConnectorUrlPreviewBoxProps {
  preview:         string;
  emptyMessage?:   string;
  urlTokens?:      ConnectorUrlToken[];
  captureSources?: ConnectorUrlTokenSource[];
  connection?:     { urlTokenValues?: Record<string, string>; hostname?: string; tenantKey?: string; baseUrl?: string };
  kit?:            { urlTokenValues?: Record<string, string>; serviceModule?: string; serviceVersion?: string; schemaLabel?: string; schemaVersion?: string };
  plugValues?:     Record<string, string>;
  floActionValues?: Record<string, string>;
  plugNodeValues?: Record<string, string>;
  floActionNodeValues?: Record<string, string>;
  theme?:          'dark' | 'light';
}

export const ConnectorUrlPreviewBox: React.FC<ConnectorUrlPreviewBoxProps> = ({
  preview,
  emptyMessage = '(complete required fields above to preview)',
  urlTokens = [],
  captureSources = [],
  connection,
  kit,
  plugValues,
  floActionValues,
  plugNodeValues,
  floActionNodeValues,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';

  const missing = useMemo(() => {
    if (!urlTokens.length) return [];
    return missingConnectorUrlValues({
      urlTokens,
      connection,
      kit,
      plugValues,
      floActionValues,
      plugNodeValues,
      floActionNodeValues,
    });
  }, [urlTokens, connection, kit, plugValues, floActionValues, plugNodeValues, floActionNodeValues]);

  const missingHere = missing.filter(t => captureSources.some(s => tokenHasSource(t, s)));
  const missingElsewhere = missing.filter(t => !captureSources.some(s => tokenHasSource(t, s)));

  const unresolvedInPreview = useMemo(
    () => (preview
      ? unresolvedUrlPlaceholdersForCapture(preview, urlTokens, captureSources)
      : []),
    [preview, urlTokens, captureSources],
  );

  const boxStyle: React.CSSProperties = {
    padding: '10px 12px', borderRadius: 8, fontSize: 11, fontFamily: 'monospace',
    wordBreak: 'break-all',
    color: isLight ? '#1D4ED8' : '#93c5fd',
    background: isLight ? 'rgba(29,78,216,0.06)' : 'rgba(79,142,247,0.08)',
    border: isLight ? '1px solid rgba(29,78,216,0.15)' : '0.5px solid rgba(79,142,247,0.2)',
  };

  const hintStyle: React.CSSProperties = {
    fontSize: 9, color: isLight ? '#6B7280' : '#6b6b80', marginTop: 6, lineHeight: 1.55,
  };

  const warnStyle: React.CSSProperties = {
    fontSize: 9, color: isLight ? '#B45309' : '#f59e0b', marginTop: 6, lineHeight: 1.55,
  };

  return (
    <div>
      <div style={boxStyle}>
        {preview || emptyMessage}
      </div>
      {urlTokens.length > 0 && (
        <div style={hintStyle}>
          Static segments resolve from the connector registry.
          {captureSources.length > 0 && (
            <> Segments classified as {captureSources.map(s => TOKEN_SOURCE_FILL_LOCATION[s]).join(', ')} are captured on this screen.</>
          )}
        </div>
      )}
      {unresolvedInPreview.length > 0 && (
        <div style={{ ...warnStyle, color: isLight ? '#DC2626' : '#ef4444' }}>
          Unresolved in preview: {unresolvedInPreview.join(', ')} — fix configuration before publish/run.
        </div>
      )}
      {missingHere.length > 0 && (
        <div style={warnStyle}>
          Required here: {missingHere.map(t => t.label ?? t.key).join(', ')}
        </div>
      )}
      {missingElsewhere.length > 0 && (
        <div style={hintStyle}>
          Other segments resolve at:{' '}
          {[...new Set(missingElsewhere.map(t => TOKEN_SOURCE_FILL_LOCATION[t.source]))].join(', ')}
          {' '}({missingElsewhere.map(t => t.label ?? t.key).join(', ')})
        </div>
      )}
    </div>
  );
};

export default ConnectorUrlPreviewBox;

import React, { useState } from 'react';
import type { FloExecutionNodeRecord, NodeHttpTrace } from '@floplug/shared';
import { formatDuration, jsonPreview } from '../utils/formatters';
import { StatusDot } from './StatusBadge';

export interface NodeInspectorPanelProps {
  record: FloExecutionNodeRecord | null;
  onClose?: () => void;
}

function HttpTraceSection({ trace }: { trace: NodeHttpTrace }) {
  const reqBody = trace.requestBody ?? trace.requestBodyPreview;
  const resBody = trace.responseBody ?? trace.responseBodyPreview;
  return (
    <div className="hub-inspector-section">
      <div className="hub-inspector-section-title">HTTP request</div>
      <div className="hub-inspector-kv">
        <span className="hub-inspector-k">Method</span>
        <span className="hub-inspector-v mono">{trace.method}</span>
      </div>
      <div className="hub-inspector-kv">
        <span className="hub-inspector-k">URL</span>
        <span className="hub-inspector-v mono" style={{ wordBreak: 'break-all' }}>{trace.url}</span>
      </div>
      {trace.status != null && (
        <div className="hub-inspector-kv">
          <span className="hub-inspector-k">Response</span>
          <span className="hub-inspector-v mono">{trace.status} {trace.statusText ?? ''}</span>
        </div>
      )}
      {trace.requestHeaders && Object.keys(trace.requestHeaders).length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="hub-inspector-subtitle">Headers (secrets redacted)</div>
          <pre className="json-block">{jsonPreview(trace.requestHeaders, 4000)}</pre>
        </div>
      )}
      {reqBody && (
        <div style={{ marginTop: 8 }}>
          <div className="hub-inspector-subtitle">Request body</div>
          <pre className="json-block hub-json-full">{reqBody}</pre>
        </div>
      )}
      {resBody && (
        <div style={{ marginTop: 8 }}>
          <div className="hub-inspector-subtitle">Response body</div>
          <pre className="json-block hub-json-full">{resBody}</pre>
        </div>
      )}
    </div>
  );
}

export const NodeInspectorPanel: React.FC<NodeInspectorPanelProps> = ({ record, onClose }) => {
  const [showFullJson, setShowFullJson] = useState(true);

  if (!record) {
    return (
      <div className="hub-node-inspector hub-node-inspector-empty">
        <div className="hub-inspector-empty-icon">◎</div>
        <p>Click a node in the pipeline to inspect input, output, and HTTP payloads.</p>
      </div>
    );
  }

  const nodeStatus = record.status === 'ok' ? 'success'
    : record.status === 'error' ? 'error'
    : record.status;

  const jsonMax = showFullJson ? 500000 : 4000;

  return (
    <div className="hub-node-inspector">
      <div className="hub-inspector-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <StatusDot status={nodeStatus} />
          <div style={{ minWidth: 0 }}>
            <div className="hub-inspector-title">{record.nodeLabel ?? record.nodeId}</div>
            <div className="hub-inspector-meta">
              {record.nodeType} · {formatDuration(record.durationMs)}
            </div>
          </div>
        </div>
        {onClose && (
          <button type="button" className="hub-inspector-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>

      {record.storagePath && (
        <div className="hub-inspector-storage">
          <span className="hub-inspector-k">Storage JSON</span>
          <code className="hub-inspector-v mono" style={{ fontSize: 10, wordBreak: 'break-all' }}>
            {record.storagePath}
          </code>
          {record.hasFullPayload && (
            <span style={{ fontSize: 10, color: 'var(--green)', marginLeft: 8 }}>full payload</span>
          )}
        </div>
      )}

      <div className="hub-inspector-metrics">
        <div className="hub-inspector-metric">
          <div className="hub-inspector-metric-lbl">Status</div>
          <div className="hub-inspector-metric-val">{record.status.toUpperCase()}</div>
        </div>
        <div className="hub-inspector-metric">
          <div className="hub-inspector-metric-lbl">Duration</div>
          <div className="hub-inspector-metric-val">{formatDuration(record.durationMs)}</div>
        </div>
        <div className="hub-inspector-metric">
          <div className="hub-inspector-metric-lbl">Node ID</div>
          <div className="hub-inspector-metric-val mono" style={{ fontSize: 10 }}>{record.nodeId}</div>
        </div>
      </div>

      {record.logLine && (
        <div className="hub-inspector-logline">{record.logLine}</div>
      )}

      {record.error && (
        <div className="hub-inspector-error">{record.error}</div>
      )}

      {record.httpTrace && <HttpTraceSection trace={record.httpTrace} />}

      <div className="hub-inspector-io">
        <div className="hub-inspector-io-col">
          <div className="hub-inspector-section-title">Input (before)</div>
          {record.before && Object.keys(record.before).length > 0 ? (
            <pre className="json-block hub-json-full">{jsonPreview(record.before, jsonMax)}</pre>
          ) : (
            <div className="hub-inspector-muted">No input snapshot</div>
          )}
        </div>
        <div className="hub-inspector-io-col">
          <div className="hub-inspector-section-title">Output (after)</div>
          {record.after && Object.keys(record.after).length > 0 ? (
            <pre className="json-block hub-json-full">{jsonPreview(record.after, jsonMax)}</pre>
          ) : (
            <div className="hub-inspector-muted">No output snapshot</div>
          )}
        </div>
      </div>
    </div>
  );
};

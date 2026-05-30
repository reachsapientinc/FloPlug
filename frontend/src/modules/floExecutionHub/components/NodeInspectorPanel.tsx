import React from 'react';
import type { FloExecutionNodeRecord, NodeHttpTrace } from '@floplug/shared';
import { CodeBlockWithCopy } from '../../../components/CodeBlockWithCopy';
import { CopyButton } from '../../../components/CopyButton';
import { formatDuration, jsonPreview } from '../utils/formatters';
import { StatusDot } from './StatusBadge';
import '../../../styles/copy-ui.css';

export interface NodeInspectorPanelProps {
  record: FloExecutionNodeRecord | null;
  onClose?: () => void;
}

function HttpTraceSection({ trace }: { trace: NodeHttpTrace }) {
  const reqBody = trace.requestBody ?? trace.requestBodyPreview ?? '';
  const resBody = trace.responseBody ?? trace.responseBodyPreview ?? '';
  const headersText = trace.requestHeaders
    ? jsonPreview(trace.requestHeaders, 8000)
    : '';

  return (
    <div className="hub-inspector-section">
      <div className="hub-inspector-section-title">HTTP request</div>
      <div className="hub-inspector-kv">
        <span className="hub-inspector-k">Method</span>
        <span className="hub-inspector-v mono" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {trace.method}
          <CopyButton text={trace.method} label="Copy method" />
        </span>
      </div>
      <div className="hub-inspector-kv">
        <span className="hub-inspector-k">URL</span>
        <span className="hub-inspector-v mono" style={{ wordBreak: 'break-all', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ flex: 1 }}>{trace.url}</span>
          <CopyButton text={trace.url} label="Copy URL" />
        </span>
      </div>
      {trace.status != null && (
        <div className="hub-inspector-kv">
          <span className="hub-inspector-k">Response</span>
          <span className="hub-inspector-v mono">{trace.status} {trace.statusText ?? ''}</span>
        </div>
      )}
      {headersText && (
        <CodeBlockWithCopy title="Headers (redacted)" content={headersText} maxHeight={200} />
      )}
      {reqBody && (
        <CodeBlockWithCopy title="Request body" content={reqBody} maxHeight={360} />
      )}
      {resBody && (
        <CodeBlockWithCopy title="Response body" content={resBody} maxHeight={360} />
      )}
    </div>
  );
}

export const NodeInspectorPanel: React.FC<NodeInspectorPanelProps> = ({ record, onClose }) => {

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

  const jsonMax = 500000;
  const beforeText = record.before && Object.keys(record.before).length > 0
    ? jsonPreview(record.before, jsonMax)
    : '';
  const afterText = record.after && Object.keys(record.after).length > 0
    ? jsonPreview(record.after, jsonMax)
    : '';

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
          <code className="hub-inspector-v mono" style={{ fontSize: 10, wordBreak: 'break-all', flex: 1 }}>
            {record.storagePath}
          </code>
          <CopyButton text={record.storagePath} label="Copy storage path" />
          {record.hasFullPayload && (
            <span style={{ fontSize: 10, color: 'var(--green)', marginLeft: 4 }}>full payload</span>
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
        <div className="hub-inspector-logline" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ flex: 1 }}>{record.logLine}</span>
          <CopyButton text={record.logLine} label="Copy log line" />
        </div>
      )}

      {record.error && (
        <div className="hub-inspector-error" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ flex: 1 }}>{record.error}</span>
          <CopyButton text={record.error} label="Copy error" />
        </div>
      )}

      {record.error && !record.httpTrace && record.nodeType === 'floActionNode' && (
        <div className="hub-inspector-muted" style={{ marginBottom: 8, fontSize: 12 }}>
          No HTTP trace was stored for this failure. Redeploy functions after the latest hub
          diagnostics update, then re-run. Older runs may only show the generic connector error.
        </div>
      )}

      {record.httpTrace && <HttpTraceSection trace={record.httpTrace} />}

      <div className="hub-inspector-io">
        <div className="hub-inspector-io-col">
          {beforeText ? (
            <CodeBlockWithCopy title="Input (before)" content={beforeText} maxHeight={320} />
          ) : (
            <>
              <div className="hub-inspector-section-title">Input (before)</div>
              <div className="hub-inspector-muted">No input snapshot</div>
            </>
          )}
        </div>
        <div className="hub-inspector-io-col">
          {afterText ? (
            <CodeBlockWithCopy title="Output (after)" content={afterText} maxHeight={320} />
          ) : (
            <>
              <div className="hub-inspector-section-title">Output (after)</div>
              <div className="hub-inspector-muted">No output snapshot</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

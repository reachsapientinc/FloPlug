import React from 'react';
import type { FloExecutionNodeRecord } from '@floplug/shared';
import { jsonPreview } from '../utils/formatters';

const NODE_HINTS: Record<string, string> = {
  floPlugNode:       'Plug execution — file / email / HTTP',
  floActionNode:     'FloKit action — connector API call',
  templateNode:      'Template transform',
  filterNode:        'Filter / branch',
  loopNode:          'Loop iteration',
  variableStoreNode: 'Variable store read/write',
  fifNode:           'FIF conditional',
};

export const GenericNodeBody: React.FC<{ record: FloExecutionNodeRecord }> = ({ record }) => {
  const hint = NODE_HINTS[record.nodeType] ?? 'Generic node execution record';

  return (
    <>
      <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 10 }}>{hint}</div>
      {record.before && Object.keys(record.before).length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', marginBottom: 4, textTransform: 'uppercase' }}>
            Before
          </div>
          <pre className="json-block">{jsonPreview(record.before)}</pre>
        </div>
      )}
      {record.after && Object.keys(record.after).length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', marginBottom: 4, textTransform: 'uppercase' }}>
            After
          </div>
          <pre className="json-block">{jsonPreview(record.after)}</pre>
        </div>
      )}
    </>
  );
};

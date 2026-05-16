import React from 'react';
import type { Node } from '@xyflow/react';
import { ThemeProvider } from '../theme/ThemeContext';
import type { DesignerInspectorContext, InspectorOnUpdate } from './types';
import { InspectorHeader, InspectorFooter } from './InspectorChrome';
import { PlugNodeInspectorPanel } from './plugInspectors';
import {
  WorkdayInspector, SalesforceInspector, SapInspector, OracleInspector,
  FilterInspector, MapperInspector, VariableStoreInspector,
  FIFInspector, LoopInspector, FunctionInspector, TemplateInspector,
  StartInspector, EndInspector,
} from './nodeInspectors';

const REGISTRY: Record<string, React.FC<{ node: Node; onUpdate: InspectorOnUpdate; ctx: DesignerInspectorContext }>> = {
  startNode:         StartInspector,
  endNode:           EndInspector,
  plugNode:          PlugNodeInspectorPanel,
  workdayNode:       WorkdayInspector,
  salesforceNode:    SalesforceInspector,
  sapNode:           SapInspector,
  oracleNode:        OracleInspector,
  mapperNode:        MapperInspector,
  filterNode:        FilterInspector,
  variableStoreNode: VariableStoreInspector,
  fifNode:           FIFInspector,
  loopNode:          LoopInspector,
  functionNode:      FunctionInspector,
  templateNode:      TemplateInspector,
};

export interface NodeInspectorPanelProps {
  node:     Node | null;
  onUpdate: InspectorOnUpdate;
  ctx:      DesignerInspectorContext;
}

export const NodeInspectorPanel: React.FC<NodeInspectorPanelProps> = ({ node, onUpdate, ctx }) => {
  if (!node) {
    return (
      <ThemeProvider>
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: 16, color: '#3a3a50', fontSize: 11,
          fontFamily: "'Inter',-apple-system,sans-serif", textAlign: 'center',
        }}>
          <div>Select a node to inspect</div>
        </div>
      </ThemeProvider>
    );
  }

  const Specific = REGISTRY[node.type ?? ''];

  return (
    <ThemeProvider>
      <div style={{
        flex: 1, overflowY: 'auto', padding: 14,
        fontFamily: "'Inter',-apple-system,sans-serif", fontSize: 11, color: '#c0c0cc',
      }}>
        <InspectorHeader node={node} />
        {Specific
          ? <Specific node={node} onUpdate={onUpdate} ctx={ctx} />
          : <div style={{ fontSize: 10, color: '#3a3a50', fontStyle: 'italic' }}>No inspector for this node type.</div>
        }
        <InspectorFooter position={node.position} />
      </div>
    </ThemeProvider>
  );
};

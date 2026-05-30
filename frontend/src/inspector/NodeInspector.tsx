import React from 'react';
import type { Node } from '@xyflow/react';
import { ThemeProvider } from '../theme/ThemeContext';
import type { DesignerInspectorContext, InspectorOnUpdate } from './types';
import { InspectorHeader, InspectorFooter } from './InspectorChrome';
import { InspectorExpandShell, DisplayNameField } from './InspectorExpandShell';
import { InspectorQuickHelp } from './InspectorQuickHelp';
import { PlugNodeInspectorPanel } from './plugInspectors';
import {
  WorkdayInspector, SalesforceInspector, SapInspector, OracleInspector,
  FilterInspector, MapperInspector, VariableStoreInspector,
  FIFInspector, LoopInspector, FunctionInspector, TemplateInspector,
  StartInspector, EndInspector, FloActionInspector, SwitchInspector,
  SubFloInspector, InvokeSubFloInspector, SubFloReturnInspector,
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
  floSwitchNode:     SwitchInspector,
  variableStoreNode: VariableStoreInspector,
  fifNode:           FIFInspector,
  loopNode:          LoopInspector,
  subFloNode:        SubFloInspector,
  invokeSubFloNode:  InvokeSubFloInspector,
  subFloReturnNode:  SubFloReturnInspector,
  functionNode:      FunctionInspector,
  templateNode:      TemplateInspector,
  floActionNode:     FloActionInspector, 
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
        <InspectorQuickHelp />
      </ThemeProvider>
    );
  }

  const Specific = REGISTRY[node.type ?? ''];

  return (
    <ThemeProvider>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 14,
        minHeight: 0,
        fontFamily: "'Inter',-apple-system,sans-serif",
        fontSize: 11,
        color: '#c0c0cc',
      }}>
        <InspectorHeader node={node} />
        {node.type !== 'startNode' && node.type !== 'endNode' && (
          <DisplayNameField
            value={String((node.data as Record<string, unknown>).displayName ?? '')}
            onChange={displayName => onUpdate(node.id, {
              displayName,
              ...(node.type === 'subFloNode' ? { canvasName: displayName } : {}),
            })}
            hint={node.type === 'subFloNode'
              ? 'Same label used on canvas and in the Invoke SubFlo dropdown.'
              : undefined}
          />
        )}
        <InspectorExpandShell>
          {Specific
            ? <Specific node={node} onUpdate={onUpdate} ctx={ctx} />
            : <div style={{ fontSize: 10, color: '#6b7080', fontStyle: 'italic' }}>No inspector for this node type.</div>
          }
        </InspectorExpandShell>
        <InspectorFooter position={node.position} />
      </div>
    </ThemeProvider>
  );
};

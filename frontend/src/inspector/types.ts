import type { Functions } from 'firebase/functions';
import type { Node, Edge } from '@xyflow/react';

export interface FloListItem {
  id:   string;
  name: string;
}

export interface DesignerInspectorContext {
  functions:     Functions;
  hubId:         string;
  tenantId:      string;
  flos:          FloListItem[];
  activeFloId:   string | null;
  nodes:         Node[];
  edges:         Edge[];
  lastRunInput:  Record<string, unknown> | null;
  onTestNode:    (nodeId: string) => Promise<void>;
  testingNodeId: string | null;
}

export type InspectorOnUpdate = (nodeId: string, data: Record<string, unknown>) => void;

export interface NodeInspectorProps {
  node:     Node;
  onUpdate: InspectorOnUpdate;
  ctx:      DesignerInspectorContext;
}

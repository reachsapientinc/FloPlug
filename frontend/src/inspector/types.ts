import type { Functions } from 'firebase/functions';
import type { Node, Edge } from '@xyflow/react';
import type { FloActionPaletteItem, HubActionNodeDoc } from '@floplug/shared';

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
  floActions?: FloActionPaletteItem[];
  /** Live hub FloAction doc by floKitId (for URL preview / kit context). */
  getHubActionDoc?: (floKitId: string) => HubActionNodeDoc | undefined;
}

export type InspectorOnUpdate = (nodeId: string, data: Record<string, unknown>) => void;

export interface NodeInspectorProps {
  node:     Node;
  onUpdate: InspectorOnUpdate;
  ctx:      DesignerInspectorContext;
}

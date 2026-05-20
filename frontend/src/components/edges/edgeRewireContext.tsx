import { createContext, useContext } from 'react';
import type { Connection, Edge } from '@xyflow/react';

export type RewireEnd = 'source' | 'target';

export interface EdgeRewireApi {
  onReconnect:        (oldEdge: Edge, connection: Connection) => void;
  onReconnectStart:   (edge: Edge, end: RewireEnd) => void;
  onReconnectEnd:     () => void;
  isValidConnection:  (connection: Connection) => boolean;
  /** Call before imperative edge deletes (× button) so undo can restore the wire. */
  recordHistory?:     () => void;
}

export const EdgeRewireContext = createContext<EdgeRewireApi | null>(null);

export function useEdgeRewire(): EdgeRewireApi {
  const ctx = useContext(EdgeRewireContext);
  if (!ctx) throw new Error('useEdgeRewire must be used inside EdgeRewireContext.Provider');
  return ctx;
}

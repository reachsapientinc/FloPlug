import { useCallback, useRef, useState } from 'react';
import {
  cloneSnapshot,
  snapshotCanvas,
  type CanvasSnapshot,
} from '../utils/canvasSnapshot';
import type { Edge, Node } from '@xyflow/react';

const MAX_HISTORY = 50;

export interface UseCanvasHistoryResult {
  pushSnapshot: (nodes: Node[], edges: Edge[]) => void;
  undo:         (currentNodes: Node[], currentEdges: Edge[]) => CanvasSnapshot | null;
  redo:         (currentNodes: Node[], currentEdges: Edge[]) => CanvasSnapshot | null;
  resetHistory: () => void;
  canUndo:      boolean;
  canRedo:      boolean;
  /** True while applying undo/redo — skip recording new snapshots. */
  isApplying:   () => boolean;
}

export function useCanvasHistory(): UseCanvasHistoryResult {
  const pastRef    = useRef<CanvasSnapshot[]>([]);
  const futureRef  = useRef<CanvasSnapshot[]>([]);
  const applyingRef = useRef(false);
  const [version, setVersion] = useState(0);

  const bump = () => setVersion((v) => v + 1);

  const pushSnapshot = useCallback((nodes: Node[], edges: Edge[]) => {
    if (applyingRef.current) return;
    pastRef.current = [
      ...pastRef.current,
      snapshotCanvas(nodes, edges),
    ].slice(-MAX_HISTORY);
    futureRef.current = [];
    bump();
  }, []);

  const undo = useCallback((currentNodes: Node[], currentEdges: Edge[]): CanvasSnapshot | null => {
    if (!pastRef.current.length) return null;
    applyingRef.current = true;
    futureRef.current.push(snapshotCanvas(currentNodes, currentEdges));
    const prev = pastRef.current.pop()!;
    bump();
    queueMicrotask(() => { applyingRef.current = false; });
    return cloneSnapshot(prev);
  }, []);

  const redo = useCallback((currentNodes: Node[], currentEdges: Edge[]): CanvasSnapshot | null => {
    if (!futureRef.current.length) return null;
    applyingRef.current = true;
    pastRef.current.push(snapshotCanvas(currentNodes, currentEdges));
    const next = futureRef.current.pop()!;
    bump();
    queueMicrotask(() => { applyingRef.current = false; });
    return cloneSnapshot(next);
  }, []);

  const resetHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    bump();
  }, []);

  return {
    pushSnapshot,
    undo,
    redo,
    resetHistory,
    canUndo:    pastRef.current.length > 0,
    canRedo:    futureRef.current.length > 0,
    isApplying: () => applyingRef.current,
  };
}

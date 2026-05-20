/**
 * Deletable edge — rewire by dragging the highlighted line (HTML handles above nodes).
 */
import React, { useCallback } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  useStore,
  useStoreApi,
  type Connection,
  type Edge,
  type EdgeProps,
  type FinalConnectionState,
  type HandleType,
  type OnConnectStart,
} from '@xyflow/react';
import { XYHandle } from '@xyflow/system';
import { useEdgeRewire, type RewireEnd } from './edgeRewireContext';

const REWIRE_HIT = 44;

const DeletableEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  interactionWidth,
}) => {
  const { setEdges, screenToFlowPosition } = useReactFlow();
  const store = useStoreApi();
  const { onReconnect, onReconnectStart, onReconnectEnd, isValidConnection, recordHistory } = useEdgeRewire();

  const edge = useStore(
    useCallback((s) => s.edges.find((e) => e.id === id), [id]),
  );
  const isSelected = edge?.selected === true;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const selectThisEdge = useCallback(() => {
    setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === id })));
  }, [id, setEdges]);

  const startRewire = useCallback(
    (event: React.MouseEvent, rewireEnd: RewireEnd) => {
      if (event.button !== 0 || !edge) return;
      event.stopPropagation();
      event.preventDefault();

      const oppositeHandle =
        rewireEnd === 'target'
          ? { nodeId: edge.source, id: edge.sourceHandle ?? null, type: 'source' as HandleType }
          : { nodeId: edge.target, id: edge.targetHandle ?? null, type: 'target' as HandleType };

      const {
        autoPanOnConnect,
        domNode,
        connectionMode,
        connectionRadius,
        lib,
        onConnectStart,
        cancelConnection,
        nodeLookup,
        rfId: flowId,
        panBy,
        updateConnection,
        onConnectEnd,
      } = store.getState();

      const onConnectEdge = (connection: Connection) => {
        onReconnect(edge as Edge, connection);
      };

      const _onConnectStart: OnConnectStart = (_evt, params) => {
        onReconnectStart(edge as Edge, rewireEnd);
        onConnectStart?.(_evt, params);
      };

      const _onReconnectEnd = (
        evt: MouseEvent | TouchEvent,
        connectionState: FinalConnectionState,
      ) => {
        onReconnectEnd();
        void evt;
        void connectionState;
      };

      XYHandle.onPointerDown(event.nativeEvent, {
        autoPanOnConnect,
        connectionMode,
        connectionRadius,
        domNode,
        handleId: oppositeHandle.id,
        nodeId: oppositeHandle.nodeId,
        nodeLookup,
        isTarget: oppositeHandle.type === 'target',
        edgeUpdaterType: oppositeHandle.type,
        lib,
        flowId,
        cancelConnection,
        panBy,
        isValidConnection,
        onConnect: onConnectEdge,
        onConnectStart: _onConnectStart,
        onConnectEnd: (...args) => onConnectEnd?.(...args),
        onReconnectEnd: _onReconnectEnd,
        updateConnection,
        getTransform: () => store.getState().transform,
        getFromHandle: () => store.getState().connection.fromHandle,
        dragThreshold: store.getState().connectionDragThreshold,
        handleDomNode: event.currentTarget as HTMLElement,
      });
    },
    [edge, store, onReconnect, onReconnectStart, onReconnectEnd, isValidConnection],
  );

  /** Pick source vs target end from where on the line the user pressed. */
  const startRewireFromPointer = useCallback(
    (event: React.MouseEvent) => {
      if (!edge) return;
      const pt = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const ds = Math.hypot(pt.x - sourceX, pt.y - sourceY);
      const dt = Math.hypot(pt.x - targetX, pt.y - targetY);
      startRewire(event, ds <= dt ? 'source' : 'target');
    },
    [edge, screenToFlowPosition, sourceX, sourceY, targetX, targetY, startRewire],
  );

  const onLinePointerDown = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();

      const picked = store.getState().edges.find((e) => e.id === id)?.selected === true;
      if (!picked) {
        setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === id })));
      }
      startRewireFromPointer(event);
    },
    [id, store, setEdges, startRewireFromPointer],
  );

  const rewireHandleStyle = (x: number, y: number): React.CSSProperties => ({
    position:        'absolute',
    transform:       `translate(-50%, -50%) translate(${x}px, ${y}px)`,
    width:           REWIRE_HIT,
    height:          REWIRE_HIT,
    borderRadius:    '50%',
    cursor:          'grab',
    zIndex:          20,
    pointerEvents:   'all',
    background:      'transparent',
    border:          'none',
    padding:         0,
    touchAction:     'none',
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={isSelected ? 36 : (interactionWidth ?? 20)}
        style={{
          stroke:      isSelected ? '#93c5fd' : '#4f8ef7',
          strokeWidth: isSelected ? 3 : 1.5,
          filter:      isSelected ? 'drop-shadow(0 0 6px rgba(147,197,253,0.45))' : 'none',
          transition:  'stroke 0.15s, stroke-width 0.15s',
          cursor:      isSelected ? 'grab' : 'pointer',
        }}
      />
      {/* Wide hit-area on the line — drag to rewire (mousedown, not click) */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={isSelected ? 36 : 24}
        className="nodrag nopan"
        style={{ cursor: isSelected ? 'grab' : 'pointer' }}
        onMouseDown={onLinePointerDown}
      />
      <EdgeLabelRenderer>
        {isSelected && (
          <>
            <button
              type="button"
              className="nodrag nopan edge-rewire-handle"
              title="Drag to rewire source"
              aria-label="Rewire source"
              style={rewireHandleStyle(sourceX, sourceY)}
              onMouseDown={(e) => { selectThisEdge(); startRewire(e, 'source'); }}
            />
            <button
              type="button"
              className="nodrag nopan edge-rewire-handle"
              title="Drag to rewire target"
              aria-label="Rewire target"
              style={rewireHandleStyle(targetX, targetY)}
              onMouseDown={(e) => { selectThisEdge(); startRewire(e, 'target'); }}
            />
          </>
        )}
        <div
          style={{
            position:        'absolute',
            transform:       `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents:   isSelected ? 'all' : 'none',
            opacity:         isSelected ? 1 : 0,
            visibility:      isSelected ? 'visible' : 'hidden',
            transition:      'opacity 0.12s',
            zIndex:          15,
          }}
          className="edge-delete-btn-wrap nodrag nopan"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              recordHistory?.();
              setEdges((eds) => eds.filter((e) => e.id !== id));
            }}
            title="Delete connection"
            style={{
              width: 18, height: 18, borderRadius: '50%',
              background: '#f87171', border: '2px solid #0f1117',
              color: '#fff', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, padding: 0,
            }}
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

export default DeletableEdge;

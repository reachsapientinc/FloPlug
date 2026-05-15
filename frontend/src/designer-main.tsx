import React, { useState,useCallback } from 'react'
import ReactDOM from 'react-dom/client'
import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { ReactFlow, useNodesState, useEdgesState, addEdge, Background, Controls, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './index.css'

// 1. Your Firebase Config (Get this from Firebase Console > Project Settings)
const firebaseConfig = {
  projectId: "floplug-io",
  // Copy the rest of the fields from your Firebase Console
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

const WorkdayNode = ({ data }: any) => {
  const [workerId, setWorkerId] = useState('');
  const [result, setResult] = useState('');

  const handleExecute = async () => {
  setResult('Loading...');
  console.log("Debug: Functions instance check:", data.functions);
  
  try {
    const executeWorkdayAction = httpsCallable(data.functions, 'executeWorkdayAction');
    const response: any = await executeWorkdayAction({ 
      workerId, 
      actionType: 'GET_DETAILS' 
    });
    setResult(response.data.data.message);
  } catch (err: any) {
    console.error("Full Engine Error:", err);
    // This will tell us if it's a 404, 403, or a Code error
    setResult(`Error: ${err.message || 'Engine Unreachable'}`);
  }
};

  return (
    <div style={{ background: '#fff', border: '1px solid #777', padding: '10px', borderRadius: '5px', width: '200px' }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '5px' }}>Workday Connector</div>
      <input 
        placeholder="Worker ID" 
        value={workerId} 
        onChange={(e) => setWorkerId(e.target.value)}
        style={{ width: '100%', marginBottom: '5px', fontSize: '10px' }}
      />
      <button onClick={handleExecute} style={{ width: '100%', cursor: 'pointer', fontSize: '10px' }}>Run Engine</button>
      {result && <div style={{ marginTop: '5px', fontSize: '9px', color: 'blue' }}>{result}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

// 2. Register the custom node type
const nodeTypes = { workdayNode: WorkdayNode };

const Designer = () => {
  // Pass the functions instance into the node data so the node can use it
  const [nodes, _setNodes, onNodesChange] = useNodesState([
    { 
      id: 'node-1', 
      type: 'workdayNode', 
      data: { functions: functions }, // Passing our Firebase context
      position: { x: 250, y: 50 } 
    }
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow 
        nodes={nodes} 
        edges={edges} 
        onNodesChange={onNodesChange} 
        onEdgesChange={onEdgesChange} 
        onConnect={onConnect} 
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Designer />
  </React.StrictMode>,
)
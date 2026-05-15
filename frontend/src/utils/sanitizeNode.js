// ── Node sanitiser ────────────────────────────────────────────────────────────
// Strips non-serialisable values (functions, class instances, circular refs)
// from node data before saving to Firestore or sending to executeFlo.
// The Firebase `functions` instance and ReactFlow internal refs are the main
// offenders — they must never be stored in node data.
const STRIP_KEYS = new Set(['functions', 'onLogEntry', 'onUpdate', '__rf']);

function sanitizeNode(node: Node): Node {
  const cleanData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node.data ?? {})) {
    if (STRIP_KEYS.has(k)) continue;           // drop known bad keys
    if (typeof v === 'function') continue;      // drop any function value
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      // Shallow-safe objects only — drop anything with circular structure
      try { JSON.stringify(v); cleanData[k] = v; } catch { /* skip */ }
    } else {
      cleanData[k] = v;
    }
  }
  return {
    id:       node.id,
    type:     node.type,
    position: node.position,
    data:     cleanData,
    // preserve measured/width/height if present but not the internal rf object
    ...(node.width  ? { width:  node.width }  : {}),
    ...(node.height ? { height: node.height } : {}),
  };
}

function sanitizeNodes(nodes: Node[]): Node[] {
  return nodes.map(sanitizeNode);
}
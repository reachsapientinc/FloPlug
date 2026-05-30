/**
 * Quick help / cheat sheet when no node is selected in the designer inspector.
 */

import React, { useState } from 'react';
import { useTheme } from '../theme/ThemeContext';

interface HelpSection {
  id:    string;
  title: string;
  body:  React.ReactNode;
}

const RUN_META_ROWS: { field: string; note: string }[] = [
  { field: 'floRunMeta.runId',       note: 'Execution log id (same as floRunId)' },
  { field: 'floRunMeta.floId',       note: 'Current flow id' },
  { field: 'floRunMeta.floName',     note: 'Flow display name' },
  { field: 'floRunMeta.slug',        note: 'Flow short code / slug' },
  { field: 'floRunMeta.tenant',      note: 'Tenant id' },
  { field: 'floRunMeta.hubId',       note: 'Hub id' },
  { field: 'floRunMeta.floRunName',  note: 'Optional label you set when running' },
  { field: 'floRunMeta.runType',     note: 'Scheduled | Webhook | RunFlo' },
  { field: 'floRunMeta.userId',      note: 'Runner user id' },
  { field: 'floRunMeta.userEmail',   note: 'Runner email' },
  { field: 'floRunMeta.startDatetime', note: 'ISO-8601 UTC start time' },
  { field: 'floRunMeta.parentRunId', note: 'Parent run when nested (future)' },
];

const SECTIONS: HelpSection[] = [
  {
    id: 'scopes',
    title: 'Expression scopes',
    body: (
      <>
        <p style={{ margin: '0 0 8px', lineHeight: 1.5 }}>
          Use these prefixes in Mapper, Filter, FloSwitch, Template, and plug fields:
        </p>
        <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.55 }}>
          <li><code>cStream.path</code> — payload moving through the flow</li>
          <li><code>local.name</code> — per-run variables from Variable Store / node output</li>
          <li><code>global.name</code> — tenant-wide values (Start init vars, etc.)</li>
          <li><code>floRunMeta.field</code> — read-only run metadata (see below)</li>
        </ul>
        <p style={{ margin: '10px 0 0', fontSize: 10, color: '#9090a8' }}>
          FloExpressions also support functions: <code>concat</code>, <code>iif</code>, <code>exists</code>, <code>substring</code>, …
        </p>
      </>
    ),
  },
  {
    id: 'runmeta',
    title: 'floRunMeta (read-only)',
    body: (
      <>
        <p style={{ margin: '0 0 8px', lineHeight: 1.5 }}>
          Set by the engine on every run. Reference as <code>floRunMeta.&lt;field&gt;</code>:
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <tbody>
            {RUN_META_ROWS.map(r => (
              <tr key={r.field}>
                <td style={{
                  padding: '4px 6px 4px 0',
                  fontFamily: 'monospace',
                  color: '#7eb6ff',
                  verticalAlign: 'top',
                  whiteSpace: 'nowrap',
                }}>
                  {r.field.replace('floRunMeta.', '')}
                </td>
                <td style={{ padding: '4px 0', color: '#a0a0b8', lineHeight: 1.4 }}>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: 'run',
    title: '▶ Run (full flow)',
    body: (
      <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
        <li>Click <strong>▶ Run</strong> in the top bar (flow must be open).</li>
        <li>Enter test JSON — it becomes the Start node <code>cStream</code> input.</li>
        <li>Review the log in <strong>Last run</strong> below; open full output from there.</li>
        <li>Runs in <strong>test</strong> mode — safe for drafts; publish for production/webhooks.</li>
      </ol>
    ),
  },
  {
    id: 'testnode',
    title: 'Test Node',
    body: (
      <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
        <li>Select any node (not Start/End).</li>
        <li>Scroll the inspector — set <strong>Test input (JSON)</strong> if needed.</li>
        <li>Click <strong>Test Node</strong> — runs upstream path into that node only (subgraph).</li>
        <li>Result appears on the node card and in the inspector; no Execution Hub write.</li>
        <li>Plugs / connectors / FloActions use their own test buttons when applicable.</li>
      </ol>
    ),
  },
  {
    id: 'canvas',
    title: 'Canvas navigation',
    body: (
      <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.55 }}>
        <li><strong>Bottom-left</strong> — zoom + / −, fit view, lock pan.</li>
        <li><strong>Bottom-right</strong> — minimap overview (blue blocks = nodes).</li>
        <li><strong>Fit flow</strong> — button on bottom-left if the graph is off-screen after refresh.</li>
        <li>Scroll to zoom · drag canvas to pan · Save stores pan/zoom with the draft.</li>
      </ul>
    ),
  },
  {
    id: 'subflo',
    title: 'SubFlo + InvokeSubFlo',
    body: (
      <>
        <p style={{ margin: '0 0 8px', lineHeight: 1.5 }}>
          Inline subflows on the <strong>same canvas</strong> — not a separate flo file.
        </p>
        <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.55 }}>
          <li><strong>SubFlo</strong> — contract node: canvas display name, input/return args, description.</li>
          <li><strong>SubFlo Return</strong> — maps <code>cStream</code> / <code>local.*</code> to return args; ends the invoke.</li>
          <li><strong>Invoke SubFlo</strong> — on the <strong>main flow</strong>; binds inputs; returns become <code>local.*</code>.</li>
          <li><strong>Plugs &amp; FloActions</strong> — allowed <em>inside</em> a compartment (select SubFlo, then drag from palette).</li>
          <li>Wire <strong>SubFlo → … → SubFlo Return</strong> inside the compartment; main flow uses Start/End, not SubFlo Return.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'subflo-patterns',
    title: 'SubFlo patterns & limits',
    body: (
      <>
        <p style={{ margin: '0 0 8px', lineHeight: 1.5, fontWeight: 600, color: '#c8c8d8' }}>
          What works
        </p>
        <ul style={{ margin: '0 0 10px', paddingLeft: 16, lineHeight: 1.55 }}>
          <li>Each compartment needs <strong>≥ 1 SubFlo Return</strong> (validation error if missing).</li>
          <li>Drop or wire nodes while SubFlo is selected — they join that compartment (<code>subFloId</code>).</li>
          <li>Branch inside one SubFlo with FloSwitch / Filter; multiple returns OK (first hit wins).</li>
          <li><strong>Shared logic</strong> (e.g. same email step) → extract a <strong>nested SubFlo</strong> and Invoke it from each path.</li>
        </ul>
        <p style={{ margin: '0 0 8px', lineHeight: 1.5, fontWeight: 600, color: '#c8c8d8' }}>
          What is blocked (by design)
        </p>
        <ul style={{ margin: '0 0 10px', paddingLeft: 16, lineHeight: 1.55 }}>
          <li><strong>No shared nodes</strong> across two SubFlos — each node has one <code>subFloId</code>.</li>
          <li><strong>No criss-cross wires</strong> between compartments — use Invoke SubFlo at boundaries.</li>
          <li>SubFlo outlet → main-flow Plug does <em>not</em> keep that plug on main flow; it joins the SubFlo.</li>
          <li><code>cStream</code> / <code>local</code> do not “pick” which SubFlo owns a node — membership is static on the canvas.</li>
        </ul>
        <p style={{ margin: 0, fontSize: 10, color: '#9090a8', lineHeight: 1.45 }}>
          Mental model: main flow = Start → … → Invoke SubFlo → … → End. Compartment = SubFlo → internal nodes → SubFlo Return.
        </p>
      </>
    ),
  },
  {
    id: 'loopv2',
    title: 'Loop (loop / exit paths)',
    body: (
      <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.55 }}>
        <li><strong>loop</strong> handle — wire InvokeSubFlo or other nodes; repeats until continueExpr is false.</li>
        <li><strong>exit</strong> handle — continues main flow (optional another InvokeSubFlo).</li>
        <li>Export <code>continue</code> (or similar) as a SubFlo return arg for <code>local.continue</code>.</li>
        <li><strong>Execute at least once</strong> — do-while vs while-first semantics.</li>
        <li>Max iterations caps infinite loops at runtime.</li>
      </ul>
    ),
  },
  {
    id: 'wiring',
    title: 'Wiring tips',
    body: (
      <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.55 }}>
        <li>One outgoing wire per handle; FloSwitch routes are separate handles.</li>
        <li>Many nodes may connect into one target (e.g. several paths → End).</li>
        <li>SubFlo compartments cannot wire across boundaries — use InvokeSubFlo (see <strong>SubFlo patterns &amp; limits</strong>).</li>
        <li>FloSwitch: first matching branch wins; wire <code>defaultFlo</code> for no match.</li>
      </ul>
    ),
  },
];

export const InspectorQuickHelp: React.FC = () => {
  const t = useTheme();
  const [openId, setOpenId] = useState<string>('scopes');

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '10px 12px 16px',
      minHeight: 0,
      fontFamily: "'Inter',-apple-system,sans-serif",
      fontSize: 11,
      color: t.textMuted,
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: t.textPrimary }}>Quick help</div>
        <div style={{ fontSize: 10, color: t.textDim, marginTop: 4, lineHeight: 1.45 }}>
          Select a node to edit its properties. Expand a topic below for a cheat sheet.
        </div>
      </div>

      {SECTIONS.map(section => {
        const open = openId === section.id;
        return (
          <div
            key={section.id}
            style={{
              marginBottom: 6,
              borderRadius: 6,
              border: `0.5px solid ${open ? t.accent : t.border}`,
              background: open ? `${t.accent}10` : t.inputBg,
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? '' : section.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '8px 10px',
                border: 'none',
                background: 'transparent',
                color: t.textPrimary,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span>{section.title}</span>
              <span style={{ color: t.textDim, fontSize: 10 }}>{open ? '−' : '+'}</span>
            </button>
            {open && (
              <div style={{
                padding: '0 10px 10px',
                borderTop: `0.5px solid ${t.border}`,
              }}>
                {section.body}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

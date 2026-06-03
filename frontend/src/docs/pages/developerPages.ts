import type { DocPage } from '../types';

// ─── Getting Started ──────────────────────────────────────────────────────────

const GETTING_STARTED: DocPage[] = [
  {
    id: 'dev-getting-started',
    slug: 'getting-started',
    title: 'Designer overview',
    category: 'product',
    audience: 'all',
    group: 'getting-started',
    groupOrder: 1,
    summary: 'Designer layout, palette, canvas, and inspector.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Designer layout',
        paragraphs: [
          'The FloPlug designer has three main areas: the node palette (left), the canvas (center), and the inspector (right).',
          'Select a node on the canvas to configure it in the inspector. With nothing selected, the inspector shows Quick Help topics for the node type you last hovered.',
        ],
        bullets: [
          'Palette — drag node types onto the canvas to add them to the flow.',
          'Canvas — visual graph of the flo; connect nodes by dragging from handles.',
          'Inspector — configure the selected node: fields, expressions, error handling.',
          'Toolbar — Save (draft), Publish (production), Run (test execution), Validate.',
        ],
      },
      {
        callout: {
          type: 'tip',
          text: 'Canvas or palette issues? Open Hub configuration (profile menu) to see what your admin enabled, then compare with Product help → Hub Admin.',
        },
      },
    ],
  },
];

// ─── Workspaces & Flos ───────────────────────────────────────────────────────

const WORKSPACES_FLOS: DocPage[] = [
  {
    id: 'dev-workspaces',
    slug: 'workspaces',
    title: 'Workspaces',
    category: 'product',
    audience: 'all',
    group: 'workspaces-and-flos',
    groupOrder: 1,
    summary: 'Workspace hierarchy, creation, and access control.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'What is a Workspace?',
        paragraphs: [
          'A Workspace is a folder for related integration flos. Every flo lives inside exactly one Workspace. Workspaces let you group flos by team, domain, or environment (e.g. "Finance", "HR Sync", "Staging Tests").',
        ],
        bullets: [
          'Create a Workspace from the main app sidebar → "+ New Workspace".',
          'Rename or delete Workspaces from the Workspace settings (⚙ icon next to name).',
          'Deleting a Workspace permanently removes all flos inside it — there is no recycle bin.',
          'Hub Admins can restrict which users access which Workspace via the Users & Permissions panel.',
        ],
      },
      {
        heading: 'Moving a Flo between Workspaces',
        bullets: [
          'Open the flo → Flo settings (⚙ in the top bar) → "Move to Workspace" → select destination.',
          'Moving preserves all draft and published versions.',
          'Webhook URLs tied to a flo do NOT change when you move workspaces — they are keyed to floId.',
          'Scheduled runs follow the flo automatically after the move.',
        ],
        callout: {
          type: 'warning',
          text: 'If users in the source Workspace do not have access to the destination Workspace, they will lose access to the flo after the move. Confirm permissions before moving.',
        },
      },
      {
        heading: 'Defaults and flo ordering',
        bullets: [
          'Flos inside a Workspace are sorted alphabetically by default.',
          'The most recently opened flo re-opens automatically on next visit.',
          'There is no "default flo" concept — each flo has its own URL and must be triggered explicitly.',
        ],
      },
    ],
  },
  {
    id: 'dev-flos',
    slug: 'flos',
    title: 'Flos — draft, publish & lifecycle',
    category: 'product',
    audience: 'all',
    group: 'workspaces-and-flos',
    groupOrder: 2,
    summary: 'Draft vs published, version promotion, webhooks, and scheduling.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Draft vs Published',
        paragraphs: [
          'Every flo has two separate versions: the draft (what you see in the designer) and the published version (what runs in production). They are independent snapshots.',
        ],
        bullets: [
          'Save — writes the current graph to the draft; does not affect production.',
          'Publish — promotes the current draft to the published version; takes effect immediately for webhooks and schedules.',
          'You can edit the draft freely without affecting live runs — publish only when ready.',
          'The Execution Hub always shows which version (draft or published) a run used.',
        ],
        callout: {
          type: 'info',
          text: 'Test runs (▶ Run button in designer) always execute against the current draft — no publish required for testing.',
        },
      },
      {
        heading: 'Triggering a Flo',
        bullets: [
          'Manual run — ▶ Run in the designer (draft, test mode).',
          'Webhook — copy the webhook URL from Flo settings; POST JSON to trigger (published version).',
          'Scheduler — Hub Admin portal → Scheduler → pick flo + cron/interval (published version).',
          'Invoke — call from another flo using a Plug or FloAction (published version).',
        ],
      },
      {
        heading: 'Flo lifecycle',
        flowDiagram: `  [Designer — editing draft]
        │
        ▼ Save
  [Draft saved to DB]
        │
        ▼ Publish
  [Published snapshot]
        │
        ├──▶ Webhook trigger ──▶ Production run
        ├──▶ Scheduler       ──▶ Production run
        └──▶ External invoke ──▶ Production run

  ▶ Run (from designer) ──▶ Test run against DRAFT (not published)`,
      },
    ],
  },
  {
    id: 'dev-workspace-hierarchy',
    slug: 'workspace-hierarchy',
    title: 'Workspace → Flo hierarchy',
    category: 'product',
    audience: 'all',
    group: 'workspaces-and-flos',
    groupOrder: 3,
    summary: 'How Workspaces, Flos, and SubFlos nest and relate.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Hierarchy overview',
        flowDiagram: `  Hub
  └── Workspace  (e.g. "Finance")
      ├── Flo A  (e.g. "Invoice Sync")
      │    ├── Draft graph  (canvas nodes + edges)
      │    │    ├── SubFlo compartments  (inline, same canvas)
      │    │    └── Invoke SubFlo nodes  (call compartments)
      │    └── Published graph  (production snapshot)
      └── Flo B  (e.g. "Employee Onboarding")`,
      },
      {
        bullets: [
          'One hub → many Workspaces → many Flos each.',
          'SubFlos are inline compartments on the same canvas — not separate flo files.',
          'A flo can invoke another flo via a Plug or FloAction (cross-flo call), but not directly reference its graph.',
          'There is no nesting of Workspaces — the hierarchy is flat (Hub → Workspace → Flo).',
        ],
      },
    ],
  },
];

// ─── Designer — Nodes ────────────────────────────────────────────────────────

const DESIGNER_NODES: DocPage[] = [
  {
    id: 'dev-canvas',
    slug: 'canvas-and-nodes',
    title: 'Canvas & wiring',
    category: 'product',
    audience: 'all',
    group: 'designer-nodes',
    groupOrder: 1,
    summary: 'Resize, delete, wiring rules, and handle types.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Node controls',
        bullets: [
          'Select a node — resize handles appear on corners and edges.',
          'Delete — × button when selected (Start/End cannot be deleted).',
          'Canvas display name — set a label in the inspector; shown on the node card.',
          'One outgoing wire per source handle; many nodes may connect into one target handle.',
        ],
      },
      {
        heading: 'Handle types',
        bullets: [
          'Blue dot (left) — target handle; receives incoming connections.',
          'Blue dot (right) — source handle; sends the normal execution path forward.',
          '⚡ Hex-shield (right, red) — error handle; only visible when "Catch error" is enabled.',
          'FloSwitch — multiple labeled source handles for each branch.',
          'Loop — "loop" and "exit" source handles.',
        ],
      },
      {
        heading: 'Wiring',
        bullets: [
          'Drag from any source handle to a target handle to connect nodes.',
          'Drag edges to rewire; click × on an edge label to remove it.',
          'SubFlo compartments cannot cross boundaries — use Invoke SubFlo.',
          'Error handles (⚡) wire to a separate error-handling path.',
        ],
      },
    ],
  },
  {
    id: 'dev-nodes-erp',
    slug: 'nodes-erp',
    title: 'ERP nodes — SAP, Oracle',
    category: 'product',
    audience: 'all',
    group: 'designer-nodes',
    groupOrder: 2,
    summary: 'SAP S/4HANA and Oracle EBS integration nodes.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'SAP S/4HANA',
        bullets: [
          'Read or post data via BAPI / RFC calls.',
          'Select a connection (configured by hub admin) and the RFC/BAPI name.',
          'Input fields map cStream/local/global values to RFC parameters.',
          'Output writes the RFC response to cStream, local, or global.',
        ],
      },
      {
        heading: 'Oracle EBS',
        bullets: [
          'Query tables or call stored procedures in Oracle EBS.',
          'SQL query mode or stored procedure mode — set in inspector.',
          'Bind parameters using FloExpressions.',
        ],
      },
    ],
  },
  {
    id: 'dev-nodes-hris-crm',
    slug: 'nodes-hris-crm',
    title: 'HRIS & CRM nodes — Workday, Salesforce',
    category: 'product',
    audience: 'all',
    group: 'designer-nodes',
    groupOrder: 3,
    summary: 'Workday and Salesforce integration nodes.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Workday',
        bullets: [
          'Fetch worker details, timesheets, payroll, or benefits.',
          'Requires a Workday connection configured by hub admin.',
          'Report name and query parameters set in inspector.',
        ],
      },
      {
        heading: 'Salesforce',
        bullets: [
          'Query, insert, update, or upsert Salesforce objects.',
          'Select object type and operation; map fields using FloExpressions.',
          'Supports bulk and single-record modes.',
        ],
      },
    ],
  },
  {
    id: 'dev-nodes-transform',
    slug: 'nodes-transform',
    title: 'Transform nodes — Mapper, Filter, Variable Store',
    category: 'product',
    audience: 'all',
    group: 'designer-nodes',
    groupOrder: 4,
    summary: 'Field Mapper, Value Filter, and Variable Store.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Field Mapper',
        bullets: [
          'Rename or remap keys in cStream using source → target pairs.',
          'Source: dot-path into cStream (e.g. user.firstName); target: new key name.',
          'Use expressions in source for computed values.',
        ],
      },
      {
        heading: 'Value Filter',
        bullets: [
          'Drop records from cStream that do not match a field condition.',
          'Condition is a FloExpression returning true/false.',
          'Non-matching records end that execution path (cStream becomes null).',
        ],
      },
      {
        heading: 'Variable Store',
        bullets: [
          'Read or write named variables in local or global scope.',
          'local.name — per-run; global.name — tenant-wide.',
          'Multi-row mode writes one variable per cStream record.',
        ],
      },
    ],
  },
  {
    id: 'dev-nodes-logic',
    slug: 'nodes-logic',
    title: 'Logic nodes — FloSwitch, Loop, Function, Template',
    category: 'product',
    audience: 'all',
    group: 'designer-nodes',
    groupOrder: 5,
    summary: 'Branching, looping, scripting, and templating nodes.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'FloSwitch',
        bullets: [
          'Route cStream to the first matching branch; falls through to defaultFlo if none match.',
          'Each branch has its own source handle — wire each to the appropriate next node.',
          'Conditions are FloExpressions evaluated top-to-bottom.',
        ],
      },
      {
        heading: 'Loop',
        bullets: [
          'loop handle — the repeating branch (wire Invoke SubFlo here).',
          'exit handle — continues main flow when loop finishes.',
          'continueExpr — evaluated in main scope, e.g. local.continue == true from SubFlo return args.',
          'executeAtLeastOnce — do-while vs while-first semantics.',
          'maxIterations — safety cap at runtime.',
        ],
      },
      {
        heading: 'Function',
        bullets: [
          'Run a sandboxed JS snippet server-side.',
          'Return an object to merge into cStream (or set output target to local/global).',
          'Has access to cStream, local, global, and floRunMeta.',
        ],
      },
      {
        heading: 'Template',
        bullets: [
          'Render JSON, XML, or CSV using {{path}} placeholders.',
          'Output goes to cStream or a local variable.',
        ],
      },
    ],
  },
  {
    id: 'dev-nodes-subflo',
    slug: 'subflo',
    title: 'SubFlo & Invoke SubFlo',
    category: 'product',
    audience: 'all',
    group: 'designer-nodes',
    groupOrder: 6,
    summary: 'Inline compartments, contracts, plugs inside SubFlo, and reuse patterns.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Concept',
        paragraphs: [
          'SubFlo is an inline subflow on the same canvas — not a separate flo file. It defines input/return arguments and a compartment of nodes.',
        ],
        bullets: [
          'SubFlo — contract node (display name, input args, return args, description).',
          'SubFlo Return — maps cStream/local values to return args; ends the invoke.',
          'Invoke SubFlo — on the main flow; binds inputs; returns become local.* on main.',
        ],
      },
      {
        heading: 'Plugs & FloActions inside SubFlo',
        paragraphs: ['Fully supported. Select the SubFlo node, then drag Plug or FloAction from the palette — they inherit the compartment tag.'],
      },
      {
        heading: 'Patterns & limits',
        bullets: [
          'Each compartment needs at least one SubFlo Return.',
          'Shared logic → extract a nested SubFlo and Invoke it from each path.',
          'No shared nodes across two SubFlos — each node has one subFloId.',
          'No criss-cross wires between compartments.',
        ],
        callout: {
          type: 'info',
          text: 'Main flow: Start → … → Invoke SubFlo → … → End. Compartment: SubFlo → internal nodes → SubFlo Return.',
        },
      },
    ],
  },
  {
    id: 'dev-nodes-connectors',
    slug: 'nodes-connectors',
    title: 'Plugs & FloActions on the canvas',
    category: 'product',
    audience: 'all',
    group: 'designer-nodes',
    groupOrder: 7,
    summary: 'Hub-configured plugs and connector actions as palette nodes.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Plugs',
        paragraphs: ['Plugs are created by hub admins and appear in the palette when enabled for the hub.'],
        bullets: [
          'Drag a plug onto the canvas → configure connection, URL tokens, field mappings.',
          'Email plugs (smtp_basic) — configure to/cc/bcc, subject, body.',
          'Output target — write response to cStream, local, or global.',
        ],
      },
      {
        heading: 'FloActions',
        bullets: [
          'FloActions are enabled by hub admins from FloKits + connector actions.',
          'Select connection and action template; map input/output fields in inspector.',
          'Input source and output target — cStream, local, or global.',
        ],
      },
    ],
  },
  {
    id: 'dev-expressions',
    slug: 'expressions',
    title: 'Expressions & scopes',
    category: 'product',
    audience: 'all',
    group: 'designer-nodes',
    groupOrder: 8,
    summary: 'cStream, local, global, floRunMeta, and FloExpression functions.',
    updatedAt: '2026-06-01',
    sections: [
      {
        paragraphs: [
          'FloExpressions are used in Mapper, Filter, FloSwitch, Template, plug fields, Function, and SubFlo bindings.',
        ],
        bullets: [
          'cStream.path — payload moving through the flow.',
          'local.name — per-run variables (Variable Store, node output, SubFlo returns).',
          'global.name — tenant-wide values (Start init vars, etc.).',
          'floRunMeta.runId, floRunMeta.floName, floRunMeta.userEmail — read-only run metadata.',
          'local.exception — available in error paths; holds the latest FloException object.',
        ],
      },
      {
        code: 'iif(local.status == "OK", cStream.amount, 0)',
      },
    ],
  },
];

// ─── Error Handling ──────────────────────────────────────────────────────────

const ERROR_HANDLING: DocPage[] = [
  {
    id: 'dev-error-handling',
    slug: 'error-handling',
    title: 'Error handling overview',
    category: 'product',
    audience: 'all',
    group: 'error-handling',
    groupOrder: 1,
    summary: 'Catch scopes, error path wiring, SubFlo propagation, and the global catch-all.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'How error propagation works',
        paragraphs: [
          'When an error occurs and is not caught locally, it propagates backward along the exact path the execution took — retracing every node that ran successfully — until a catcher is found or the error reaches the Start node (global catch-all).',
        ],
        callout: {
          type: 'info',
          text: 'The error handle (⚡ hex-shield icon on the right side of a node) is only shown when "Catch error" is enabled in the inspector. Wire it to any handler node.',
        },
      },
      {
        heading: 'Catch Scope options',
        bullets: [
          'None — this node does not catch errors (default). Errors pass through.',
          'Self — catches errors thrown by this node only.',
          'Subtree — catches errors thrown by this node AND any downstream node it rooted (recommended for SubFlos and global catch).',
          'Inherit — uses the Flo-wide default set on the Start node.',
        ],
      },
      {
        heading: 'Error path data source',
        bullets: [
          'cStream at catcher — use the cStream value at the catching node when the error occurred.',
          'cStream at error — use the cStream value at the node that actually threw the error.',
          'Local scope — use local variables at time of error.',
          'Global scope — use global variables.',
          'Inherit — uses the Flo-wide default from the Start node.',
        ],
        callout: {
          type: 'tip',
          text: 'local.exception always holds the latest FloException: { message, nodeId, nodeLabel, floId, timestamp, stack }.',
        },
      },
    ],
  },
  {
    id: 'dev-error-global-catch',
    slug: 'error-global-catch',
    title: 'Global catch-all (Start node)',
    category: 'product',
    audience: 'all',
    group: 'error-handling',
    groupOrder: 2,
    summary: 'Configuring the Start node as a flo-level safety net.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Setting up the global catch-all',
        bullets: [
          'Select the Start node → inspector → "Default catch" → set to "This node and below" (Subtree).',
          'The ⚡ hex-shield handle appears on the right side of the Start node.',
          'Wire the ⚡ handle to your error handler (e.g. an email notifier or logging node then End).',
          'Any error not caught by an inner node bubbles all the way up to Start.',
        ],
        callout: {
          type: 'warning',
          text: 'If no node catches the error (including Start with scope = None), the run terminates with an unhandled error status. Always wire the Start ⚡ handle as a safety net.',
        },
      },
      {
        heading: 'Execution Hub label',
        paragraphs: [
          'When the Start node catches an error, the Execution Hub visualizer shows it as "Flo Error Handler (Global Catch)" to make it immediately clear that the global safety net fired.',
        ],
      },
      {
        heading: 'Global catch flow diagram',
        flowDiagram: `  ┌──────────────────────────────────────┐
  │  Start  (Default catch: Subtree)     │
  └──────────────────────────────────────┘
        │                    │
        │ normal path   ⚡ error handle (global)
        ▼                    ▼
  ┌──────────┐        ┌─────────────────┐
  │  Node A  │        │  Global Error   │
  └──────────┘        │  Email / Log    │
        │              └─────────────────┘
        ▼                    │
  ┌──────────┐               ▼
  │  Node B  │             ┌─────┐
  └──────────┘             │ End │
        │                  └─────┘
        ▼
  ┌─────────┐
  │   End   │
  └─────────┘`,
      },
    ],
  },
  {
    id: 'dev-error-propagation',
    slug: 'error-propagation',
    title: 'Error propagation through SubFlos',
    category: 'product',
    audience: 'all',
    group: 'error-handling',
    groupOrder: 3,
    summary: 'How errors retrace the call stack across nested SubFlos.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'SubFlo call stack retracing',
        paragraphs: [
          'Errors propagate backward along the exact execution path — they retrace the SubFlo call stack just like a real call stack. An inner SubFlo error bubbles out to its Invoke SubFlo parent, then to that SubFlo\'s parent, and so on.',
        ],
        flowDiagram: `  Main Flo:
  Start ──▶ Invoke SF-A ──▶ Invoke SF-B ──▶ End

  Inside SubFlo A:
  SF-A ──▶ Invoke SF-B-inner ──▶ SF-A Return

  Inside SubFlo B-inner:
  SF-B ──▶ [CRASH] Workday Node

  Error retraces backward:
  Workday Node        (no catcher)
       ↑
  SF-B-inner          (no catcher)
       ↑
  Invoke SF-B-inner   (no catcher)
       ↑
  SF-A                (no catcher)
       ↑
  Invoke SF-A         ← ⚡ Catch: Subtree → routes to error handler`,
      },
      {
        heading: 'local.exception reference',
        code: `// Available in any error-path expression or function node
{
  message:   "SAP RFC call failed: table not found",
  nodeId:    "abc123",
  nodeLabel: "SAP Lookup",
  floId:     "flo_xyz",
  timestamp: "2026-06-01T10:30:00Z",
  stack:     "..."
}`,
      },
    ],
  },
];

// ─── Sample Flos ─────────────────────────────────────────────────────────────

const SAMPLE_FLOS: DocPage[] = [
  {
    id: 'dev-sample-basic',
    slug: 'sample-basic-flow',
    title: 'Sample — Basic integration flo',
    category: 'product',
    audience: 'all',
    group: 'sample-flows',
    groupOrder: 1,
    summary: 'A simple flo: fetch from SAP, map fields, send email.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Scenario',
        paragraphs: ['Fetch an invoice from SAP S/4HANA, map the fields, and email a PDF summary to the finance team.'],
      },
      {
        flowDiagram: `  ┌─────────┐   ┌─────────────┐   ┌──────────────┐   ┌────────────┐   ┌─────┐
  │  Start  │──▶│ SAP Lookup  │──▶│ Field Mapper │──▶│ Email Plug  │──▶│ End │
  └─────────┘   └─────────────┘   └──────────────┘   └────────────┘   └─────┘
                       │
                 ⚡ error handle (Catch: Self)
                       │
                ┌──────▼──────┐   ┌─────┐
                │  Email Err  │──▶│ End │
                └─────────────┘   └─────┘`,
      },
      {
        bullets: [
          'Start — no init vars needed for this flo.',
          'SAP Lookup — read invoice by cStream.invoiceId via BAPI.',
          'Field Mapper — rename BAPI keys to finance-friendly names.',
          'Email Plug — send mapped data as email body (template mode).',
          'Error on SAP Lookup → email the error details (local.exception.message) to the ops team.',
        ],
      },
    ],
  },
  {
    id: 'dev-sample-subflo',
    slug: 'sample-subflo',
    title: 'Sample — Reusable SubFlo pattern',
    category: 'product',
    audience: 'all',
    group: 'sample-flows',
    groupOrder: 2,
    summary: 'Extract shared logic into a SubFlo invoked from two branches.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Scenario',
        paragraphs: ['Both "new employee" and "contractor" paths need to sync to Salesforce. Extract the sync step as a SubFlo and invoke it from each branch.'],
      },
      {
        flowDiagram: `  ┌─────────┐   ┌─────────────┐
  │  Start  │──▶│  FloSwitch  │──▶ "employee" ──▶ Invoke SubFlo(Sync-SF) ──▶ End
  └─────────┘   └─────────────┘
                               └──▶ "contractor" ─▶ Invoke SubFlo(Sync-SF) ──▶ End

  SubFlo: Sync-SF
  ┌──────────┐   ┌──────────────┐   ┌───────────────┐
  │ Sync-SF  │──▶│ SF Upsert    │──▶│ Sync-SF Return│
  └──────────┘   └──────────────┘   └───────────────┘`,
      },
      {
        bullets: [
          'FloSwitch branches on cStream.type == "employee" vs "contractor".',
          'Both paths call Invoke SubFlo(Sync-SF) — same compartment, different input bindings.',
          'SubFlo Return maps SF response ID to return arg "sfId".',
          'After invoke, local.sfId is available on the main path.',
        ],
      },
    ],
  },
  {
    id: 'dev-sample-loop',
    slug: 'sample-loop',
    title: 'Sample — Loop with SubFlo body',
    category: 'product',
    audience: 'all',
    group: 'sample-flows',
    groupOrder: 3,
    summary: 'Process a list of records one-by-one using Loop + Invoke SubFlo.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Scenario',
        paragraphs: ['Process an array of orders from cStream, one per iteration, calling a SubFlo that calls the SAP API for each.'],
      },
      {
        flowDiagram: `  ┌─────────┐   ┌────────┐                    ┌─────┐
  │  Start  │──▶│  Loop  │── exit ────────────▶│ End │
  └─────────┘   └────────┘                    └─────┘
                     │
                   loop ──▶ Invoke SubFlo(Process-Order)
                                    │
                          local.continue = true/false
                                    │
                          (Loop reads continueExpr:
                           local.continue == true)

  SubFlo: Process-Order
  ┌──────────────────┐   ┌────────────┐   ┌────────────────────────────────┐
  │  Process-Order   │──▶│ SAP Post   │──▶│ Return (continue: true/false)  │
  └──────────────────┘   └────────────┘   └────────────────────────────────┘`,
      },
      {
        bullets: [
          'Loop → continueExpr: local.continue == true.',
          'SubFlo Process-Order posts one order to SAP and returns continue: true unless last record.',
          'executeAtLeastOnce: false (skip loop if list is empty).',
          'maxIterations: 500 (safety cap).',
        ],
      },
    ],
  },
  {
    id: 'dev-sample-error-global',
    slug: 'sample-error-global',
    title: 'Sample — Global catch-all with error email',
    category: 'product',
    audience: 'all',
    group: 'sample-flows',
    groupOrder: 4,
    summary: 'Wire the Start node as a global error handler; email the ops team on any failure.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Scenario',
        paragraphs: ['Any unhandled error anywhere in this flo should send an ops alert email with the error details, then end gracefully.'],
      },
      {
        flowDiagram: `  ┌───────────────────────────────────────────────────┐
  │  Start  (Inspector: Default catch = Subtree)      │
  └───────────────────────────────────────────────────┘
        │                            │
        │ normal path          ⚡ error handle
        ▼                            ▼
  ┌──────────────┐          ┌─────────────────────────┐
  │  … flo …     │          │  Template: error email   │
  └──────────────┘          │  body = local.exception  │
        │                    └─────────────────────────┘
        ▼                            │
  ┌─────────┐                        ▼
  │   End   │               ┌─────────────────┐   ┌─────┐
  └─────────┘               │  Email Plug     │──▶│ End │
                             └─────────────────┘   └─────┘`,
      },
      {
        bullets: [
          'Start: Default catch = Subtree, Default data source = cStream at error.',
          'Template node body: "Error in {{floRunMeta.floName}}: {{local.exception.message}}".',
          'Email Plug: send to ops@company.com.',
          'Execution Hub shows Start as "Flo Error Handler (Global Catch)" when this fires.',
        ],
      },
    ],
  },
];

// ─── Run & Test ───────────────────────────────────────────────────────────────

const RUN_TEST: DocPage[] = [
  {
    id: 'dev-run-test',
    slug: 'run-and-test',
    title: 'Run & test',
    category: 'product',
    audience: 'all',
    group: 'run-and-test',
    groupOrder: 1,
    summary: 'Full flow runs, per-node test, and execution hub.',
    updatedAt: '2026-06-01',
    sections: [
      {
        heading: 'Full flow run',
        bullets: [
          'Click ▶ Run — provide test JSON as Start cStream input.',
          'Runs against the current draft in test mode.',
          'Publish for production/webhooks/scheduler.',
          'Review logs in Last run panel and FloExecution Hub.',
        ],
      },
      {
        heading: 'Test Node',
        bullets: [
          'Select a node → set Test input (JSON) → Test Node.',
          'Executes upstream subgraph into that node only.',
          'Plugs/connectors/FloActions may have dedicated test actions.',
        ],
      },
      {
        heading: 'Execution Hub',
        bullets: [
          'Full visual replay of any run — which nodes executed, status, duration.',
          'Error paths shown in red; caught errors labelled with catcher node.',
          'Start node shown as "Flo Error Handler (Global Catch)" when it catches.',
        ],
      },
    ],
  },
  {
    id: 'dev-validation',
    slug: 'validation',
    title: 'Validation & publish',
    category: 'product',
    audience: 'all',
    group: 'run-and-test',
    groupOrder: 2,
    summary: 'Graph validation, errors vs warnings, and publish gates.',
    updatedAt: '2026-06-01',
    sections: [
      {
        bullets: [
          'Validation runs continuously; errors block publish.',
          'Click validation alerts to focus the node on canvas.',
          'Common issues: disconnected nodes, missing SubFlo Return, cross-compartment edges, required plug fields.',
        ],
      },
    ],
  },
];

// ─── Export ───────────────────────────────────────────────────────────────────

export const DEVELOPER_PAGES: DocPage[] = [
  ...GETTING_STARTED,
  ...WORKSPACES_FLOS,
  ...DESIGNER_NODES,
  ...ERROR_HANDLING,
  ...SAMPLE_FLOS,
  ...RUN_TEST,
];

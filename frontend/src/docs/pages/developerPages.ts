import type { DocPage } from '../types';

export const DEVELOPER_PAGES: DocPage[] = [
  {
    id: 'dev-getting-started',
    slug: 'getting-started',
    title: 'Getting started',
    category: 'product',
    audience: 'all',
    summary: 'Workspaces, flos, draft vs publish, and the designer layout.',
    updatedAt: '2026-05-22',
    sections: [
      {
        heading: 'Designer layout',
        paragraphs: [
          'The FloPlug designer has three main areas: the node palette (left), the canvas (center), and the inspector (right).',
          'Select a node to configure it. With nothing selected, the inspector shows Quick help topics.',
        ],
        bullets: [
          'Workspace — a folder for related integration flos.',
          'Flo — one integration flow (draft graph + optional published version).',
          'Save — writes the draft; Publish — promotes draft to production/webhooks.',
        ],
      },
      {
        callout: {
          type: 'tip',
          text: 'Canvas or palette issues? Open Hub configuration to see what your admin enabled, then compare with Product help → Using the Hub Admin portal.',
        },
      },
      {
        callout: {
          type: 'info',
          text: 'Profile → Product help (features & how-to) · Hub configuration (live catalog of plugs, connections, FloActions on this hub).',
        },
      },
    ],
  },
  {
    id: 'dev-canvas',
    slug: 'canvas-and-nodes',
    title: 'Canvas & nodes',
    category: 'product',
    audience: 'all',
    summary: 'Resize, delete, wiring rules, and unified node chrome.',
    updatedAt: '2026-05-22',
    sections: [
      {
        heading: 'Node controls',
        bullets: [
          'Select a node — resize handles appear on corners and edges.',
          'Delete — × button when selected (Start/End cannot be deleted).',
          'Canvas display name — label on the node card; set in the inspector.',
          'One outgoing wire per source handle; many nodes may connect into one target.',
        ],
      },
      {
        heading: 'Wiring',
        bullets: [
          'FloSwitch — each branch is a separate source handle; wire defaultFlo for no match.',
          'Drag edges to rewire; click × on an edge to remove it.',
          'SubFlo compartments cannot cross boundaries — use Invoke SubFlo (see SubFlo guide).',
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
    summary: 'cStream, local, global, floRunMeta, and FloExpression functions.',
    updatedAt: '2026-05-22',
    sections: [
      {
        paragraphs: [
          'Use FloExpressions in Mapper, Filter, FloSwitch, Template, plug fields, and SubFlo bindings.',
        ],
        bullets: [
          'cStream.path — payload moving through the flow',
          'local.name — per-run variables (Variable Store, node output, SubFlo returns)',
          'global.name — tenant-wide values (Start init vars, etc.)',
          'floRunMeta.runId, floRunMeta.floName, floRunMeta.userEmail — read-only run metadata',
        ],
      },
      {
        code: 'iif(local.status == "OK", cStream.amount, 0)',
      },
    ],
  },
  {
    id: 'dev-subflo',
    slug: 'subflo',
    title: 'SubFlo & Invoke SubFlo',
    category: 'product',
    audience: 'all',
    summary: 'Inline compartments, contracts, plugs inside SubFlo, and reuse patterns.',
    updatedAt: '2026-05-22',
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
          'Shared logic (e.g. same email step) → extract a nested SubFlo and Invoke it from each path.',
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
    id: 'dev-loop',
    slug: 'loop',
    title: 'Loop node',
    category: 'product',
    audience: 'all',
    summary: 'Loop path, exit path, continueExpr, and InvokeSubFlo on the loop body.',
    updatedAt: '2026-05-22',
    sections: [
      {
        bullets: [
          'loop handle — wire the repeating branch (often Invoke SubFlo).',
          'exit handle — continues main flow when the loop finishes.',
          'continueExpr — evaluated in main scope, e.g. local.continue == true from SubFlo return args.',
          'executeAtLeastOnce — do-while vs while-first semantics.',
          'maxIterations — safety cap at runtime.',
        ],
      },
    ],
  },
  {
    id: 'dev-run-test',
    slug: 'run-and-test',
    title: 'Run & test',
    category: 'product',
    audience: 'all',
    summary: 'Full flow runs, per-node test, and execution hub.',
    updatedAt: '2026-05-22',
    sections: [
      {
        heading: 'Full flow run',
        bullets: [
          'Click ▶ Run — provide test JSON as Start cStream input.',
          'Runs in test mode on drafts; publish for production/webhooks.',
          'Review logs in Last run and FloExecution Hub.',
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
    ],
  },
  {
    id: 'dev-validation',
    slug: 'validation',
    title: 'Validation & publish',
    category: 'product',
    audience: 'all',
    summary: 'Graph validation, errors vs warnings, and publish gates.',
    updatedAt: '2026-05-22',
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
  {
    id: 'dev-plugs-canvas',
    slug: 'plugs-on-canvas',
    title: 'Plugs on the canvas',
    category: 'product',
    audience: 'all',
    summary: 'Using hub-configured plugs as canvas nodes.',
    updatedAt: '2026-05-22',
    sections: [
      {
        paragraphs: [
          'Plugs are created by hub admins and appear in your palette when enabled for the hub.',
        ],
        bullets: [
          'Drag a plug onto the canvas — configure connection, URL tokens, and field mappings in the inspector.',
          'Email plugs (smtp_basic) — configure to/cc/bcc, subject, body with static or expression sources.',
          'Output target — write response to cStream, local, or global.',
        ],
      },
    ],
  },
  {
    id: 'dev-floactions-canvas',
    slug: 'floactions-on-canvas',
    title: 'FloActions on the canvas',
    category: 'product',
    audience: 'all',
    summary: 'Connector API calls with semantic field mapping.',
    updatedAt: '2026-05-22',
    sections: [
      {
        bullets: [
          'FloActions are enabled by hub admins from FloKits + connector actions.',
          'Select connection and action template; map input/output fields in the inspector.',
          'Input source — cStream, local, or global; output target — same options.',
        ],
      },
    ],
  },
];

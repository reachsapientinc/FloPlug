import React from 'react';
import type { DocCallout, DocSection } from '../types';

const CALLOUT_STYLE: Record<DocCallout['type'], { bg: string; border: string; icon: string }> = {
  info:    { bg: '#EBF2FF', border: '#BFDBFE', icon: 'ℹ️' },
  tip:     { bg: '#ECFDF5', border: '#A7F3D0', icon: '💡' },
  warning: { bg: '#FFFBEB', border: '#FDE68A', icon: '⚠️' },
};

export const DocContentRenderer: React.FC<{ sections: DocSection[] }> = ({ sections }) => (
  <div className="fp-doc-content">
    {sections.map((sec, i) => (
      <section key={i} className="fp-doc-section">
        {sec.heading && <h2>{sec.heading}</h2>}
        {sec.paragraphs?.map((p, j) => (
          <p key={j}>{p}</p>
        ))}
        {sec.bullets && sec.bullets.length > 0 && (
          <ul>
            {sec.bullets.map((b, j) => (
              <li key={j}>{b}</li>
            ))}
          </ul>
        )}
        {sec.code && (
          <pre className="fp-doc-code"><code>{sec.code}</code></pre>
        )}
        {sec.flowDiagram && (
          <pre style={{
            background: '#0a0f1a',
            border: '1px solid #0d9488',
            borderRadius: 8,
            padding: '14px 18px',
            fontFamily: '"Fira Mono", "Cascadia Code", monospace',
            fontSize: 11,
            color: '#5eead4',
            lineHeight: 1.7,
            overflowX: 'auto',
            margin: '10px 0',
            boxShadow: '0 0 18px rgba(13,148,136,0.15)',
          }}><code style={{ color: '#5eead4' }}>{sec.flowDiagram}</code></pre>
        )}
        {sec.callout && (
          <div
            className="fp-doc-callout"
            style={{
              background: CALLOUT_STYLE[sec.callout.type].bg,
              borderColor: CALLOUT_STYLE[sec.callout.type].border,
            }}
          >
            <span aria-hidden>{CALLOUT_STYLE[sec.callout.type].icon}</span>
            <span>{sec.callout.text}</span>
          </div>
        )}
      </section>
    ))}
  </div>
);

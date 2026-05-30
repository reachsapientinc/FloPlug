import React from 'react';
import { useTheme } from '../theme/ThemeContext';
import { Field, TextArea, Help } from './ui';
import { DEFAULT_NODE_TEST_INPUT } from './nodeTestPayload';

export const NodeTestInput: React.FC<{
  value:    string;
  onChange: (json: string) => void;
  hint?:    string;
}> = ({ value, onChange, hint }) => {
  const t = useTheme();
  return (
    <Field label="Test input (JSON → cStream)">
      <TextArea
        rows={5}
        value={value || DEFAULT_NODE_TEST_INPUT}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
        style={{ color: t.inputText, background: t.codeBg, fontFamily: 'monospace', fontSize: 9 }}
      />
      <Help>
        {hint ?? (
          <>
            Simulates the payload this node receives. Use a <code style={{ fontFamily: 'monospace' }}>message</code> field
            for HTTP/SOAP bodies (same shape as a full flow run).
          </>
        )}
      </Help>
    </Field>
  );
};

/** @deprecated Use NodeTestInput */
export const PlugTestInput = NodeTestInput;

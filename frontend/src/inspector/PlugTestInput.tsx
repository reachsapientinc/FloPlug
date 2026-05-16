import React from 'react';
import { useTheme } from '../theme/ThemeContext';
import { Field, TextArea, Help } from './ui';
import { DEFAULT_PLUG_TEST_INPUT } from './plugTest';

export const PlugTestInput: React.FC<{
  value:    string;
  onChange: (json: string) => void;
}> = ({ value, onChange }) => {
  const t = useTheme();
  return (
    <Field label="Test input (JSON → cStream)">
      <TextArea
        rows={6}
        value={value || DEFAULT_PLUG_TEST_INPUT}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
        style={{ color: t.inputText, background: t.codeBg, fontFamily: 'monospace', fontSize: 9 }}
      />
      <Help>
        Body and URL variables resolve from this payload. Use a <code style={{ fontFamily: 'monospace' }}>message</code> field
        for the HTTP body (same as a full flow run).
      </Help>
    </Field>
  );
};

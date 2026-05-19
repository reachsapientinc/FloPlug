import React from 'react';
import { useTheme } from '../theme/ThemeContext';
import { Field, Sel, Inp, Help } from './ui';

interface Props {
  outputTarget:  string;
  outputVarName: string;
  onChange:      (patch: { outputTarget?: string; outputVarName?: string }) => void;
}

export const OutputTargetSection: React.FC<Props> = ({
  outputTarget, outputVarName, onChange,
}) => {
  const t = useTheme();
  const needsVar = outputTarget === 'local' || outputTarget === 'global';

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${t.panelBorder}` }}>
      <Field label="Output target">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Sel
            value={outputTarget}
            onChange={e => onChange({ outputTarget: e.target.value, outputVarName: '' })}
            style={{ flex: needsVar ? '0 0 auto' : undefined }}
          >
            <option value="cStream">→ cStream (overwrite)</option>
            <option value="local">→ local variable</option>
            <option value="global">→ global variable</option>
          </Sel>
          {needsVar && (
            <Inp
              value={outputVarName}
              placeholder={`${outputTarget} var name`}
              onChange={e => onChange({ outputVarName: e.target.value })}
             // style={{ flex: 1 }}
            />
          )}
        </div>
        <Help>
          {outputTarget === 'cStream'
            ? "Result becomes the next node's input."
            : `cStream unchanged. Use ${outputTarget}.${outputVarName || '…'} downstream.`}
        </Help>
      </Field>
    </div>
  );
};

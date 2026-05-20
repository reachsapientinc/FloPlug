import React from 'react';
import { ACTION_INPUT_CONTENT_TYPES } from '@floplug/shared';
import { useTheme } from '../theme/ThemeContext';
import { Field, Sel, Inp, Help } from './ui';

interface Props {
  inputSource:       string;
  inputVarName:      string;
  inputContentType:  string;
  onChange:          (patch: {
    inputSource?:       string;
    inputVarName?:      string;
    inputContentType?:  string;
  }) => void;
}

export const InputSourceSection: React.FC<Props> = ({
  inputSource, inputVarName, inputContentType, onChange,
}) => {
  const t = useTheme();
  const needsVar = inputSource === 'local' || inputSource === 'global';

  return (
    <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `0.5px solid ${t.panelBorder}` }}>
      <Field label="Input source">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Sel
            value={inputSource}
            onChange={e => onChange({ inputSource: e.target.value, inputVarName: '' })}
          >
            <option value="cStream">← cStream (upstream wire)</option>
            <option value="local">← local variable</option>
            <option value="global">← global variable</option>
          </Sel>
          {needsVar && (
            <Inp
              value={inputVarName}
              placeholder={`${inputSource} var name`}
              onChange={e => onChange({ inputVarName: e.target.value })}
            />
          )}
          <Sel
            value={inputContentType}
            onChange={e => onChange({ inputContentType: e.target.value })}
            title="Content type"
          >
            {ACTION_INPUT_CONTENT_TYPES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Sel>
        </div>
        <Help>
          {inputSource === 'cStream'
            ? 'Request body is built from the incoming cStream payload.'
            : `Read ${inputSource}.${inputVarName || '…'} and parse as ${ACTION_INPUT_CONTENT_TYPES.find(c => c.value === inputContentType)?.label ?? 'selected format'}.`}
          {' '}Content type applies when the engine builds the request (phase 2).
        </Help>
      </Field>
    </div>
  );
};

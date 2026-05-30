import React from 'react';
import { CopyButton } from './CopyButton';

export interface CodeBlockWithCopyProps {
  title: string;
  content: string;
  maxHeight?: number | string;
  className?: string;
}

export const CodeBlockWithCopy: React.FC<CodeBlockWithCopyProps> = ({
  title,
  content,
  maxHeight = 280,
  className = '',
}) => (
  <div className={`code-block-wrap${className ? ` ${className}` : ''}`}>
    <div className="code-block-head">
      <span className="code-block-title">{title}</span>
      <CopyButton text={content} label={`Copy ${title}`} />
    </div>
    <pre
      className="code-block-pre"
      style={{ maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}
    >
      {content}
    </pre>
  </div>
);

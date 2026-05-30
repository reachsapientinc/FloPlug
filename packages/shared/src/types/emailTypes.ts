/**
 * emailTypes.ts
 * Types for emailNode configuration — used by both engine and designer.
 */

export type EmailValueSource  = 'static' | 'cStream' | 'local' | 'global' | 'expression';
export type EmailContentType  = 'text' | 'html';
export type EmailBodyMode     = 'inline' | 'attachment';

export interface EmailValueBinding {
  source: EmailValueSource;
  value:  string;   // static text OR dot-path for cStream/local/global
}

export interface EmailNodeConfig {
  plugId:           string;                // references the EmailPlug doc
  to:               EmailValueBinding;     // required — comma-sep addresses ok
  cc?:              EmailValueBinding;     // optional
  bcc?:             EmailValueBinding;     // optional
  subject:          EmailValueBinding;
  body:             EmailValueBinding;     // prepared content — use templateNode upstream
  contentType:      EmailContentType;      // 'text' | 'html'
  bodyMode:         EmailBodyMode;         // 'inline' | 'attachment'
  attachmentName?:  EmailValueBinding;     // filename — only used when bodyMode=attachment
}
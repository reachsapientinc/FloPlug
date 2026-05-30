/**
 * emailTypes.ts
 * Types for emailNode configuration — used by both engine and designer.
 */
export type EmailValueSource = 'static' | 'cStream' | 'local' | 'global' | 'expression';
export type EmailContentType = 'text' | 'html';
export type EmailBodyMode = 'inline' | 'attachment';
export interface EmailValueBinding {
    source: EmailValueSource;
    value: string;
}
export interface EmailNodeConfig {
    plugId: string;
    to: EmailValueBinding;
    cc?: EmailValueBinding;
    bcc?: EmailValueBinding;
    subject: EmailValueBinding;
    body: EmailValueBinding;
    contentType: EmailContentType;
    bodyMode: EmailBodyMode;
    attachmentName?: EmailValueBinding;
}

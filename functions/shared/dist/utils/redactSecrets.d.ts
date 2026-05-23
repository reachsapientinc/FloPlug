/** Redact sensitive header / credential values before persisting execution traces. */
export declare function redactSecretHeaders(headers: Record<string, string>): Record<string, string>;
/** Mask password-like fields in credential objects (for debug attachments). */
export declare function redactCredentialFields(creds: Record<string, string> | undefined): Record<string, string> | undefined;

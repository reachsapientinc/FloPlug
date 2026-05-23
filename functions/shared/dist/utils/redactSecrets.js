/** Redact sensitive header / credential values before persisting execution traces. */
export function redactSecretHeaders(headers) {
    const out = {};
    for (const [k, v] of Object.entries(headers)) {
        const lk = k.toLowerCase();
        if (lk === 'authorization'
            || lk.includes('token')
            || lk.includes('secret')
            || lk.includes('password')
            || lk === 'cookie') {
            out[k] = '[redacted]';
        }
        else {
            out[k] = v;
        }
    }
    return out;
}
/** Mask password-like fields in credential objects (for debug attachments). */
export function redactCredentialFields(creds) {
    if (!creds)
        return undefined;
    const out = {};
    for (const [k, v] of Object.entries(creds)) {
        const lk = k.toLowerCase();
        out[k] = (lk.includes('password') || lk.includes('secret') || lk.includes('token'))
            ? '[redacted]'
            : v;
    }
    return out;
}

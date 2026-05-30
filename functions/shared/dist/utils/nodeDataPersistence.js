/**
 * Per-node Execution Hub persistence — default none (no storage).
 */
export const DEFAULT_NODE_DATA_PERSISTENCE = { mode: 'none' };
export function parseNodeDataPersistence(data) {
    const raw = data?.dataPersistence;
    if (!raw || raw.mode === 'none' || !raw.mode) {
        return DEFAULT_NODE_DATA_PERSISTENCE;
    }
    return {
        mode: 'selective',
        inputScopes: raw.inputScopes?.length ? raw.inputScopes : ['cStream'],
        outputScopes: raw.outputScopes?.length ? raw.outputScopes : ['cStream'],
        inputPaths: raw.inputPaths ?? '',
        outputPaths: raw.outputPaths ?? '',
    };
}
function getByPath(obj, path) {
    const p = path.trim();
    if (!p)
        return undefined;
    const parts = p.split('.');
    let cur = obj;
    for (const part of parts) {
        if (cur === null || cur === undefined || typeof cur !== 'object')
            return undefined;
        cur = cur[part];
    }
    return cur;
}
function setByPath(out, path, value) {
    const parts = path.split('.').filter(Boolean);
    if (parts.length === 0)
        return;
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!(key in cur) || typeof cur[key] !== 'object' || cur[key] === null) {
            cur[key] = {};
        }
        cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
}
function parsePathList(raw) {
    return (raw ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}
function pickScopes(scopes, pathsRaw, sources) {
    if (!scopes?.length)
        return undefined;
    const out = {};
    const pathList = parsePathList(pathsRaw);
    for (const scope of scopes) {
        if (scope === 'cStream' && sources.cStream) {
            out.cStream = sources.cStream;
        }
        else if (scope === 'local' && sources.local) {
            out.local = sources.local;
        }
        else if (scope === 'global' && sources.global) {
            out.global = sources.global;
        }
        else if (scope === 'selective' && pathList.length > 0) {
            const selective = {};
            for (const path of pathList) {
                const root = path.split('.')[0];
                let source;
                if (root === 'cStream')
                    source = sources.cStream;
                else if (root === 'local')
                    source = sources.local;
                else if (root === 'global')
                    source = sources.global;
                else
                    source = sources.cStream;
                const subPath = root === 'cStream' || root === 'local' || root === 'global'
                    ? path.slice(root.length + 1)
                    : path;
                const val = subPath ? getByPath(source, subPath) : source;
                if (val !== undefined)
                    setByPath(selective, path, val);
            }
            if (Object.keys(selective).length > 0)
                out.selective = selective;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
/** Returns undefined when nothing should be stored for this segment. */
export function buildPersistedInputSnapshot(input) {
    if (input.config.mode !== 'selective')
        return undefined;
    return pickScopes(input.config.inputScopes, input.config.inputPaths, {
        cStream: input.cStream,
        local: input.local,
        global: input.global,
    });
}
export function buildPersistedOutputSnapshot(input) {
    if (input.config.mode !== 'selective')
        return undefined;
    const base = pickScopes(input.config.outputScopes, input.config.outputPaths, {
        cStream: input.cStream,
        local: input.local,
        global: input.global,
    });
    if (!base)
        return undefined;
    if (!input.stripRemoteTrace && input.httpTrace) {
        return { ...base, httpTrace: input.httpTrace };
    }
    return base;
}
export function shouldPersistNodeExecution(config) {
    return config.mode === 'selective';
}

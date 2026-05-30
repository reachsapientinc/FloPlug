/**
 * Conditional required fields — optional XSD branches (minOccurs=0) only enforce
 * children when that branch is mapped. Required leaves under an inactive optional
 * ancestor (e.g. Primary_Image_Data) are not enforced.
 */
function ancestorPrefixes(path) {
    const parts = path.split('.');
    const out = [];
    for (let i = 1; i < parts.length; i++) {
        out.push(parts.slice(0, i).join('.'));
    }
    return out;
}
function fieldOptional(f) {
    if (!f)
        return false;
    const mo = f.minOccurs;
    if (mo === '0' || mo === 0)
        return true;
    if (f.xsdType === 'object' && !f.required)
        return true;
    if (!f.required)
        return true;
    return false;
}
/** True when any mapped value or rule exists at or below prefix. */
export function isMappingBranchActivated(prefix, resolved, mappingRules = []) {
    if (prefix in resolved && resolved[prefix] !== undefined && resolved[prefix] !== null) {
        return true;
    }
    const dot = `${prefix}.`;
    if (Object.keys(resolved).some(k => k.startsWith(dot)))
        return true;
    return mappingRules.some(r => {
        const t = r.targetField ?? '';
        return t === prefix || t.startsWith(dot);
    });
}
function schemaByPath(inputSchema) {
    return new Map(inputSchema.map(f => [f.path, f]));
}
/** Paths of optional containers (minOccurs=0 / optional object) from flatten + optionalAncestorPaths on leaves. */
export function buildOptionalContainerPaths(inputSchema) {
    const paths = new Set();
    for (const f of inputSchema) {
        if (fieldOptional(f) && (f.xsdType === 'object' || f.minOccurs === '0' || f.minOccurs === 0)) {
            paths.add(f.path);
        }
        for (const p of f.optionalAncestorPaths ?? []) {
            paths.add(p);
        }
    }
    return paths;
}
/**
 * Infer optional container when flatten index has no object row (legacy cache) but
 * nested fields exist and no required direct child at this prefix.
 */
export function isImplicitOptionalContainer(prefix, inputSchema) {
    const byPath = schemaByPath(inputSchema);
    const exact = byPath.get(prefix);
    if (exact && fieldOptional(exact))
        return true;
    if (exact?.required === true && !fieldOptional(exact))
        return false;
    const nested = inputSchema.filter(f => f.path.startsWith(`${prefix}.`));
    if (nested.length === 0)
        return false;
    const childPrefixes = new Set();
    for (const f of nested) {
        const rest = f.path.slice(prefix.length + 1);
        const seg = rest.split('.')[0];
        if (seg)
            childPrefixes.add(`${prefix}.${seg}`);
    }
    for (const cp of childPrefixes) {
        const child = byPath.get(cp);
        if (child && fieldOptional(child))
            return true;
    }
    if (!exact) {
        const hasRequiredDirectChild = nested.some(f => {
            const rest = f.path.slice(prefix.length + 1);
            return rest.split('.').length === 1 && f.required && !fieldOptional(f);
        });
        return !hasRequiredDirectChild;
    }
    return false;
}
function isOptionalContainerPrefix(prefix, inputSchema, optionalPaths) {
    if (optionalPaths.has(prefix))
        return true;
    return isImplicitOptionalContainer(prefix, inputSchema);
}
/**
 * Required only when marked required AND every optional ancestor branch is activated.
 * Local minOccurs=1 on Filename does not matter if Primary_Image_Data (0..1) is omitted.
 */
export function isFieldEffectivelyRequired(field, inputSchema, resolved, mappingRules = []) {
    if (!field.required)
        return false;
    const optionalPaths = buildOptionalContainerPaths(inputSchema);
    for (const p of field.optionalAncestorPaths ?? []) {
        if (optionalPaths.has(p) || isImplicitOptionalContainer(p, inputSchema)) {
            if (!isMappingBranchActivated(p, resolved, mappingRules))
                return false;
        }
    }
    for (const prefix of ancestorPrefixes(field.path)) {
        if (isOptionalContainerPrefix(prefix, inputSchema, optionalPaths)
            && !isMappingBranchActivated(prefix, resolved, mappingRules)) {
            return false;
        }
    }
    return true;
}
export function listUnmappedRequiredFields(inputSchema, resolved, mappingRules = []) {
    const out = [];
    for (const field of inputSchema) {
        const hasValue = field.path in resolved
            && resolved[field.path] !== undefined
            && resolved[field.path] !== null;
        if (!hasValue && isFieldEffectivelyRequired(field, inputSchema, resolved, mappingRules)) {
            out.push(field.path);
        }
    }
    return out;
}

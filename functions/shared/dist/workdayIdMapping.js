/**
 * Workday reference ID mapping — one mappable target per (reference + wd:type + value).
 * Enables multiple <wd:ID wd:type="…">…</wd:ID> under the same *Reference element.
 */
/** Composite target path: …Reference.ID#Customer_ID */
export const WORKDAY_ID_COMPOSITE_SEP = '#';
const COMPOSITE_HASH_RE = /^(.+\.ID)#([A-Za-z0-9_]+)$/;
const COMPOSITE_ATYPE_RE = /^(.+\.ID)\.@type\.([A-Za-z0-9_]+)$/;
export function buildWorkdayIdCompositePath(idPath, typeToken) {
    return `${idPath}${WORKDAY_ID_COMPOSITE_SEP}${typeToken}`;
}
export function parseWorkdayIdCompositePath(path) {
    const m = path.match(COMPOSITE_HASH_RE) ?? path.match(COMPOSITE_ATYPE_RE);
    if (!m)
        return null;
    const idPath = m[1];
    const typeToken = m[2];
    const referencePath = idPath.replace(/\.ID$/i, '');
    return {
        compositePath: path,
        referencePath,
        idPath,
        typeToken,
    };
}
export function isWorkdayIdCompositePath(path) {
    return COMPOSITE_HASH_RE.test(path) || COMPOSITE_ATYPE_RE.test(path);
}

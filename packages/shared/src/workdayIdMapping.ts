/**
 * Workday reference ID mapping — one mappable target per (reference + wd:type + value).
 * Enables multiple <wd:ID wd:type="…">…</wd:ID> under the same *Reference element.
 */

/** Composite target path: …Reference.ID#Customer_ID */
export const WORKDAY_ID_COMPOSITE_SEP = '#';

export interface WorkdayIdCompositePath {
  /** Full rule target path (includes request root). */
  compositePath: string;
  /** Path to the reference element (parent of ID). */
  referencePath: string;
  /** Path to the ID element (before #). */
  idPath:        string;
  /** wd:type token (suffix after # or leaf after .@type.). */
  typeToken:     string;
}

const COMPOSITE_HASH_RE  = /^(.+\.ID)#([A-Za-z0-9_]+)$/;
const COMPOSITE_ATYPE_RE = /^(.+\.ID)\.@type\.([A-Za-z0-9_]+)$/;

export function buildWorkdayIdCompositePath(idPath: string, typeToken: string): string {
  return `${idPath}${WORKDAY_ID_COMPOSITE_SEP}${typeToken}`;
}

export function parseWorkdayIdCompositePath(path: string): WorkdayIdCompositePath | null {
  const m = path.match(COMPOSITE_HASH_RE) ?? path.match(COMPOSITE_ATYPE_RE);
  if (!m) return null;
  const idPath    = m[1];
  const typeToken = m[2];
  const referencePath = idPath.replace(/\.ID$/i, '');
  return {
    compositePath: path,
    referencePath,
    idPath,
    typeToken,
  };
}

export function isWorkdayIdCompositePath(path: string): boolean {
  return COMPOSITE_HASH_RE.test(path) || COMPOSITE_ATYPE_RE.test(path);
}

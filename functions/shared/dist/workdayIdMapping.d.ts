/**
 * Workday reference ID mapping — one mappable target per (reference + wd:type + value).
 * Enables multiple <wd:ID wd:type="…">…</wd:ID> under the same *Reference element.
 */
/** Composite target path: …Reference.ID#Customer_ID */
export declare const WORKDAY_ID_COMPOSITE_SEP = "#";
export interface WorkdayIdCompositePath {
    /** Full rule target path (includes request root). */
    compositePath: string;
    /** Path to the reference element (parent of ID). */
    referencePath: string;
    /** Path to the ID element (before #). */
    idPath: string;
    /** wd:type token (suffix after # or leaf after .@type.). */
    typeToken: string;
}
export declare function buildWorkdayIdCompositePath(idPath: string, typeToken: string): string;
export declare function parseWorkdayIdCompositePath(path: string): WorkdayIdCompositePath | null;
export declare function isWorkdayIdCompositePath(path: string): boolean;

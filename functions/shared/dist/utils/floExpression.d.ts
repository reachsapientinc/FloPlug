/**
 * FILE: functions/src/utils/floExpression.ts
 *
 * Reusable expression engine for FloPlug mapper, filter, template and other nodes.
 *
 * Supports:
 *  ─ Path references      : cStream.name, local.count, global.config.host, floRunMeta.runId
 *  ─ String literals      : 'hello', "world"
 *  ─ Number literals      : 42, 3.14, -7
 *  ─ Boolean literals     : true, false
 *  ─ Arithmetic           : +  -  *  /  %
 *  ─ Comparison           : ==  !=  <  <=  >  >=
 *  ─ Logical              : AND  OR  NOT  (also &&  ||  !)
 *  ─ Grouping             : (expr)
 *  ─ Function calls       : fn(arg1, arg2, …)  — fully nestable
 *
 * String functions:
 *   replace(src, from, to)            First occurrence
 *   replaceAll(src, from, to)         All occurrences
 *   replaceN(src, from, to, n)        First n occurrences
 *   trim(src)                         Both sides
 *   trim(src, 'l')                    Left only
 *   trim(src, 'r')                    Right only
 *   length(src)                       String or array length
 *   pad(src, size)                    Right-pad with spaces
 *   pad(src, size, char)              Right-pad with char
 *   pad(src, size, char, 'l')         Left-pad
 *   substring(src, start)
 *   substring(src, start, end)
 *   indexOf(src, search)
 *   indexOf(src, search, from)
 *   concat(a, b, …)                   Any number of args
 *   upper(src)
 *   lower(src)
 *   toStr(src)
 *   split(src, delim)                 Returns array
 *   split(src, delim, index)          Returns element at index
 *
 * Number / conversion functions:
 *   toNumber(src)
 *   toDate(src)                       Returns ISO string from any parseable value
 *   format(src, pattern)              Number: '0.00' | Date: 'YYYY-MM-DD' etc.
 *   round(src, decimals?)
 *   abs(src)
 *   floor(src)
 *   ceil(src)
 *
 * Existence / logic functions:
 *   exists(src)                       true if not null/undefined/''
 *   not(expr)
 *   and(a, b)
 *   or(a, b)
 *   coalesce(a, b, …)                 First non-null/undefined value
 *   iif(condition, ifTrue, ifFalse)   Inline if
 *
 * Usage from mapperNode:
 *   import { evalExpression, EvalContext } from '../utils/floExpression.js';
 *
 *   const ctx: EvalContext = { cStream: item, local: store.local, global: store.global };
 *   const result = evalExpression('substring(cStream.name, 0, length(cStream.name)-3)', ctx);
 */
export interface EvalContext {
    /** The current cStream payload (the item being mapped) */
    cStream: Record<string, unknown>;
    /** Local variable store */
    local?: Record<string, unknown>;
    /** Global variable store */
    global?: Record<string, unknown>;
    /** Any additional named scopes */
    [scope: string]: Record<string, unknown> | undefined;
}
export type FloValue = string | number | boolean | null | undefined | unknown[] | Record<string, unknown>;
/**
 * Evaluate a FloExpression string against a context.
 *
 * @example
 * evalExpression("substring(cStream.name, 0, length(cStream.name)-3)", ctx)
 * evalExpression("concat(cStream.first, ' ', cStream.last)", ctx)
 * evalExpression("format(cStream.price, '#,##0.00')", ctx)
 * evalExpression("iif(cStream.age >= 18, 'adult', 'minor')", ctx)
 * evalExpression("exists(local.result) AND cStream.status == 'active'", ctx)
 */
export declare function evalExpression(expr: string, ctx: EvalContext): FloValue;
/**
 * Safe version — returns undefined instead of throwing.
 * Use in mapping pipelines where you want to skip bad expressions gracefully.
 */
export declare function safeEvalExpression(expr: string, ctx: EvalContext, fallback?: FloValue): FloValue;
/**
 * True when the string should be parsed/evaluated as a FloExpression (not a plain path).
 * Plain paths like `cStream.name` or `invoice.total` return false and use getValue().
 */
export declare function looksLikeExpression(s: string): boolean;
/** Quick structural checks (quotes + parentheses) before full parse. */
export declare function structuralExpressionCheck(expr: string): string | null;
export type FloExpressionValidation = {
    ok: true;
} | {
    ok: false;
    message: string;
};
/**
 * Validate expression syntax (tokenizer + parser). Does not evaluate.
 * Use in Designer before saving mapper/filter rules.
 */
export declare function validateFloExpression(expr: string): FloExpressionValidation;
/** Known function names for UI autocomplete / docs */
export declare const FLO_EXPRESSION_FUNCTIONS: string[];

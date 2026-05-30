/**
 * FloExpression function catalogue for Designer UI (insert library + context menu).
 * Names match runtime engine (lowercase).
 */

export interface FloExprParam {
  n:     string;
  opt?:  boolean;
  note?: string;
}

export interface FloExprFn {
  cat:    string;
  name:   string;
  sig:    string;
  desc:   string;
  params: FloExprParam[];
}

export const FLO_EXPR_CATEGORIES = ['All', 'Frequent', 'String', 'Number', 'Format', 'Date', 'Logic'] as const;
export type FloExprCategory = (typeof FLO_EXPR_CATEGORIES)[number];

export const FLO_EXPR_FUNCTIONS: FloExprFn[] = [
  { cat: 'String', name: 'concat',     sig: 'concat(a, b, …)',                    desc: 'Join values',              params: [{ n: 'a' }, { n: 'b', note: 'add more as needed' }] },
  { cat: 'String', name: 'upper',      sig: 'upper(src)',                         desc: 'Uppercase',                params: [{ n: 'src' }] },
  { cat: 'String', name: 'lower',      sig: 'lower(src)',                         desc: 'Lowercase',                params: [{ n: 'src' }] },
  { cat: 'String', name: 'trim',       sig: 'trim(src, side?)',                  desc: 'Trim whitespace',          params: [{ n: 'src' }, { n: 'side', opt: true, note: "l, r, or blank for both" }] },
  { cat: 'String', name: 'length',     sig: 'length(src)',                        desc: 'String or array length',   params: [{ n: 'src' }] },
  { cat: 'String', name: 'substring',  sig: 'substring(src, start, end?)',       desc: 'Slice a string',           params: [{ n: 'src' }, { n: 'start' }, { n: 'end', opt: true }] },
  { cat: 'String', name: 'indexof',    sig: 'indexof(src, search, from?)',       desc: 'Find substring index',     params: [{ n: 'src' }, { n: 'search' }, { n: 'from', opt: true }] },
  { cat: 'String', name: 'replace',    sig: 'replace(src, from, to)',            desc: 'Replace first match',      params: [{ n: 'src' }, { n: 'from' }, { n: 'to' }] },
  { cat: 'String', name: 'replaceall', sig: 'replaceall(src, from, to)',         desc: 'Replace all matches',      params: [{ n: 'src' }, { n: 'from' }, { n: 'to' }] },
  { cat: 'String', name: 'replacen',   sig: 'replacen(src, from, to, n)',        desc: 'Replace N matches',        params: [{ n: 'src' }, { n: 'from' }, { n: 'to' }, { n: 'n' }] },
  { cat: 'String', name: 'pad',        sig: 'pad(src, size, char?, side?)',      desc: 'Pad a string',             params: [{ n: 'src' }, { n: 'size' }, { n: 'char', opt: true }, { n: 'side', opt: true, note: 'l or r' }] },
  { cat: 'String', name: 'split',      sig: 'split(src, delim, index?)',        desc: 'Split to array',           params: [{ n: 'src' }, { n: 'delim' }, { n: 'index', opt: true }] },
  { cat: 'String', name: 'tostr',      sig: 'tostr(src)',                         desc: 'Convert to string',        params: [{ n: 'src' }] },
  { cat: 'Number', name: 'tonumber',   sig: 'tonumber(src)',                      desc: 'Parse to number',          params: [{ n: 'src' }] },
  { cat: 'Number', name: 'round',      sig: 'round(src, decimals?)',              desc: 'Round',                    params: [{ n: 'src' }, { n: 'decimals', opt: true }] },
  { cat: 'Number', name: 'floor',      sig: 'floor(src)',                         desc: 'Round down',               params: [{ n: 'src' }] },
  { cat: 'Number', name: 'ceil',       sig: 'ceil(src)',                          desc: 'Round up',                 params: [{ n: 'src' }] },
  { cat: 'Number', name: 'abs',        sig: 'abs(src)',                           desc: 'Absolute value',           params: [{ n: 'src' }] },
  { cat: 'Format', name: 'format',     sig: "format(src, pattern)",               desc: 'Format date or number',    params: [{ n: 'src' }, { n: 'pattern', note: "'#,##0.00' or 'YYYY-MM-DD'" }] },
  { cat: 'Date',   name: 'todate',     sig: 'todate(src)',                        desc: 'Parse to ISO date',        params: [{ n: 'src' }] },
  { cat: 'Logic',  name: 'iif',        sig: 'iif(condition, ifTrue, ifFalse)',    desc: 'Inline if',                params: [{ n: 'condition' }, { n: 'ifTrue' }, { n: 'ifFalse' }] },
  { cat: 'Logic',  name: 'exists',     sig: 'exists(src)',                        desc: 'Not null or empty',        params: [{ n: 'src' }] },
  { cat: 'Logic',  name: 'coalesce',   sig: 'coalesce(a, b, …)',                  desc: 'First non-null value',     params: [{ n: 'a' }, { n: 'b' }] },
  { cat: 'Logic',  name: 'not',        sig: 'not(expr)',                          desc: 'Logical NOT',              params: [{ n: 'expr' }] },
];

const FN_BY_KEY = new Map(FLO_EXPR_FUNCTIONS.map(f => [`${f.name}|${f.cat}`, f]));

export function getFloExprFn(name: string, cat: string): FloExprFn | undefined {
  return FN_BY_KEY.get(`${name}|${cat}`);
}

export function buildFnCall(fn: FloExprFn, vals: Record<string, string>): string {
  const args = fn.params
    .map(p => {
      const v = (vals[p.n] ?? '').trim();
      if (p.opt && !v) return null;
      return v || p.n;
    })
    .filter((a): a is string => a !== null);
  return `${fn.name}(${args.join(', ')})`;
}

export function insertAtCursor(ta: HTMLTextAreaElement, text: string, selStart: number, selEnd: number): void {
  const before = ta.value.slice(0, selStart);
  const after  = ta.value.slice(selEnd);
  ta.value = before + text + after;
  const pos = selStart + text.length;
  ta.focus();
  ta.setSelectionRange(pos, pos);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

export function paramPlaceholder(p: FloExprParam): string {
  if (p.n === 'src') return 'cStream.field';
  if (p.n === 'condition') return 'cStream.x == value';
  if (p.n === 'pattern') return "'#,##0.00'";
  return 'value';
}

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
const OP_RE = /^(==|!=|<=|>=|&&|\|\||[+\-*/%<>!])/;
function tokenize(src) {
    const tokens = [];
    let i = 0;
    const len = src.length;
    while (i < len) {
        // Whitespace
        if (/\s/.test(src[i])) {
            i++;
            continue;
        }
        // String literal ' or "
        if (src[i] === "'" || src[i] === '"') {
            const q = src[i];
            let s = '';
            i++;
            while (i < len && src[i] !== q) {
                if (src[i] === '\\' && i + 1 < len) {
                    i++;
                    s += src[i];
                }
                else
                    s += src[i];
                i++;
            }
            i++; // closing quote
            tokens.push({ type: 'STRING', value: s, pos: i });
            continue;
        }
        // Number (including negative handled by unary minus in parser)
        if (/[0-9]/.test(src[i]) || (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
            let s = '';
            while (i < len && /[0-9.]/.test(src[i])) {
                s += src[i++];
            }
            tokens.push({ type: 'NUMBER', value: s, pos: i });
            continue;
        }
        // Operators (multi-char first)
        const rest = src.slice(i);
        const opM = rest.match(OP_RE);
        if (opM) {
            tokens.push({ type: 'OP', value: opM[1], pos: i });
            i += opM[1].length;
            continue;
        }
        // Special single chars
        if (src[i] === '(') {
            tokens.push({ type: 'LPAREN', value: '(', pos: i++ });
            continue;
        }
        if (src[i] === ')') {
            tokens.push({ type: 'RPAREN', value: ')', pos: i++ });
            continue;
        }
        if (src[i] === ',') {
            tokens.push({ type: 'COMMA', value: ',', pos: i++ });
            continue;
        }
        if (src[i] === '.') {
            tokens.push({ type: 'DOT', value: '.', pos: i++ });
            continue;
        }
        // Identifier / keyword (letters, digits, underscore)
        if (/[a-zA-Z_$]/.test(src[i])) {
            let s = '';
            while (i < len && /[a-zA-Z0-9_$]/.test(src[i])) {
                s += src[i++];
            }
            if (s === 'true' || s === 'false')
                tokens.push({ type: 'BOOL', value: s, pos: i });
            else if (s === 'null')
                tokens.push({ type: 'NULL', value: s, pos: i });
            else
                tokens.push({ type: 'IDENT', value: s, pos: i });
            continue;
        }
        throw new Error(`[FloExpression] Unexpected character '${src[i]}' at position ${i} in: ${src}`);
    }
    tokens.push({ type: 'EOF', value: '', pos: i });
    return tokens;
}
// ═════════════════════════════════════════════════════════════════════════════
// Parser  (recursive descent, operator precedence via Pratt-style levels)
// ═════════════════════════════════════════════════════════════════════════════
class Parser {
    constructor(src) {
        this.pos = 0;
        this.tokens = tokenize(src);
    }
    peek() { return this.tokens[this.pos]; }
    consume() { return this.tokens[this.pos++]; }
    expect(type) {
        const t = this.consume();
        if (t.type !== type)
            throw new Error(`[FloExpression] Expected ${type} but got ${t.type} ('${t.value}')`);
        return t;
    }
    parse() { const n = this.parseExpr(0); return n; }
    // Operator precedence table
    prec(op) {
        if (op === '||' || op.toUpperCase() === 'OR')
            return 1;
        if (op === '&&' || op.toUpperCase() === 'AND')
            return 2;
        if (['==', '!='].includes(op))
            return 3;
        if (['<', '<=', '>', '>='].includes(op))
            return 4;
        if (['+', '-'].includes(op))
            return 5;
        if (['*', '/', '%'].includes(op))
            return 6;
        return 0;
    }
    parseExpr(minPrec) {
        let left = this.parseUnary();
        while (true) {
            const t = this.peek();
            // Check for binary operator (OP or IDENT keywords AND/OR)
            const isBinOp = (t.type === 'OP' && this.prec(t.value) > minPrec) ||
                (t.type === 'IDENT' && (t.value.toUpperCase() === 'AND' || t.value.toUpperCase() === 'OR') && this.prec(t.value.toUpperCase()) > minPrec);
            if (!isBinOp)
                break;
            const opTok = this.consume();
            const op = opTok.value.toUpperCase() === 'AND' ? '&&'
                : opTok.value.toUpperCase() === 'OR' ? '||'
                    : opTok.value;
            const right = this.parseExpr(this.prec(op));
            left = { kind: 'BinOp', op, left, right };
        }
        return left;
    }
    parseUnary() {
        const t = this.peek();
        if (t.type === 'OP' && t.value === '!') {
            this.consume();
            return { kind: 'UnaryOp', op: '!', operand: this.parseUnary() };
        }
        if (t.type === 'OP' && t.value === '-') {
            this.consume();
            const operand = this.parseUnary();
            // Fold constant negative numbers immediately
            if (operand.kind === 'Literal' && typeof operand.value === 'number') {
                return { kind: 'Literal', value: -(operand.value) };
            }
            return { kind: 'UnaryOp', op: '-', operand };
        }
        if (t.type === 'IDENT' && t.value.toUpperCase() === 'NOT') {
            this.consume();
            return { kind: 'UnaryOp', op: '!', operand: this.parseUnary() };
        }
        return this.parsePrimary();
    }
    parsePrimary() {
        const t = this.peek();
        // Grouped expression
        if (t.type === 'LPAREN') {
            this.consume();
            const inner = this.parseExpr(0);
            this.expect('RPAREN');
            return inner;
        }
        // Literals
        if (t.type === 'NUMBER') {
            this.consume();
            return { kind: 'Literal', value: parseFloat(t.value) };
        }
        if (t.type === 'STRING') {
            this.consume();
            return { kind: 'Literal', value: t.value };
        }
        if (t.type === 'BOOL') {
            this.consume();
            return { kind: 'Literal', value: t.value === 'true' };
        }
        if (t.type === 'NULL') {
            this.consume();
            return { kind: 'Literal', value: null };
        }
        // IDENT — could be function call or start of path
        if (t.type === 'IDENT') {
            this.consume();
            const nameParts = [t.value];
            // Collect dot-separated path segments before deciding if it's a call
            while (this.peek().type === 'DOT') {
                this.consume(); // consume '.'
                const seg = this.peek();
                if (seg.type !== 'IDENT' && seg.type !== 'NUMBER') {
                    throw new Error(`[FloExpression] Expected path segment after '.' near pos ${seg.pos}`);
                }
                this.consume();
                nameParts.push(seg.value);
            }
            // If followed by '(' it's a function call — only if single-segment name
            if (this.peek().type === 'LPAREN' && nameParts.length === 1) {
                this.consume(); // '('
                const args = [];
                if (this.peek().type !== 'RPAREN') {
                    args.push(this.parseExpr(0));
                    while (this.peek().type === 'COMMA') {
                        this.consume();
                        args.push(this.parseExpr(0));
                    }
                }
                this.expect('RPAREN');
                return { kind: 'Call', name: nameParts[0].toLowerCase(), args };
            }
            // Otherwise it's a path reference (cStream.x.y or local.foo etc.)
            return { kind: 'Path', parts: nameParts };
        }
        throw new Error(`[FloExpression] Unexpected token ${t.type} ('${t.value}') at pos ${t.pos}`);
    }
}
// ═════════════════════════════════════════════════════════════════════════════
// Path resolver  (cStream.a.b  |  local.x  |  global.y.z)
// ═════════════════════════════════════════════════════════════════════════════
function resolvePath(parts, ctx) {
    const [scope, ...rest] = parts;
    const root = ctx[scope];
    if (root === undefined) {
        // Treat as a plain string constant if scope not found
        return parts.join('.');
    }
    let cur = root;
    for (const seg of rest) {
        if (cur === null || cur === undefined)
            return undefined;
        cur = cur[seg];
    }
    return cur;
}
function asStr(v) { return v === null || v === undefined ? '' : String(v); }
function asNum(v) { return Number(v); }
function asBool(v) { return Boolean(v); }
const FUNCTIONS = {
    // ── String ──────────────────────────────────────────────────────────────
    replace(args) {
        const [src, from, to] = args;
        const s = asStr(src), f = asStr(from), t = asStr(to);
        const idx = s.indexOf(f);
        if (idx === -1)
            return s;
        return s.slice(0, idx) + t + s.slice(idx + f.length);
    },
    replaceall(args) {
        const [src, from, to] = args;
        return asStr(src).split(asStr(from)).join(asStr(to));
    },
    replacen(args) {
        const [src, from, to, n] = args;
        let s = asStr(src);
        const f = asStr(from), t = asStr(to), count = Math.max(0, asNum(n));
        for (let i = 0; i < count; i++) {
            const idx = s.indexOf(f);
            if (idx === -1)
                break;
            s = s.slice(0, idx) + t + s.slice(idx + f.length);
        }
        return s;
    },
    trim(args) {
        const s = asStr(args[0]);
        const side = asStr(args[1]).toLowerCase();
        if (side === 'l' || side === 'left')
            return s.trimStart();
        if (side === 'r' || side === 'right')
            return s.trimEnd();
        return s.trim();
    },
    length(args) {
        const v = args[0];
        if (typeof v === 'string')
            return v.length;
        if (Array.isArray(v))
            return v.length;
        return asStr(v).length;
    },
    pad(args) {
        const s = asStr(args[0]);
        const size = asNum(args[1]);
        const ch = args[2] !== undefined ? asStr(args[2]) || ' ' : ' ';
        const side = args[3] !== undefined ? asStr(args[3]).toLowerCase() : 'r';
        if (side === 'l' || side === 'left')
            return s.padStart(size, ch);
        return s.padEnd(size, ch);
    },
    substring(args) {
        const s = asStr(args[0]);
        const start = asNum(args[1]);
        if (args[2] !== undefined) {
            const end = asNum(args[2]);
            return s.substring(start < 0 ? 0 : start, end < 0 ? 0 : end);
        }
        return s.substring(start < 0 ? 0 : start);
    },
    indexof(args) {
        const s = asStr(args[0]);
        const find = asStr(args[1]);
        const from = args[2] !== undefined ? asNum(args[2]) : 0;
        return s.indexOf(find, from);
    },
    concat(args) {
        return args.map(asStr).join('');
    },
    upper(args) { return asStr(args[0]).toUpperCase(); },
    lower(args) { return asStr(args[0]).toLowerCase(); },
    tostr(args) { return asStr(args[0]); },
    split(args) {
        const parts = asStr(args[0]).split(asStr(args[1]));
        if (args[2] !== undefined)
            return parts[asNum(args[2])] ?? null;
        return parts;
    },
    // ── Number / conversion ──────────────────────────────────────────────────
    tonumber(args) {
        const v = args[0];
        if (v === null || v === undefined || v === '')
            return null;
        const n = Number(v);
        return isNaN(n) ? null : n;
    },
    todate(args) {
        const v = args[0];
        if (v === null || v === undefined)
            return null;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d.toISOString();
    },
    format(args) {
        const [src, pattern] = args;
        const p = asStr(pattern);
        // ── Date format ─────────────────────────────────────────────────────────
        // Tokens: YYYY MM DD HH mm ss
        if (p.includes('YYYY') || p.includes('MM') || p.includes('DD') ||
            p.includes('HH') || p.includes('mm') || p.includes('ss')) {
            const d = new Date(src);
            if (isNaN(d.getTime()))
                return asStr(src);
            return p
                .replace('YYYY', String(d.getFullYear()).padStart(4, '0'))
                .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
                .replace('DD', String(d.getDate()).padStart(2, '0'))
                .replace('HH', String(d.getHours()).padStart(2, '0'))
                .replace('mm', String(d.getMinutes()).padStart(2, '0'))
                .replace('ss', String(d.getSeconds()).padStart(2, '0'));
        }
        // ── Number format ───────────────────────────────────────────────────────
        // Pattern like '0.00' or '#,##0.00'
        const n = asNum(src);
        if (isNaN(n))
            return asStr(src);
        const hasComma = p.includes(',');
        const dotIdx = p.lastIndexOf('.');
        const decimals = dotIdx >= 0 ? p.length - dotIdx - 1 : 0;
        const formatted = n.toFixed(decimals);
        if (!hasComma)
            return formatted;
        const [intPart, decPart] = formatted.split('.');
        const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
    },
    round(args) {
        const n = asNum(args[0]);
        const d = args[1] !== undefined ? asNum(args[1]) : 0;
        return Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
    },
    abs(args) { return Math.abs(asNum(args[0])); },
    floor(args) { return Math.floor(asNum(args[0])); },
    ceil(args) { return Math.ceil(asNum(args[0])); },
    // ── Logic / existence ────────────────────────────────────────────────────
    exists(args) {
        const v = args[0];
        return v !== null && v !== undefined && v !== '';
    },
    not(args) { return !asBool(args[0]); },
    and(args) { return args.every(asBool); },
    or(args) { return args.some(asBool); },
    coalesce(args) {
        for (const a of args) {
            if (a !== null && a !== undefined && a !== '')
                return a;
        }
        return null;
    },
    iif(args) {
        return asBool(args[0]) ? args[1] : args[2];
    },
};
// ═════════════════════════════════════════════════════════════════════════════
// Evaluator
// ═════════════════════════════════════════════════════════════════════════════
function evalAst(node, ctx) {
    switch (node.kind) {
        case 'Literal':
            return node.value;
        case 'Path':
            return resolvePath(node.parts, ctx);
        case 'Call': {
            const fn = FUNCTIONS[node.name];
            if (!fn)
                throw new Error(`[FloExpression] Unknown function: ${node.name}()`);
            const args = node.args.map(a => evalAst(a, ctx));
            return fn(args);
        }
        case 'BinOp': {
            const l = evalAst(node.left, ctx);
            // Short-circuit evaluation
            if (node.op === '&&')
                return asBool(l) ? evalAst(node.right, ctx) : false;
            if (node.op === '||')
                return asBool(l) ? l : evalAst(node.right, ctx);
            const r = evalAst(node.right, ctx);
            switch (node.op) {
                case '+': return (typeof l === 'number' && typeof r === 'number') ? l + r : asStr(l) + asStr(r);
                case '-': return asNum(l) - asNum(r);
                case '*': return asNum(l) * asNum(r);
                case '/': {
                    const d = asNum(r);
                    if (d === 0)
                        throw new Error('[FloExpression] Division by zero');
                    return asNum(l) / d;
                }
                case '%': return asNum(l) % asNum(r);
                case '==': return l == r; // eslint-disable-line eqeqeq
                case '!=': return l != r; // eslint-disable-line eqeqeq
                case '<': return asNum(l) < asNum(r);
                case '<=': return asNum(l) <= asNum(r);
                case '>': return asNum(l) > asNum(r);
                case '>=': return asNum(l) >= asNum(r);
                default: throw new Error(`[FloExpression] Unknown operator: ${node.op}`);
            }
        }
        case 'UnaryOp': {
            const v = evalAst(node.operand, ctx);
            if (node.op === '-')
                return -asNum(v);
            if (node.op === '!')
                return !asBool(v);
            throw new Error(`[FloExpression] Unknown unary op: ${node.op}`);
        }
    }
}
// ═════════════════════════════════════════════════════════════════════════════
// Public API
// ═════════════════════════════════════════════════════════════════════════════
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
export function evalExpression(expr, ctx) {
    if (!expr || !expr.trim())
        return undefined;
    try {
        const ast = new Parser(expr.trim()).parse();
        return evalAst(ast, ctx);
    }
    catch (err) {
        console.error(`[FloExpression] Error evaluating "${expr}": ${err.message}`);
        throw err;
    }
}
/**
 * Safe version — returns undefined instead of throwing.
 * Use in mapping pipelines where you want to skip bad expressions gracefully.
 */
export function safeEvalExpression(expr, ctx, fallback = undefined) {
    try {
        return evalExpression(expr, ctx);
    }
    catch {
        return fallback;
    }
}
/**
 * True when the string should be parsed/evaluated as a FloExpression (not a plain path).
 * Plain paths like `cStream.name` or `invoice.total` return false and use getValue().
 */
export function looksLikeExpression(s) {
    const t = s.trim();
    if (!t)
        return false;
    if (/[()]/.test(t))
        return true;
    if (/\b(AND|OR|NOT)\b/i.test(t))
        return true;
    if (/\b(true|false|null)\b/i.test(t))
        return true;
    if (/&&|\|\||[+\-*/%<>=!]/.test(t))
        return true;
    if (/\w\s*\(/.test(t))
        return true;
    return false;
}
/** Quick structural checks (quotes + parentheses) before full parse. */
export function structuralExpressionCheck(expr) {
    const text = expr?.trim() ?? '';
    if (!text)
        return null;
    let depth = 0;
    let inStr = false;
    let strCh = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
            if (ch === '\\' && i + 1 < text.length) {
                i++;
                continue;
            }
            if (ch === strCh)
                inStr = false;
            continue;
        }
        if (ch === "'" || ch === '"') {
            inStr = true;
            strCh = ch;
            continue;
        }
        if (ch === '(')
            depth++;
        if (ch === ')') {
            depth--;
            if (depth < 0)
                return `Unexpected ')' at position ${i}`;
        }
    }
    if (depth > 0)
        return `Missing ${depth} closing ')'`;
    if (inStr)
        return 'Unclosed string literal';
    return null;
}
/**
 * Validate expression syntax (tokenizer + parser). Does not evaluate.
 * Use in Designer before saving mapper/filter rules.
 */
export function validateFloExpression(expr) {
    const text = expr?.trim() ?? '';
    if (!text)
        return { ok: true };
    const structural = structuralExpressionCheck(text);
    if (structural)
        return { ok: false, message: structural };
    try {
        new Parser(text).parse();
        return { ok: true };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, message: msg.replace(/^\[FloExpression\]\s*/, '') };
    }
}
/** Known function names for UI autocomplete / docs */
export const FLO_EXPRESSION_FUNCTIONS = Object.keys(FUNCTIONS).sort();

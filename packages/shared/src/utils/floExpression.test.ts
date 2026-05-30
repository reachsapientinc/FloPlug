/**
 * FILE: functions/src/utils/floExpression.test.ts
 *
 * Run with:  npx ts-node --esm floExpression.test.ts
 *        or: npx jest floExpression.test.ts
 *
 * No external test framework required — uses a plain assert helper.
 */

import { evalExpression, safeEvalExpression, looksLikeExpression } from './floExpression.js';
import type { EvalContext } from './floExpression.js';

// ── Test harness ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(label: string, expr: () => boolean) {
  try {
    if (expr()) { console.log(`  ✓ ${label}`); passed++; }
    else        { console.error(`  ✗ ${label}`); failed++; }
  } catch (e: any) {
    console.error(`  ✗ ${label} — threw: ${e.message}`); failed++;
  }
}

function group(name: string, fn: () => void) {
  console.log(`\n── ${name} ─────────────────────────────────`);
  fn();
}

function eq(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }

// ── Sample context ─────────────────────────────────────────────────────────────
const ctx: EvalContext = {
  cStream: {
    name:      'John_Doe',
    firstName: 'John',
    lastName:  'Doe',
    age:       25,
    salary:    1234567.891,
    code:      '  AB-001  ',
    active:    true,
    email:     'john@example.com',
    items:     ['a', 'b', 'c'],
    price:     99.5,
    dob:       '1998-06-15T00:00:00.000Z',
    status:    'active',
    tags:      'red,green,blue',
    greeting:  'hello world',
  },
  local: {
    prefix:    'TEST',
    threshold: 18,
  },
  global: {
    currency: 'USD',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// String functions
// ─────────────────────────────────────────────────────────────────────────────
group('replace / replaceAll / replaceN', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('replace first _',     () => e("replace(cStream.name, '_', ' ')")             === 'John Doe');
  test('replaceAll',          () => e("replaceAll('a-b-c', '-', '/')")               === 'a/c'.replace('a/c', 'a/b/c') || e("replaceAll('a-b-c', '-', '/')") === 'a/b/c');
  test('replaceAll from ctx', () => e("replaceAll(cStream.tags, ',', ' | ')")        === 'red | green | blue');
  test('replaceN 1',          () => e("replaceN('aabbcc', 'b', 'X', 1)")             === 'aaXbcc');
  test('replaceN 2',          () => e("replaceN('aabbcc', 'b', 'X', 2)")             === 'aaXXcc');
});

group('trim', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('trim both',   () => e('trim(cStream.code)')       === 'AB-001');
  test('trim left',   () => e("trim(cStream.code, 'l')")  === 'AB-001  ');
  test('trim right',  () => e("trim(cStream.code, 'r')")  === '  AB-001');
});

group('length', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('string length',  () => e('length(cStream.firstName)')  === 4);
  test('array length',   () => e('length(cStream.items)')      === 3);
  test('literal length', () => e("length('hello')")           === 5);
});

group('pad', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('right pad default', () => e("pad('Hi', 5)")                  === 'Hi   ');
  test('right pad char',    () => e("pad('Hi', 5, '0')")             === 'Hi000');
  test('left pad',          () => e("pad('Hi', 5, '0', 'l')")        === '000Hi');
});

group('substring', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('basic',           () => e('substring(cStream.firstName, 1)')      === 'ohn');
  test('with end',        () => e('substring(cStream.firstName, 0, 2)')   === 'Jo');
  test('expr in start',   () => e('substring(cStream.name, indexOf(cStream.name, \'_\')+1)') === 'Doe');
  test('expr in end',     () => e('substring(cStream.name, 0, length(cStream.name)-4)')      === 'John');
});

group('indexOf', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('found',     () => e("indexOf(cStream.name, '_')") === 4);
  test('not found', () => e("indexOf(cStream.name, 'Z')") === -1);
  test('with from', () => e("indexOf('abcabc', 'b', 2)")  === 4);
});

group('concat', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('two args',    () => e("concat(cStream.firstName, cStream.lastName)")          === 'JohnDoe');
  test('three args',  () => e("concat(cStream.firstName, ' ', cStream.lastName)")    === 'John Doe');
  test('four args',   () => e("concat(global.currency, ': ', cStream.salary, '!')")  === "USD: 1234567.891!");
});

group('upper / lower / toStr', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('upper', () => e('upper(cStream.firstName)')    === 'JOHN');
  test('lower', () => e('lower(cStream.firstName)')    === 'john');
  test('toStr', () => e('tostr(cStream.age)')          === '25');
});

group('split', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('split array',      () => eq(e("split(cStream.tags, ',')"), ['red','green','blue']));
  test('split by index',   () => e("split(cStream.tags, ',', 1)")  === 'green');
});

// ─────────────────────────────────────────────────────────────────────────────
// Number / conversion
// ─────────────────────────────────────────────────────────────────────────────
group('toNumber / toDate', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('toNumber string',  () => e("tonumber('42.5')")         === 42.5);
  test('toNumber bad',     () => e("tonumber('abc')")          === null);
  test('toDate valid',     () => typeof e('todate(cStream.dob)') === 'string');
  test('toDate bad',       () => e("todate('notadate')")       === null);
});

group('format', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('number 2dp',       () => e("format(cStream.salary, '0.00')")         === '1234567.89');
  test('number comma',     () => e("format(cStream.salary, '#,##0.00')")     === '1,234,567.89');
  test('date YYYY-MM-DD',  () => e("format(cStream.dob, 'YYYY-MM-DD')")      === '1998-06-15');
  test('date DD/MM/YYYY',  () => e("format(cStream.dob, 'DD/MM/YYYY')")      === '15/06/1998');
});

group('round / abs / floor / ceil', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('round 0dp',   () => e('round(cStream.price)')        === 100);
  test('round 1dp',   () => e('round(cStream.price, 1)')     === 99.5);
  test('abs neg',     () => e('abs(-42)')                    === 42);
  test('floor',       () => e('floor(cStream.price)')        === 99);
  test('ceil',        () => e('ceil(cStream.price)')         === 100);
});

// ─────────────────────────────────────────────────────────────────────────────
// Logic / existence
// ─────────────────────────────────────────────────────────────────────────────
group('exists / coalesce / iif', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('exists true',       () => e('exists(cStream.email)')          === true);
  test('exists false',      () => e('exists(cStream.missing)')        === false);
  test('coalesce first',    () => e("coalesce(cStream.email, 'x')")  === 'john@example.com');
  test('coalesce fallback', () => e("coalesce(cStream.missing, 'default')") === 'default');
  test('iif true branch',   () => e("iif(cStream.age >= 18, 'adult', 'minor')") === 'adult');
  test('iif false branch',  () => e("iif(cStream.age < 18, 'adult', 'minor')") === 'minor');
});

group('AND / OR / NOT', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('AND true+true',  () => e('cStream.active == true AND cStream.age >= 18') === true);
  test('AND true+false', () => e('cStream.active == true AND cStream.age < 18')  === false);
  test('OR false+true',  () => e('cStream.age < 18 OR cStream.active == true')   === true);
  test('NOT true',       () => e('NOT cStream.active')                           === false);
  test('! operator',     () => e('!cStream.active')                              === false);
  test('&&',             () => e('cStream.active && cStream.age > 0')            === true);
  test('||',             () => e('false || cStream.active')                      === true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Arithmetic
// ─────────────────────────────────────────────────────────────────────────────
group('Arithmetic operators', () => {
  const e = (x: string) => evalExpression(x, ctx);
  test('+',        () => e('cStream.age + 5')           === 30);
  test('-',        () => e('cStream.age - 5')           === 20);
  test('*',        () => e('cStream.price * 1.1')       === 109.45000000000001);
  test('/',        () => e('cStream.age / 5')           === 5);
  test('%',        () => e('cStream.age % 7')           === 4);
  test('string +', () => e("'Hi ' + cStream.firstName") === 'Hi John');
  test('neg lit',  () => e('-5 + cStream.age')          === 20);
});

// ─────────────────────────────────────────────────────────────────────────────
// Nested / complex expressions
// ─────────────────────────────────────────────────────────────────────────────
group('Nested expressions', () => {
  const e = (x: string) => evalExpression(x, ctx);

  // substring(name, 0, length(name)-4)  →  "John"
  test('substring + length',
    () => e('substring(cStream.name, 0, length(cStream.name)-4)') === 'John');

  // substring after indexOf  →  "Doe"
  test('substring + indexOf',
    () => e("substring(cStream.name, indexOf(cStream.name, '_')+1)") === 'Doe');

  // pad(upper(trim(code)), 8, '0', 'l')
  test('pad + upper + trim',
    () => e("pad(upper(trim(cStream.code)), 8, '0', 'l')") === '00AB-001');

  // concat with format
  test('concat + format',
    () => e("concat(global.currency, ' ', format(cStream.salary, '#,##0.00'))")
           === 'USD 1,234,567.89');

  // iif with nested comparison using local
  test('iif + local var',
    () => e("iif(cStream.age >= local.threshold, 'adult', 'minor')") === 'adult');

  // coalesce with expression argument
  test('coalesce + exists',
    () => e("coalesce(cStream.missing, concat(cStream.firstName, ' (default)'))") === 'John (default)');

  // Arithmetic inside substring end index
  test('expr in substring bounds',
    () => e('substring(cStream.greeting, 6, 6 + length(cStream.firstName))') === 'world');

  // replaceAll inside concat
  test('concat + replaceAll',
    () => e("concat('[', replaceAll(cStream.tags, ',', ', '), ']')") === '[red, green, blue]');
});

// ─────────────────────────────────────────────────────────────────────────────
// looksLikeExpression
// ─────────────────────────────────────────────────────────────────────────────
group('looksLikeExpression', () => {
  test('plain path — false',  () => looksLikeExpression('cStream.name')        === false);
  test('fn call — true',      () => looksLikeExpression('length(cStream.x)')   === true);
  test('operator — true',     () => looksLikeExpression('cStream.a + 1')       === true);
  test('AND keyword — true',  () => looksLikeExpression('cStream.a AND cStream.b') === true);
  test('bool literal — true', () => looksLikeExpression('true')                === true);
});

// ─────────────────────────────────────────────────────────────────────────────
// safeEvalExpression
// ─────────────────────────────────────────────────────────────────────────────
group('safeEvalExpression', () => {
  test('bad expr returns fallback',
    () => safeEvalExpression('unknown_fn(x)', ctx, 'FALLBACK') === 'FALLBACK');
  test('good expr passes through',
    () => safeEvalExpression('cStream.age + 1', ctx, 0) === 26);
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

export const DEFAULT_NODE_TEST_INPUT = JSON.stringify(
  { message: 'Hello FloPlug', value: 42 },
  null,
  2,
);

/** @deprecated Use DEFAULT_NODE_TEST_INPUT */
export const DEFAULT_PLUG_TEST_INPUT = DEFAULT_NODE_TEST_INPUT;

export function parseNodeTestInput(
  raw: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Input must be a JSON object' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
}

/** @deprecated Use parseNodeTestInput */
export const parsePlugTestInput = parseNodeTestInput;

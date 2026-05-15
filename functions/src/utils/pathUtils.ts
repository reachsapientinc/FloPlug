/**
 * Safely reaches into an object using a dot-path (e.g., "user.address.city")
 */
export const getValue = (obj: any, path: string) => {
  if (!path) return undefined;
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
};

/**
 * Sets a value in an object at a dot-path, creating sub-objects as needed
 */
export const setValue = (obj: any, path: string, value: any) => {
  if (!path || value === undefined) return;
  const parts = path.split('.');
  const last = parts.pop()!;
  const target = parts.reduce((acc, part) => {
    if (!acc[part] || typeof acc[part] !== 'object') acc[part] = {};
    return acc[part];
  }, obj);
  target[last] = value;
};
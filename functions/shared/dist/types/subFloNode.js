/**
 * Inline SubFlo compartments on the same canvas + Loop routing handles.
 */
export const LOOP_LOOP_HANDLE = 'loop';
export const LOOP_EXIT_HANDLE = 'exit';
export function createSubFloInputArg(name = '') {
    return {
        id: `in-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        required: false,
    };
}
export function createSubFloReturnArg(name = '') {
    return {
        id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
    };
}

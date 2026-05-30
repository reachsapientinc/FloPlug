/**
 * Inline SubFlo compartments on the same canvas + Loop routing handles.
 */
export declare const LOOP_LOOP_HANDLE = "loop";
export declare const LOOP_EXIT_HANDLE = "exit";
export interface SubFloInputArg {
    id: string;
    name: string;
    description?: string;
    /** FloExpression or literal default when caller omits value */
    defaultValue?: string;
    required: boolean;
}
export interface SubFloReturnArg {
    id: string;
    name: string;
    description?: string;
}
export interface SubFloReturnBinding {
    argName: string;
    /** local path, cStream path, or expression */
    source: 'local' | 'cStream' | 'expression';
    value: string;
}
export interface SubFloInputBinding {
    argName: string;
    valueExpr: string;
}
export declare function createSubFloInputArg(name?: string): SubFloInputArg;
export declare function createSubFloReturnArg(name?: string): SubFloReturnArg;
export interface SubFloNodeData {
    canvasName?: string;
    description?: string;
    subFloId?: string;
    inputArgs?: SubFloInputArg[];
    returnArgs?: SubFloReturnArg[];
}
export interface InvokeSubFloNodeData {
    targetSubFloId?: string;
    inputBindings?: SubFloInputBinding[];
}
export interface LoopNodeData {
    continueExpr?: string;
    executeAtLeastOnce?: boolean;
    maxIterations?: number;
    outputTarget?: 'cStream' | 'local' | 'global';
    outputVarName?: string;
}

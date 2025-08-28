declare module 'sql.js-httpvfs' {
  // Minimal declarations to satisfy TypeScript in our Node API route
  export function createDbWorker(
    configs: any[],
    workerUrl: string,
    wasmUrl: string,
    maxBytesToRead?: number
  ): Promise<any>;
  const _default: any;
  export default _default;
}

// Names core uses that the Workers types leave out (the relay never calls that code: it is in
// core's NoteTools, which the demo device bundles).
type BlobPart = ArrayBuffer | ArrayBufferView | string | Blob

// Node's built-in SQLite, only in demo.test.ts (vitest runs in Node). Node's own types would clash
// with the Workers types, so just what the test uses.
declare module 'node:sqlite' {
  interface StatementSync {
    all(...params: never[]): unknown[]
    run(...params: never[]): unknown
  }
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}

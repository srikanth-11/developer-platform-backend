/**
 * Polyfill: expose WebCrypto as a global on Node 18.
 *
 * `@nestjs/typeorm` v11 internally calls the global `crypto.randomUUID()`.
 * Node made `crypto` a global starting in v19/20, but on Node 18 it is NOT a
 * global (it lives in the `node:crypto` module). Without this, the app crashes
 * at startup with "ReferenceError: crypto is not defined".
 *
 * This file MUST be imported before AppModule so the global exists before any
 * module that needs it is evaluated. Keep it as the very first import in main.ts.
 *
 * (When the project moves to Node 20+, this becomes a harmless no-op.)
 */
import { webcrypto } from 'node:crypto';

if (typeof (globalThis as { crypto?: unknown }).crypto === 'undefined') {
  (globalThis as { crypto?: unknown }).crypto = webcrypto;
}

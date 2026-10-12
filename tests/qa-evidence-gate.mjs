import { existsSync } from 'node:fs';
import path from 'node:path';

/** Historical renders are an explicit archive check, separate from portable source tests. */
export function evidenceTests(test, folder) {
  if (process.env.CARD_QA_EVIDENCE !== 'archive') {
    return (name, fn) => test(name, { skip: 'Historical render archive: run npm run test:archive to validate it.' }, fn);
  }
  if (!existsSync(path.resolve(process.cwd(), 'docs/qa', folder))) {
    throw new Error(`Required render archive missing: docs/qa/${folder}. Restore the archive before running test:archive.`);
  }
  return test;
}

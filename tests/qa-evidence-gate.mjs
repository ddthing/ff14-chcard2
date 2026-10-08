import { existsSync } from 'node:fs';
import path from 'node:path';

/** Keep historical screenshot-evidence checks active in the full QA archive.
 * Deployment source bundles intentionally omit multi-gigabyte render corpora. */
export function evidenceTests(test, folder) {
  return existsSync(path.resolve(process.cwd(), 'docs/qa', folder))
    ? test
    : (name, fn) => test.skip(name, fn);
}

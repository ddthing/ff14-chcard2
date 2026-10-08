import { existsSync, statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const basePath = resolvePath(sourceRoot, specifier.slice(2));
    const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`, `${basePath}/index.ts`, `${basePath}/index.js`];
    const found = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
    if (!found) throw new Error(`Cannot resolve project alias: ${specifier}`);
    return { url: pathToFileURL(found).href, shortCircuit: true };
  }

  if (!specifier.startsWith('.')) return nextResolve(specifier, context);

  const parentPath = fileURLToPath(context.parentURL);
  const basePath = resolvePath(parentPath, '..', specifier);
  const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`, `${basePath}.mjs`, `${basePath}/index.ts`, `${basePath}/index.js`];
  const found = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!found) return nextResolve(specifier, context);
  return { url: pathToFileURL(found).href, shortCircuit: true };
}

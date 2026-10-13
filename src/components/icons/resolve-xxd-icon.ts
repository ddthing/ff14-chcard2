import { ICON_ALIASES, ICON_NODES } from './vendor/xxd-ui-kit/nodes.js';
import type { XxdIconName, XxdIconNameOrAlias, XxdIconNode } from './vendor/xxd-ui-kit/nodes.js';

function hasOwnIconName(name: string): name is XxdIconName {
  return Object.prototype.hasOwnProperty.call(ICON_NODES, name);
}

/** Resolve a direct name or upstream alias before reading the node registry. */
export function resolveXxdIconName(name: XxdIconNameOrAlias): XxdIconName | undefined {
  if (hasOwnIconName(name)) return name;

  const canonicalName = (ICON_ALIASES as Readonly<Record<string, XxdIconName>>)[name];
  return canonicalName && hasOwnIconName(canonicalName) ? canonicalName : undefined;
}

export function resolveXxdIconNodes(name: XxdIconNameOrAlias): readonly XxdIconNode[] | undefined {
  const canonicalName = resolveXxdIconName(name);
  return canonicalName ? ICON_NODES[canonicalName] : undefined;
}

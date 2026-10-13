import { createElement, type CSSProperties } from 'react';
import { resolveXxdIconNodes } from '@/components/icons/resolve-xxd-icon';
import type { XxdIconNameOrAlias, XxdIconNode } from '@/components/icons/vendor/xxd-ui-kit/nodes.js';

type AppIconProps = {
  name: XxdIconNameOrAlias;
  size?: number;
  className?: string;
  mirrored?: boolean;
  'data-card-pictogram'?: string;
};

function renderNode([tag, attributes]: XxdIconNode, key: number) {
  return createElement(tag, { key, ...attributes });
}

export function AppIcon({ name, size = 18, className, mirrored = false, 'data-card-pictogram': cardPictogram }: AppIconProps) {
  const style: CSSProperties | undefined = mirrored ? { transform: 'scaleX(-1)' } : undefined;
  const nodes = resolveXxdIconNodes(name);
  if (!nodes) return null;

  return (
    <svg
      aria-hidden="true"
      className={className}
      data-icon={name}
      data-card-pictogram={cardPictogram}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="miter"
      focusable="false"
      style={style}
    >
      {nodes.map(renderNode)}
    </svg>
  );
}

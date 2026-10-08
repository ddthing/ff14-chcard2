type EngravingMarkProps = {kind?: 'compass' | 'divider'; className?: string};

/** Project-authored print marks; decorative, never a verification seal or logo. */
export function EngravingMark({kind = 'compass', className}: EngravingMarkProps) {
  return (
    <svg
      className={className}
      viewBox={kind === 'divider' ? '0 0 160 18' : '0 0 48 48'}
      fill="none" stroke="currentColor" strokeWidth=".8"
      strokeLinecap="butt" strokeLinejoin="miter"
      strokeMiterlimit={kind === 'divider' ? 2 : 3}
      aria-hidden="true" focusable="false" data-engraving={kind}
    >
      {kind === 'divider' ? <>
        <path d="M1 9h59m40 0h59M80 3l6 6-6 6-6-6ZM65 9h9m12 0h9" />
        <path opacity=".45" d="M9 12h43m56 0h43" />
      </> : <>
        <path d="M24 2l2.5 15.5L40 8l-9.5 13.5L46 24l-15.5 2.5L40 40l-13.5-9.5L24 46l-2.5-15.5L8 40l9.5-13.5L2 24l15.5-2.5L8 8l13.5 9.5Z" />
        <path d="M24 2v44M2 24h44M8 8l32 32M8 40 40 8M24 18l6 6-6 6-6-6Z" />
        <path opacity=".5" d="M24 8l1 11M40 24l-11 1M24 40l-1-11M8 24l11-1" />
      </>}
    </svg>
  );
}

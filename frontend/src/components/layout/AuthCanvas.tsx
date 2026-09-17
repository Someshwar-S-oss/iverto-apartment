import React from 'react';

export interface AuthCanvasProps {
  /**
   * `grid`   — structural lattice, used behind the split login canvas.
   * `dots`   — softer dot field, used behind centered single-card screens.
   * `ticks`  — sparse brand tick marks, the quietest of the three.
   */
  variant?: 'grid' | 'dots' | 'ticks';
  /** Where the field fades out so it never meets the viewport as a hard edge. */
  fade?: 'center' | 'corner' | 'top' | 'bottom';
  /** Slow vertical sweep across the field — nods at the face-terminal scan. */
  scan?: boolean;
  className?: string;
}

const fieldClass: Record<NonNullable<AuthCanvasProps['variant']>, string> = {
  grid: 'bg-field-grid',
  dots: 'bg-field-dots',
  ticks: 'bg-field-ticks',
};

const fadeClass: Record<NonNullable<AuthCanvasProps['fade']>, string> = {
  center: 'field-fade-center',
  corner: 'field-fade-corner',
  top: 'field-fade-top',
  bottom: 'field-fade-bottom',
};

/**
 * The decorative layer stack shared by every unauthenticated screen: a
 * structural background field, two drifting brand glows and an optional
 * scanline. Drop it as the first child of a `relative` container.
 */
export const AuthCanvas: React.FC<AuthCanvasProps> = ({
  variant = 'grid',
  fade = 'center',
  scan = false,
  className = '',
}) => {
  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {/* Structural field */}
      <div className={`bg-field ${fieldClass[variant]} ${fadeClass[fade]}`} />

      {/* Ambient brand light */}
      <div
        className="glow animate-drift w-[30rem] h-[30rem] -top-48 -left-36"
        style={{ background: 'radial-gradient(circle, rgba(205,4,71,0.13), transparent 66%)' }}
      />
      <div
        className="glow animate-drift w-[26rem] h-[26rem] -bottom-44 -right-28"
        style={{
          background: 'radial-gradient(circle, rgba(233,30,99,0.11), transparent 66%)',
          animationDelay: '-6s',
        }}
      />

      {scan && <div className="scanline" />}
    </div>
  );
};

export default AuthCanvas;

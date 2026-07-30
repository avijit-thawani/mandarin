// Mascot geometry.
//
// Built to Duolingo's published shape language (design.duolingo.com/illustration):
//   - only three primitives: rounded rectangle, circle, rounded triangle
//   - nothing pointy (triangles are rounded via a same-colour round-joined stroke)
//   - ~15 shapes; they call 6 "too abstract" and 30 "too many"
//   - flat perspective, no foreshortening
//   - the shadow is a PILL, never an oval — an oval would imply perspective
//   - "floating accents": limbs detached from the body. Duo's feet flutter this way.
//     It's also why this rig needs no skeleton — every part is independently
//     transformable, so posing is just translate/rotate on a <g>.
//
// Parts expose `data-slot` so the rig (useMascotRig) can find and animate them
// without prop-drilling a ref per part.

import type { MascotPalette } from './palettes';

export type MascotSlot =
  | 'root'
  | 'body'
  | 'head'
  | 'eyeL'
  | 'eyeR'
  | 'pupils'
  | 'brows'
  | 'armL'
  | 'armR'
  | 'feet'
  | 'shadow';

interface MascotProps {
  palette: MascotPalette;
  /** Cheek blush is the one optional shape — dropping it keeps the count at their
   *  ~15 target for busier palettes. */
  blush?: boolean;
  className?: string;
  title?: string;
}

/** Rounded triangle: a polygon whose corners are rounded by stroking it in its own
 *  fill colour with a round line join. Cheaper and more legible than hand-authoring
 *  arc paths, and it guarantees "no pointy shapes". */
function RoundedTriangle({ points, fill }: { points: string; fill: string }) {
  return (
    <polygon
      points={points}
      fill={fill}
      stroke={fill}
      strokeWidth={12}
      strokeLinejoin="round"
    />
  );
}

export function Mascot({ palette, blush = true, className, title }: MascotProps) {
  const p = palette;
  return (
    <svg
      viewBox="0 0 200 210"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* Shadow: pill, not oval. Sits outside `root` so the character can hop
          without dragging its shadow off the ground. */}
      <rect
        data-slot="shadow"
        x={56}
        y={198}
        width={88}
        height={10}
        rx={5}
        fill="currentColor"
        opacity={0.16}
        style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
      />

      <g data-slot="root" style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
        {/* Floating feet — detached, so they can bob out of phase with the body */}
        <g data-slot="feet">
          <rect x={68} y={180} width={28} height={14} rx={7} fill={p.bodyShade} />
          <rect x={104} y={180} width={28} height={14} rx={7} fill={p.bodyShade} />
        </g>

        <g data-slot="body" style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
          {/* Ears behind the body, in the shade tone so they read as further back.
              Kept small: at full size they out-weigh the head and break the
              "rhythm" rule about varying visual weight. */}
          <RoundedTriangle points="64,58 78,34 92,58" fill={p.bodyShade} />
          <RoundedTriangle points="108,58 122,34 136,58" fill={p.bodyShade} />

          {/* Body: the rounded rectangle, which their guide says you'll use most.
              Slightly taller than wide so it reads as an egg, not a ball. */}
          <rect x={46} y={48} width={108} height={124} rx={54} fill={p.body} />

          {/* Belly patch adds colour rhythm without changing the silhouette */}
          <circle cx={100} cy={150} r={17} fill={p.belly} />

          {/* Floating arms, detached from the body with a visible gap */}
          <rect
            data-slot="armL"
            x={24}
            y={104}
            width={18}
            height={44}
            rx={9}
            fill={p.bodyShade}
            style={{ transformBox: 'fill-box', transformOrigin: '50% 10%' }}
          />
          <rect
            data-slot="armR"
            x={158}
            y={104}
            width={18}
            height={44}
            rx={9}
            fill={p.bodyShade}
            style={{ transformBox: 'fill-box', transformOrigin: '50% 10%' }}
          />

          {/* Head group: transforms here compose on top of the body's breathing,
              which is how Duolingo gets independent head/body motion. */}
          <g data-slot="head" style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
            {blush && (
              <>
                <circle cx={62} cy={110} r={7} fill={p.blush} opacity={0.9} />
                <circle cx={138} cy={110} r={7} fill={p.blush} opacity={0.9} />
              </>
            )}

            {/* Eyes. Blink = scaleY on these groups, so the pupil rides along. */}
            <g data-slot="eyeL" style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}>
              <circle cx={84} cy={88} r={16} fill="#FFFFFF" />
            </g>
            <g data-slot="eyeR" style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}>
              <circle cx={116} cy={88} r={16} fill="#FFFFFF" />
            </g>

            {/* Pupils move as one group: eyes that track together read as alive,
                eyes that drift independently read as broken. */}
            <g data-slot="pupils">
              <circle cx={84} cy={88} r={7} fill={p.eye} />
              <circle cx={116} cy={88} r={7} fill={p.eye} />
            </g>

            {/* Brows carry most of the expression; hidden at rest. */}
            <g data-slot="brows" opacity={0}>
              <rect
                data-slot="browL"
                x={69}
                y={63.5}
                width={26}
                height={2}
                rx={1}
                fill={p.eye}
                style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
              />
              <rect
                data-slot="browR"
                x={105}
                y={63.5}
                width={26}
                height={2}
                rx={1}
                fill={p.eye}
                style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
              />
            </g>

            {/* Beak: the rounded triangle */}
            <RoundedTriangle points="90,108 110,108 100,123" fill={p.face} />
          </g>
        </g>
      </g>
    </svg>
  );
}

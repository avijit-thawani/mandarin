// Saras — a seated veena player, the app's namesake character.
//
// "Saras" reads three ways, all of them apt: Saraswati (goddess of learning,
// speech and music, always shown with a veena), सरस् / saras meaning lake or
// flowing water — the root her name comes from — and सारस, the Sarus crane.
//
// This is a *musician inspired by* that iconography, not a depiction of the
// goddess: no extra arms, no halo, no divine attributes. The veena, the lotus
// and the swan carry the association without turning a deity into a mascot.
//
// Veena anatomy follows the real instrument (en.wikipedia.org/wiki/Saraswati_veena):
//   kudam     — the large resonator, resting by the right thigh
//   dandi     — the long fretted neck running up across the body
//   surakkai  — the small secondary gourd under the top of the neck
//   yali      — the carved head that finishes the tuning box
// Held at an angle, seated cross-legged, right hand plucking at the kudam and
// the left arm passing under the neck.
//
// Shape language still follows Duolingo's guide — rounded rectangles, circles
// and rounded triangles, flat perspective, pill shadow — but this character
// needs ~30 shapes rather than their ~15, because a person holding a specific
// instrument carries more information than a blob with a beak.

import type { SarasPalette, VeenaTone } from './sarasPalettes';

interface SarasProps {
  palette: SarasPalette;
  /** Wood tone for the instrument, chosen independently of the sari so the two
   *  axes multiply instead of moving together. */
  veenaTone?: VeenaTone;
  className?: string;
  title?: string;
}

function RoundedTriangle({ points, fill }: { points: string; fill: string }) {
  return <polygon points={points} fill={fill} stroke={fill} strokeWidth={9} strokeLinejoin="round" />;
}

export function Saras({ palette, veenaTone, className, title }: SarasProps) {
  const p = palette;
  const wood = veenaTone?.wood ?? p.veena;
  const woodShade = veenaTone?.woodShade ?? p.veenaShade;
  return (
    <svg
      viewBox="0 0 220 220"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* Pill shadow, never an oval */}
      <rect
        data-slot="shadow"
        x={44}
        y={200}
        width={132}
        height={11}
        rx={5.5}
        fill="currentColor"
        opacity={0.15}
        style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
      />


      <g data-slot="root" style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
        <g data-slot="body" style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
          {/* Hair mass behind everything, so the head reads as sitting in front */}
          <g data-slot="hair" style={{ transformBox: 'fill-box', transformOrigin: '50% 0%' }}>
            <circle cx={110} cy={62} r={33} fill={p.hair} />
            {/* Braid over the shoulder — also our follow-through element */}
            <rect x={128} y={78} width={15} height={62} rx={7.5} fill={p.hair} />
            <circle cx={135} cy={142} r={6} fill={p.gold} />
          </g>

          {/* Seated lower body: the sari, a wide rounded base that reads as
              cross-legged without drawing legs */}
          <rect x={58} y={142} width={104} height={58} rx={29} fill={p.sari} />
          {/* Crossed knees: two rounded shapes reading as folded legs. A single
              centred panel here instead read as a door on a pot. */}
          <rect x={56} y={172} width={52} height={28} rx={14} fill={p.sariShade} />
          <rect x={112} y={172} width={52} height={28} rx={14} fill={p.sariShade} />
          {/* Gold hem, offset so it follows the near leg rather than ringing the
              whole shape like a basket rim */}
          <rect x={60} y={193} width={44} height={7} rx={3.5} fill={p.gold} opacity={0.9} />
          <rect x={116} y={193} width={44} height={7} rx={3.5} fill={p.gold} opacity={0.9} />

          {/* Torso / blouse */}
          <rect x={84} y={88} width={52} height={54} rx={24} fill={p.blouse} />
          {/* Dupatta across the chest — the diagonal that echoes the veena */}
          <rect x={80} y={100} width={60} height={14} rx={7} fill={p.sari} transform="rotate(-14 110 107)" />

          {/* Left arm reaching under the veena neck */}
          <rect
            data-slot="armL"
            x={62}
            y={112}
            width={16}
            height={44}
            rx={8}
            fill={p.skin}
            transform="rotate(24 70 112)"
            style={{ transformBox: 'fill-box', transformOrigin: '50% 0%' }}
          />

          {/* Head */}
          <g data-slot="head" style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
            <circle cx={110} cy={64} r={27} fill={p.skin} />
            {/* Hair fringe over the top of the face */}
            <path d="M83 58 A27 27 0 0 1 137 58 A27 20 0 0 0 83 58 Z" fill={p.hair} />
            {/* Bindi */}
            <circle cx={110} cy={50} r={3.5} fill={p.blouse} />

            <g data-slot="eyeL" style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}>
              <circle cx={100} cy={66} r={6.5} fill="#FFFFFF" />
            </g>
            <g data-slot="eyeR" style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}>
              <circle cx={120} cy={66} r={6.5} fill="#FFFFFF" />
            </g>
            <g data-slot="pupils">
              <circle cx={100} cy={66} r={3.2} fill={p.hair} />
              <circle cx={120} cy={66} r={3.2} fill={p.hair} />
            </g>
            {/* Brows are hidden at rest and rotated per expression. Rotating each
                one independently is what separates angry (inner ends down) from
                sad (outer ends down) — the single clearest emotion cue we have. */}
            <g data-slot="brows" opacity={0}>
              <rect
                data-slot="browL"
                x={91}
                y={53.5}
                width={16}
                height={1.5}
                rx={0.75}
                fill={p.hair}
                style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
              />
              <rect
                data-slot="browR"
                x={113}
                y={53.5}
                width={16}
                height={1.5}
                rx={0.75}
                fill={p.hair}
                style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
              />
            </g>

            {/* Closed mouth: a stroked arc. Wrapped in a slot so expressions can
                flip it — scaleY(-1) about its own centre turns the smile into a
                frown, cheaper and more reliable than swapping path data. */}
            <g data-slot="mouth" style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}>
              <path d="M103 78 Q110 84 117 78" stroke={p.skinShade} strokeWidth={3} strokeLinecap="round" fill="none" />
            </g>

            {/* Open mouth for laughing, cross-faded in for happy/celebrate.
                Squinting the eyes alone reads as "wincing", not "delighted" —
                delight needs the mouth to actually open. */}
            <g
              data-slot="mouthOpen"
              opacity={0}
              style={{ transformBox: 'fill-box', transformOrigin: '50% 20%' }}
            >
              <path d="M101 76 Q110 73 119 76 Q118 90 110 90 Q102 90 101 76 Z" fill="#6E3B3B" />
              {/* Tongue kept a fixed muted pink rather than a palette colour —
                  it should read the same whatever she's wearing. */}
              <ellipse cx={110} cy={87} rx={5} ry={3.2} fill="#D97A83" />
            </g>

            {/* Jhumka earrings */}
            <circle cx={85} cy={72} r={4.5} fill={p.gold} />
            <circle cx={135} cy={72} r={4.5} fill={p.gold} />
          </g>

          {/* ── Veena ───────────────────────────────────────────────────────
              Authored horizontally then rotated as one group, so the whole
              instrument can bob with the music as a single unit. */}
          <g
            data-slot="veena"
            transform="rotate(24 110 140)"
            style={{ transformBox: 'fill-box', transformOrigin: '70% 70%' }}
          >
            {/* Yali — the carved head finishing the tuning box */}
            <RoundedTriangle points="42,131 56,124 56,146" fill={woodShade} />
            {/* Surakkai, the small secondary gourd under the neck */}
            <circle cx={64} cy={150} r={10} fill={woodShade} />
            {/* Dandi, the long fretted neck */}
            <rect x={56} y={128} width={104} height={16} rx={8} fill={wood} />
            {/* Frets */}
            <g opacity={0.55}>
              {[72, 84, 96, 108, 120, 132].map(x => (
                <rect key={x} x={x} y={130} width={2.5} height={12} rx={1.25} fill={p.gold} />
              ))}
            </g>
            {/* Kudam, the big resonator by the right thigh */}
            <circle cx={168} cy={138} r={25} fill={wood} />
            <circle cx={168} cy={138} r={10} fill={woodShade} />
            {/* Strings: the part that vibrates when she plays */}
            <g data-slot="strings" stroke={p.gold} strokeWidth={1.5} strokeLinecap="round" opacity={0.95}>
              <line x1={60} y1={132} x2={186} y2={134} />
              <line x1={60} y1={136} x2={186} y2={138} />
              <line x1={60} y1={140} x2={186} y2={142} />
            </g>
          </g>

          {/* Right hand plucking at the kudam, drawn after the veena so it sits
              on top of the strings */}
          <rect
            data-slot="armR"
            x={132}
            y={112}
            width={15}
            height={42}
            rx={7.5}
            fill={p.skin}
            transform="rotate(-22 139 112)"
            style={{ transformBox: 'fill-box', transformOrigin: '50% 0%' }}
          />
          <circle data-slot="hand" cx={152} cy={150} r={9} fill={p.skin} />
        </g>
      </g>

      {/* Music notes, hidden at rest and floated up by the `pluck` gesture.
          These replaced two drifting lotus petals: as abstract ellipses they just
          read as stray blobs, and their guide is explicit that you only float an
          object "if it serves the illustration". A note leaving the instrument
          when she plays serves it; a petal parked in the corner doesn't.
          Drawn last and kept clear of the silhouette — inside the group order
          the body painted straight over them. */}
      <g data-slot="notes" opacity={0}>
        <g fill={p.blouse}>
          <ellipse cx={46} cy={74} rx={6} ry={4.5} transform="rotate(-18 46 74)" />
          <rect x={50} y={58} width={2.6} height={16} rx={1.3} />
        </g>
        <g fill={p.sariShade}>
          <ellipse cx={180} cy={58} rx={5} ry={3.8} transform="rotate(-18 180 58)" />
          <rect x={183} y={44} width={2.2} height={14} rx={1.1} />
        </g>
      </g>
    </svg>
  );
}

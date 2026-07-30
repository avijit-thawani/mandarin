// Mascot lab — a scratch page for iterating on the character.
// Not linked from the navbar; reach it at /mascot.

import { useState } from 'react';
import { Shuffle, Sparkles } from 'lucide-react';
import { Mascot } from '../components/mascot/Mascot';
import { Saras } from '../components/mascot/Saras';
import { useMascotRig, MOTION_COMBINATIONS, pickBySeed, type MascotExpression, type MascotGesture } from '../components/mascot/useMascotRig';
import { MASCOT_PALETTES } from '../components/mascot/palettes';
import { SARAS_PALETTES, VEENA_TONES } from '../components/mascot/sarasPalettes';

/** Motion sets x sari colours x veena wood tones. */
const SARAS_VARIANTS = MOTION_COMBINATIONS * SARAS_PALETTES.length * VEENA_TONES.length;

const SAMPLE_SEEDS = ['你好', '谢谢', '对不起', '老师', '朋友', '喜欢', '什么', '因为'];

type CharacterKind = 'saras' | 'creature';

function MascotStage({ seed, size = 220, kind = 'saras' }: { seed: string; size?: number; kind?: CharacterKind }) {
  const { containerRef, variant, setExpression, playGesture, react } = useMascotRig({ seed });
  const [current, setCurrent] = useState<MascotExpression>('idle');
  const sarasPalette = pickBySeed(SARAS_PALETTES, seed);
  // Salted so the wood tone varies independently of the sari.
  const veenaTone = pickBySeed(VEENA_TONES, seed + ':veena');

  const expressions: MascotExpression[] = ['idle', 'happy', 'sad', 'angry', 'thinking', 'celebrate'];
  const gestures: MascotGesture[] =
    kind === 'saras'
      ? ['nod', 'shake', 'wobble', 'hop', 'pluck']
      : ['nod', 'shake', 'wobble', 'hop', 'wave'];

  return (
    <div className="card bg-base-200 border border-base-300">
      <div className="card-body items-center gap-3 p-4">
        <div ref={containerRef} className="text-base-content" style={{ width: size, height: size }}>
          {kind === 'saras' ? (
            <Saras palette={sarasPalette} veenaTone={veenaTone} title={`Saras for ${seed}`} />
          ) : (
            <Mascot palette={variant.palette} blush={variant.blush} title={`Mascot for ${seed}`} />
          )}
        </div>

        <div className="text-center">
          <p className="font-bold text-lg hanzi">{seed}</p>
          <p className="text-xs text-base-content/60">
            {kind === 'saras' ? `${sarasPalette.name} · ${veenaTone.name} veena` : variant.palette.name} · body:{variant.body} · head:{variant.head} · blink:{variant.blink}
          </p>
        </div>

        <div className="flex flex-wrap gap-1 justify-center">
          {expressions.map(e => (
            <button
              key={e}
              className={`btn btn-xs btn-chunky ${current === e ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => { setCurrent(e); setExpression(e); }}
            >
              {e}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1 justify-center">
          {gestures.map(g => (
            <button key={g} className="btn btn-xs btn-ghost" onClick={() => playGesture(g)}>
              {g}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button className="btn btn-sm btn-success btn-chunky" onClick={() => { setCurrent('happy'); react('correct'); }}>
            Correct
          </button>
          <button className="btn btn-sm btn-error btn-chunky" onClick={() => { setCurrent('sad'); react('wrong'); }}>
            Wrong
          </button>
        </div>
      </div>
    </div>
  );
}

export function MascotLabPage() {
  const [seeds, setSeeds] = useState<string[]>(SAMPLE_SEEDS.slice(0, 4));
  const [focus, setFocus] = useState('你好');

  const reroll = () => {
    setSeeds(Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 7)));
  };

  return (
    <div className="h-full overflow-auto">
      <header className="sticky top-0 z-10 bg-base-100/95 backdrop-blur border-b border-base-300 px-4 py-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Mascot Lab
        </h1>
        <p className="text-xs text-base-content/60">
          {SARAS_VARIANTS.toLocaleString()} Saras variants · {MOTION_COMBINATIONS} motion sets ×{' '}
          {SARAS_PALETTES.length} saris × {VEENA_TONES.length} veena woods · seeded per word
        </p>
      </header>

      <div className="p-4 max-w-3xl mx-auto space-y-6 pb-24">
        <section className="space-y-3">
          <h2 className="font-semibold">Saras — veena player</h2>
          <MascotStage seed={focus} size={300} kind="saras" />
          <div className="flex flex-wrap gap-1">
            {SAMPLE_SEEDS.map(s => (
              <button
                key={s}
                className={`btn btn-xs hanzi ${focus === s ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFocus(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="text-xs text-base-content/60">
            Each word deterministically picks its own palette and motion set, so the same
            word always shows the same character.
          </p>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Variety check</h2>
            <button className="btn btn-sm btn-outline btn-chunky gap-1" onClick={reroll}>
              <Shuffle className="w-4 h-4" /> Reroll
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {seeds.map(s => (
              <MascotStage key={s} seed={s} size={170} kind="saras" />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Creature (first pass, kept for comparison)</h2>
          <div className="grid grid-cols-2 gap-3">
            {SAMPLE_SEEDS.slice(0, 2).map(s => (
              <MascotStage key={s} seed={s} size={150} kind="creature" />
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">Sari palettes</h2>
          <div className="grid grid-cols-6 gap-2">
            {SARAS_PALETTES.map(p => (
              <div key={p.id} className="text-center">
                <div className="w-full aspect-square rounded-lg" style={{ background: p.sari }} />
                <span className="text-[10px] text-base-content/60">{p.name}</span>
              </div>
            ))}
          </div>
          <h2 className="font-semibold pt-2">Veena woods</h2>
          <div className="grid grid-cols-4 gap-2">
            {VEENA_TONES.map(t => (
              <div key={t.id} className="text-center">
                <div className="w-full h-8 rounded-lg" style={{ background: t.wood }} />
                <span className="text-[10px] text-base-content/60">{t.name}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-8 gap-2">
            {MASCOT_PALETTES.map(p => (
              <div key={p.id} className="text-center">
                <div className="w-full aspect-square rounded-lg" style={{ background: p.body }} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

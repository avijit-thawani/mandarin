// Palettes for Saras, the veena player.
//
// Deliberately not Duolingo's palette: that one is built around a white app with
// pastel fills, and a sari wants saturated, warm colour. These are drawn from
// common Indian textile pairings (marigold/saffron, indigo, kumkum red, parrot
// green, peacock teal), which also happen to satisfy Duolingo's "be as playful
// as you'd like, but keep it to a few colours" guidance.

export interface SarasPalette {
  id: string;
  name: string;
  sari: string;
  sariShade: string; // drape/pleats, a step darker
  blouse: string;
  skin: string;
  skinShade: string;
  hair: string;
  gold: string; // jewellery, border, bindi
  veena: string;
  veenaShade: string;
}

const HAIR = '#241C1C';
const GOLD = '#F0A500';

export const SARAS_PALETTES: SarasPalette[] = [
  {
    id: 'marigold',
    name: 'Marigold',
    sari: '#FF9600',
    sariShade: '#E07B00',
    blouse: '#D62828',
    skin: '#C68642',
    skinShade: '#A96C31',
    hair: HAIR,
    gold: GOLD,
    veena: '#A56644',
    veenaShade: '#7C4A30',
  },
  {
    id: 'peacock',
    name: 'Peacock',
    sari: '#1B9AAA',
    sariShade: '#137A87',
    blouse: '#F0A500',
    skin: '#B87333',
    skinShade: '#96591F',
    hair: HAIR,
    gold: GOLD,
    veena: '#A56644',
    veenaShade: '#7C4A30',
  },
  {
    id: 'kumkum',
    name: 'Kumkum',
    sari: '#D62828',
    sariShade: '#A81E1E',
    blouse: '#F0A500',
    skin: '#8D5524',
    skinShade: '#6F4019',
    hair: HAIR,
    gold: '#FFD166',
    veena: '#8C5A3C',
    veenaShade: '#67402A',
  },
  {
    id: 'indigo',
    name: 'Indigo',
    sari: '#3F51B5',
    sariShade: '#2C3A8C',
    blouse: '#FF6F91',
    skin: '#C68642',
    skinShade: '#A96C31',
    hair: HAIR,
    gold: GOLD,
    veena: '#A56644',
    veenaShade: '#7C4A30',
  },
  {
    id: 'parrot',
    name: 'Parrot',
    sari: '#4CAF50',
    sariShade: '#388E3C',
    blouse: '#FF6F91',
    skin: '#8D5524',
    skinShade: '#6F4019',
    hair: HAIR,
    gold: GOLD,
    veena: '#A56644',
    veenaShade: '#7C4A30',
  },
  {
    id: 'lotus',
    name: 'Lotus',
    sari: '#FF6F91',
    sariShade: '#D94C71',
    blouse: '#7B2CBF',
    skin: '#C68642',
    skinShade: '#A96C31',
    hair: HAIR,
    gold: GOLD,
    veena: '#8C5A3C',
    veenaShade: '#67402A',
  },
];

export function sarasPaletteById(id: string): SarasPalette {
  return SARAS_PALETTES.find(p => p.id === id) ?? SARAS_PALETTES[0];
}

/** Veena wood tone, picked independently of the sari so the two axes multiply.
 *  Real veenas are carved from jackfruit wood, which ranges from pale honey to
 *  a deep reddish brown depending on age and finish — so these stay within a
 *  believable range rather than going for colour contrast. */
export interface VeenaTone {
  id: string;
  name: string;
  wood: string;
  woodShade: string;
}

export const VEENA_TONES: VeenaTone[] = [
  { id: 'honey', name: 'Honey', wood: '#D9A05B', woodShade: '#A9713A' },
  { id: 'jackfruit', name: 'Jackfruit', wood: '#C08552', woodShade: '#8C5A3C' },
  { id: 'chestnut', name: 'Chestnut', wood: '#A56644', woodShade: '#7C4A30' },
  { id: 'rosewood', name: 'Rosewood', wood: '#84503A', woodShade: '#57321F' },
];

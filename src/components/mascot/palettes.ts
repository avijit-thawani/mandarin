// Mascot palettes.
//
// Colours are Duolingo's published names/hexes (design.duolingo.com/identity/color
// and /illustration). Their guidance we follow here:
//   - keep an illustration to a few colours, or it stops reading at small sizes
//   - never use grey for the body: "it appears lifeless and cold"
//   - shadows only on a base darker than the object, never lighter
//
// One geometry + many palettes is the cheapest axis of variety we have: the same
// 15 shapes read as a different creature entirely once recoloured.

export interface MascotPalette {
  id: string;
  name: string;
  body: string;
  bodyShade: string; // ears/limbs, a step darker so they read as behind
  belly: string;
  face: string; // muzzle + inner ear
  eye: string;
  blush: string;
}

export const MASCOT_PALETTES: MascotPalette[] = [
  {
    id: 'owl',
    name: 'Owl',
    body: '#58CC02', // Feather Green
    bodyShade: '#58A700', // Tree Frog
    belly: '#D7FFB8', // Sea Sponge
    face: '#FFC800', // Bee
    eye: '#4B4B4B', // Eel
    blush: '#89E219', // Mask Green
  },
  {
    id: 'macaw',
    name: 'Macaw',
    body: '#1CB0F6',
    bodyShade: '#1899D6', // Whale
    belly: '#DDF4FF', // Iguana
    face: '#FFC800',
    eye: '#4B4B4B',
    blush: '#84D8FF', // Blue Jay
  },
  {
    id: 'fox',
    name: 'Fox',
    body: '#FF9600', // Fox
    bodyShade: '#E7A601', // Camel
    belly: '#FFF5D3', // Canary
    face: '#FFB100', // Lion
    eye: '#4B4B4B',
    blush: '#FFCE8E', // Cheetah
  },
  {
    id: 'beetle',
    name: 'Beetle',
    body: '#CE82FF', // Beetle
    bodyShade: '#9069CD', // Betta
    belly: '#FFAADE', // Starfish
    face: '#FFB2B2', // Flamingo
    eye: '#4B4B4B',
    blush: '#FFAADE',
  },
  {
    id: 'crab',
    name: 'Crab',
    body: '#FF7878', // Crab
    bodyShade: '#EA2B2B', // Fire Ant
    belly: '#FFDFE0', // Walking Fish
    face: '#FFC800',
    eye: '#4B4B4B',
    blush: '#FFB2B2',
  },
  {
    id: 'narwhal',
    name: 'Narwhal',
    body: '#2B70C9', // Humpback
    bodyShade: '#1453A3', // Narwhal
    belly: '#BBF2FF', // Beluga
    face: '#7AF0F2', // Moon Jelly
    eye: '#4B4B4B',
    blush: '#84D8FF',
  },
  {
    id: 'turtle',
    name: 'Turtle',
    body: '#A5ED6E', // Turtle
    bodyShade: '#58A700',
    belly: '#FFF5D3',
    face: '#FFC800',
    eye: '#4B4B4B',
    blush: '#D7FFB8',
  },
  {
    id: 'grizzly',
    name: 'Grizzly',
    body: '#A56644', // Grizzly
    bodyShade: '#CD7900', // Guinea Pig
    belly: '#EBE3E3', // Squid
    face: '#E5A259', // Monkey
    eye: '#4B4B4B',
    blush: '#F5A4A4', // Pig
  },
];

export function paletteById(id: string): MascotPalette {
  return MASCOT_PALETTES.find(p => p.id === id) ?? MASCOT_PALETTES[0];
}

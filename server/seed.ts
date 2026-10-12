import type { Rule, WardrobeItem } from './types.js'

const now = () => new Date().toISOString()

export const SEED_WARDROBE: WardrobeItem[] = [
  { _id: 'taupe-blazer', name: 'Taupe Cotton Blazer', category: 'outer', color: 'taupe', tags: ['tailored', 'office', 'neutral'], timesWorn: 6 },
  { _id: 'black-leather-blazer', name: 'Black Leather Blazer', category: 'outer', color: 'black', tags: ['statement', 'evening', 'bold'], timesWorn: 3 },
  { _id: 'denim-jacket', name: 'Vintage Denim Jacket', category: 'outer', color: 'blue', tags: ['casual', 'vintage', 'layering'], timesWorn: 9 },
  { _id: 'white-oxford', name: 'White Oxford Shirt', category: 'top', color: 'white', tags: ['crisp', 'office', 'neutral'], timesWorn: 11 },
  { _id: 'cream-knit', name: 'Cream Cable Knit', category: 'top', color: 'cream', tags: ['soft', 'cozy', 'date'], timesWorn: 7 },
  { _id: 'black-tank', name: 'Black Ribbed Tank', category: 'top', color: 'black', tags: ['minimal', 'evening', 'layering'], timesWorn: 5 },
  { _id: 'rust-silk-blouse', name: 'Rust Silk Blouse', category: 'top', color: 'rust', tags: ['bold', 'date', 'texture'], timesWorn: 2 },
  { _id: 'grey-tee', name: 'Heather Grey Tee', category: 'top', color: 'grey', tags: ['casual', 'weekend', 'chill'], timesWorn: 14 },
  { _id: 'navy-trousers', name: 'Navy Tailored Trousers', category: 'bottom', color: 'navy', tags: ['tailored', 'office'], timesWorn: 8 },
  { _id: 'light-jeans', name: 'Light Wash Jeans', category: 'bottom', color: 'light blue', tags: ['casual', 'weekend', 'date'], timesWorn: 12 },
  { _id: 'black-trousers', name: 'Tailored Black Trousers', category: 'bottom', color: 'black', tags: ['sharp', 'evening', 'event'], timesWorn: 4 },
  { _id: 'olive-cargo', name: 'Olive Cargo Pants', category: 'bottom', color: 'olive', tags: ['utility', 'weekend', 'chill'], timesWorn: 3 },
  { _id: 'brown-loafers', name: 'Brown Leather Loafers', category: 'shoes', color: 'brown', tags: ['polished', 'office'], timesWorn: 10 },
  { _id: 'heeled-boots', name: 'Black Heeled Boots', category: 'shoes', color: 'black', tags: ['bold', 'evening', 'event'], timesWorn: 4 },
  { _id: 'white-sneakers', name: 'White Leather Sneakers', category: 'shoes', color: 'white', tags: ['casual', 'weekend', 'friends'], timesWorn: 18 },
  { _id: 'brown-shoulder-bag', name: 'Brown Shoulder Bag', category: 'bag', color: 'brown', tags: ['soft', 'date', 'everyday'], timesWorn: 9 },
  { _id: 'gold-hoops', name: 'Gold Hoops', category: 'accessory', color: 'gold', tags: ['bold', 'date', 'event'], timesWorn: 6 },
  { _id: 'camel-trench', name: 'Camel Trench Coat', category: 'outer', color: 'camel', tags: ['classic', 'office', 'confident', 'sharp'], timesWorn: 7 },
  { _id: 'oversized-cardigan', name: 'Oatmeal Oversized Cardigan', category: 'outer', color: 'oatmeal', tags: ['cozy', 'weekend', 'chill', 'soft'], timesWorn: 10 },
  { _id: 'emerald-satin-top', name: 'Emerald Satin Cami', category: 'top', color: 'emerald', tags: ['bold', 'event', 'date', 'evening'], timesWorn: 2 },
  { _id: 'striped-breton', name: 'Navy Breton Stripe Tee', category: 'top', color: 'navy/white', tags: ['casual', 'friends', 'weekend', 'chill'], timesWorn: 9 },
  { _id: 'charcoal-turtleneck', name: 'Charcoal Merino Turtleneck', category: 'top', color: 'charcoal', tags: ['sharp', 'office', 'confident', 'minimal'], timesWorn: 6 },
  { _id: 'grey-hoodie', name: 'Soft Grey Hoodie', category: 'top', color: 'grey', tags: ['cozy', 'weekend', 'chill'], timesWorn: 15 },
  { _id: 'pleated-midi', name: 'Champagne Pleated Midi Skirt', category: 'bottom', color: 'champagne', tags: ['date', 'event', 'soft', 'confident'], timesWorn: 3 },
  { _id: 'wide-leg-linen', name: 'Ivory Wide-Leg Linen Pants', category: 'bottom', color: 'ivory', tags: ['chill', 'weekend', 'friends', 'light'], timesWorn: 5 },
  { _id: 'knit-joggers', name: 'Charcoal Knit Joggers', category: 'bottom', color: 'charcoal', tags: ['cozy', 'weekend', 'chill'], timesWorn: 11 },
  { _id: 'chelsea-boots', name: 'Tan Suede Chelsea Boots', category: 'shoes', color: 'tan', tags: ['friends', 'weekend', 'vintage', 'cozy'], timesWorn: 8 },
  { _id: 'strappy-sandals', name: 'Gold Strappy Sandals', category: 'shoes', color: 'gold', tags: ['date', 'event', 'bold'], timesWorn: 3 },
  { _id: 'black-crossbody', name: 'Black Leather Crossbody', category: 'bag', color: 'black', tags: ['sharp', 'office', 'friends', 'minimal'], timesWorn: 12 },
  { _id: 'silk-scarf', name: 'Printed Silk Scarf', category: 'accessory', color: 'multi', tags: ['confident', 'office', 'date', 'texture'], timesWorn: 4 },
]

export const SEED_RULES: Rule[] = [
  { _id: 'r-bold-confident', text: 'Bold colors only when mood is Confident or Bold', applies: 'All occasions', weight: 0.6, status: 'active', origin: 'seed', version: 1, updatedAt: now() },
  { _id: 'r-structure-softness', text: 'Balance one structured piece with one soft piece', applies: 'Office, Events', weight: 0.5, status: 'active', origin: 'seed', version: 1, updatedAt: now() },
  { _id: 'r-vintage-layers', text: 'When the vibe is vintage, lean into texture and layers', applies: 'Weekend, Friends', weight: 0.4, status: 'active', origin: 'seed', version: 1, updatedAt: now() },
]

// Unsplash pool for look cards: three distinct photos per mood.
const P = {
  checkSuit: 'photo-1594938298603-c8148c4dae35',
  navySuit: 'photo-1507679799987-c73779587ccf',
  yellowSet: 'photo-1515886657613-9f3515b0c78f',
  redTee: 'photo-1529139574466-a303027c1d8b',
  blueCoat: 'photo-1539109136881-3be0616acf4b',
  stripeTrousers: 'photo-1509631179647-0177331693ae',
  creamKnit: 'photo-1434389677669-e08b4cac3105',
  pinkCoat: 'photo-1485462537746-965f33f7f6a7',
  rail: 'photo-1490481651871-ab68de25d43d',
}
export const MOOD_IMAGES: Record<string, string[]> = {
  Confident: [P.checkSuit, P.navySuit, P.pinkCoat],
  Chill: [P.yellowSet, P.creamKnit, P.rail],
  Bold: [P.redTee, P.stripeTrousers, P.blueCoat],
  Cozy: [P.creamKnit, P.pinkCoat, P.rail],
  Sharp: [P.navySuit, P.checkSuit, P.blueCoat],
}

const OCCASION_IMAGES: Record<string, string[]> = {
  Office: [P.navySuit, P.checkSuit, P.pinkCoat],
  Date: [P.pinkCoat, P.redTee, P.stripeTrousers],
  Friends: [P.yellowSet, P.redTee, P.blueCoat],
  Weekend: [P.creamKnit, P.yellowSet, P.rail],
  Event: [P.stripeTrousers, P.blueCoat, P.navySuit],
}

// Three distinct photos per request, drawn from the mood's and the occasion's
// pools so changing either chip changes the cards.
export function imagesFor(mood: string, occasion: string): string[] {
  const pool = [...new Set([...(MOOD_IMAGES[mood] ?? MOOD_IMAGES.Bold), ...(OCCASION_IMAGES[occasion] ?? [])])]
  const shift = Math.max(Object.keys(OCCASION_IMAGES).indexOf(occasion), 0) % pool.length
  return [...pool.slice(shift), ...pool.slice(0, shift)].slice(0, 3).map(id => `https://images.unsplash.com/${id}?w=400&h=500&fit=crop`)
}

// Fictional designs inspired by recognisable telephone construction, not exact
// historical models. Salted hashes keep each attribute independent and stable.
export const PHONE_COLOURS = [
  { id: 'black', name: 'Schwarz', hex: '#202624' },
  { id: 'ivory', name: 'Elfenbein', hex: '#ded4b4' },
  { id: 'wine', name: 'Bordeaux', hex: '#7b3042' },
  { id: 'forest', name: 'Tannengrün', hex: '#315f50' },
  { id: 'brown', name: 'Kaffeebraun', hex: '#684837' },
  { id: 'mint', name: 'Mintgrün', hex: '#9bbfad' },
  { id: 'blue', name: 'Taubenblau', hex: '#7197b3' },
  { id: 'red', name: 'Signalrot', hex: '#ba4334' },
  { id: 'orange', name: 'Orange', hex: '#d88036' },
  { id: 'mustard', name: 'Senfgelb', hex: '#c6ad49' },
  { id: 'grey', name: 'Kieselgrau', hex: '#929a93' },
  { id: 'white', name: 'Porzellanweiß', hex: '#e6e8db' },
];
const heritage = ['black', 'ivory', 'wine', 'forest', 'brown'];
const pastel = [...heritage, 'mint', 'blue', 'red'];
const modern = PHONE_COLOURS.map(c => c.id);
const utilitarian = ['black', 'forest', 'red', 'mustard', 'grey'];
export const PHONE_MODELS = [
  ['bell', 'Glockenförmiger Tischapparat', 'desk', heritage],
  ['box', 'Kantiger Bakelitapparat', 'desk', heritage],
  ['compact', 'Kleiner Tischapparat', 'desk', pastel],
  ['streamline', 'Stromlinienapparat', 'desk', pastel],
  ['oval', 'Ovaler Salonapparat', 'desk', pastel],
  ['disc', 'Runder Scheibenapparat', 'desk', modern],
  ['pyramid', 'Pyramidenapparat', 'desk', heritage],
  ['deco', 'Gestufter Art-déco-Apparat', 'desk', heritage],
  ['candlestick', 'Säulentelefon mit Hörmuschel', 'desk', ['black', 'brown']],
  ['swan', 'Schwanenhalsapparat', 'desk', heritage],
  ['tower', 'Hoher Pultapparat', 'desk', pastel],
  ['skeleton', 'Offener Rahmenapparat', 'desk', ['black', 'brown', 'ivory']],
  ['monobloc', 'Einteiliger Standhörer', 'desk', modern],
  ['slim', 'Schmaler Liegehörer', 'desk', modern],
  ['hotel', 'Hotelapparat mit Servicetasten', 'desk', pastel],
  ['multiline', 'Mehrleitungs-Pultapparat', 'desk', heritage],
  ['keypad', 'Kompakter Tastenapparat', 'desk', modern],
  ['office', 'Breiter Büro-Tastenapparat', 'desk', modern],
  ['woodwall', 'Hölzerner Wandkasten', 'wall', ['black', 'brown']],
  ['walloval', 'Ovaler Wandapparat', 'wall', pastel],
  ['wallflat', 'Flacher Wandapparat', 'wall', modern],
  ['wallwedge', 'Wandpult mit schräger Front', 'wall', utilitarian],
  ['twinbell', 'Wandapparat mit Außenglocken', 'wall', heritage],
  ['industrial', 'Geschützter Industrieapparat', 'wall', utilitarian],
  ['coin', 'Dreischlitz-Münzfernsprecher', 'public', utilitarian],
  ['payphone', 'Kompakter Münzfernsprecher', 'public', modern],
].map(([id, name, mount, colours]) => ({ id, name, mount, colours }));
export const PHONE_SETTINGS = [
  ['writing', 'Schreibtisch', 'desk'], ['side', 'Beistelltisch', 'desk'],
  ['night', 'Nachttisch', 'desk'], ['bar', 'Bartresen', 'desk'],
  ['reception', 'Empfangstresen', 'desk'], ['workbench', 'Werkbank', 'desk'],
  ['cafe', 'Cafétisch', 'desk'], ['console', 'Flurkonsole', 'desk'],
  ['cabinet', 'Sideboard', 'desk'], ['pedestal', 'Telefonsäule', 'desk'],
  ['plaster', 'Verputzte Wand', 'wall'], ['panel', 'Holzvertäfelung', 'wall'],
  ['tiles', 'Gekachelte Wand', 'wall'], ['brick', 'Backsteinwand', 'wall'],
  ['booth', 'Verglaste Telefonzelle', 'public'], ['hood', 'Offene Telefonhaube', 'public'],
  ['station', 'Bahnhofs-Wandnische', 'public'], ['kiosk', 'Telefonkabine mit Seitenscheiben', 'public'],
].map(([id, name, mount]) => ({ id, name, mount }));
export const FURNITURE_FINISHES = [
  { name: 'Eiche', wood: '#a67d4c', trim: '#514536', fabric: '#58766c' },
  { name: 'Nussbaum', wood: '#654836', trim: '#322c25', fabric: '#7d4b45' },
  { name: 'Teak', wood: '#b07749', trim: '#59432e', fabric: '#537986' },
  { name: 'Helle Birke', wood: '#d4b881', trim: '#78684f', fabric: '#9a8062' },
  { name: 'Dunkle Eiche', wood: '#514b36', trim: '#2d342d', fabric: '#8b7d4d' },
];
export function numberHash(number, salt) {
  let n = 2166136261;
  for (const ch of `${salt}:${number}`) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  n ^= n >>> 16; n = Math.imul(n, 0x7feb352d); n ^= n >>> 15;
  n = Math.imul(n, 0x846ca68b); return (n ^ (n >>> 16)) >>> 0;
}
export function subscriberAppearance(number) {
  if (!/^[1-9]\d{5}$/.test(number)) throw new Error('Apparat braucht eine sechsstellige Ortsrufnummer');
  const model = PHONE_MODELS[numberHash(number, 'form') % PHONE_MODELS.length];
  const colourId = model.colours[numberHash(number, 'colour') % model.colours.length];
  const colour = PHONE_COLOURS.find(c => c.id === colourId);
  const settings = PHONE_SETTINGS.filter(s => s.mount === model.mount);
  const setting = settings[numberHash(number, 'setting') % settings.length];
  const finish = FURNITURE_FINISHES[numberHash(number, 'finish') % FURNITURE_FINISHES.length];
  // Keep enough space for the largest booth at the edge and around the tapes.
  let x = -605 + numberHash(number, 'x') / 0xffffffff * 1210;
  const z = -1075 + numberHash(number, 'z') / 0xffffffff * 1120;
  if (Math.abs(x) < 22 && Math.abs(z + 510) < 24) x += 50;
  return { number, model, colour, setting, finish, planPosition: [x, z],
    yaw: (numberHash(number, 'direction') % 8) * Math.PI / 4,
    accessory: numberHash(number, 'accessory') % 3 };
}
// Real dialable examples, derived through the same mapping as every other number.
export function subscriberExamples() {
  const examples = new Map();
  for (let n = 300000; examples.size < PHONE_MODELS.length && n < 310000; n++) {
    const profile = subscriberAppearance(String(n));
    if (profile.model.id === 'coin' && profile.setting.id !== 'booth') continue;
    if (profile.model.id === 'payphone' && profile.setting.id !== 'kiosk') continue;
    if (!examples.has(profile.model.id)) examples.set(profile.model.id, profile);
  }
  return PHONE_MODELS.map(model => examples.get(model.id));
}

/** Public location catalogue. Load only the selected scene's configuration. */
export const locations = [
  {
    slug: 'vosskuhle', number: '01', name: 'Voßkuhle', city: 'Dortmund',
    roads: 'Westfalendamm × Voßkuhle / Semmerteichstraße',
    description: 'Die Stadtbahn in der Mitte. Die B1 im Wechsel mit den Nebenstraßen. Eine Kreuzung mit eigenem Rhythmus.',
    features: ['Versetzte Grünphasen', 'Stadtbahn U47', 'Wendefahrten'],
    load: async () => (await import('./dortmund.mjs')).default,
  },
  {
    slug: 'opphoff', number: '02', name: 'Opphoff', city: 'Dortmund',
    roads: 'Märkische Straße × Seitenarme des Westfalendamms',
    description: 'Über der B1 treffen die Seitenarme auf die Märkische Straße. Mit Mittelampeln und eigenen Wegen für Rechtsabbieger.',
    features: ['11 Ampelstandorte', '3 Rechtsabbiegespuren', 'Ohne Straßenbahn'],
    load: async () => (await import('./opphoff.mjs')).default,
  },
];

export const getLocation = slug => locations.find(location => location.slug === slug);
export const simulationUrl = slug => `simulation.html?location=${encodeURIComponent(slug)}`;

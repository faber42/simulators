/**
 * Civil-time helpers for the simulation. All functions depend only on their
 * arguments; they never read or advance the real clock. Times are epoch ms,
 * schedule boundaries are local minutes after midnight, and angles are radians.
 * Traffic demand and daylight hours are editable model assumptions, not measured
 * traffic counts, an official timetable, or an astronomical calculation.
 */
export const DEFAULT_TIME_ZONE = 'Europe/Berlin';

const formatters = new Map();
const offsetCache = new Map();
const DAY_MS = 86_400_000;
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const pad = value => String(value).padStart(2, '0');
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

function checkEpoch(epochMs) {
  if (!Number.isFinite(epochMs) || Math.abs(epochMs) > 8.64e15) {
    throw new RangeError('A finite, representable epoch timestamp is required.');
  }
}

function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }));
  }
  return formatters.get(timeZone);
}

function partsAt(epochMs, timeZone) {
  const result = {};
  for (const part of formatter(timeZone).formatToParts(epochMs)) {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
  }
  return result;
}

// Date.UTC treats years 0..99 as 1900..1999; setUTCFullYear does not.
function utcOf({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 }) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  return date.getTime();
}

function dateOf(parts) {
  return `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** weekday follows JS convention: 0 = Sunday, 6 = Saturday. */
export function getLocalTime(epochMs, timeZone = DEFAULT_TIME_ZONE) {
  checkEpoch(epochMs);
  const parts = partsAt(epochMs, timeZone);
  const weekday = new Date(utcOf(parts)).getUTCDay();
  const date = dateOf(parts);
  const time = `${pad(parts.hour)}:${pad(parts.minute)}`;
  return { ...parts, weekday, date, time,
    label: `${WEEKDAYS[weekday]}, ${pad(parts.day)}.${pad(parts.month)}.${parts.year} · ${time}` };
}

function parseLocal(dateString, timeString) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(timeString);
  if (!dateMatch || !timeMatch) throw new RangeError('Use YYYY-MM-DD and HH:mm[:ss[.SSS]].');
  const parts = {
    year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]), minute: Number(timeMatch[2]), second: Number(timeMatch[3] || 0),
    millisecond: Number((timeMatch[4] || '').padEnd(3, '0')),
  };
  const date = new Date(utcOf(parts));
  if (parts.year < 1 || date.getUTCFullYear() !== parts.year || date.getUTCMonth() + 1 !== parts.month
      || date.getUTCDate() !== parts.day || parts.hour > 23 || parts.minute > 59 || parts.second > 59) {
    throw new RangeError('Invalid local calendar date or clock time.');
  }
  return parts;
}

function offsetsFor(parts, timeZone) {
  const key = `${timeZone}:${dateOf(parts)}`;
  if (!offsetCache.has(key)) {
    const noon = utcOf({ ...parts, hour: 12, minute: 0, second: 0, millisecond: 0 });
    const offsets = new Set();
    // Include either side of a DST/date-line transition near this civil date.
    for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
      const instant = noon + hours * 3_600_000;
      offsets.add(utcOf(partsAt(instant, timeZone)) - instant);
    }
    if (offsetCache.size >= 512) offsetCache.delete(offsetCache.keys().next().value);
    offsetCache.set(key, [...offsets]);
  }
  return offsetCache.get(key);
}

function possibleEpochs(parts, timeZone) {
  const wallTime = utcOf(parts);
  return offsetsFor(parts, timeZone).map(offset => wallTime - offset).filter(epoch => {
    const actual = partsAt(epoch, timeZone);
    return ['year', 'month', 'day', 'hour', 'minute', 'second'].every(key => actual[key] === parts[key]);
  }).sort((a, b) => a - b);
}

/**
 * Convert datetime-local fields without relying on the computer's own timezone.
 * A spring-forward gap throws RangeError. A repeated autumn time selects the
 * earlier occurrence; this deterministic choice also applies to UI edits.
 */
export function localDateTimeToEpoch(dateString, timeString, timeZone = DEFAULT_TIME_ZONE) {
  const matches = possibleEpochs(parseLocal(dateString, timeString), timeZone);
  if (!matches.length) throw new RangeError('This local time does not exist because the clocks change.');
  return matches[0];
}

/**
 * First daily departure >= epochMs. serviceEnd is exclusive. minuteOffset is a
 * congruence relative to local midnight: offset 9 with a 20-minute Sunday period
 * gives :09/:29/:49. A caller seeking the subsequent trip passes previous + 1.
 * If service covers a DST gap, nonexistent departures are skipped; a repeated
 * local departure occurs once, at its earlier occurrence.
 */
export function nextTramDeparture(epochMs, schedule = {}, timeZone = DEFAULT_TIME_ZONE) {
  checkEpoch(epochMs);
  const { minuteOffset = 0, intervalMinutes = 10, sundayIntervalMinutes = 20,
    serviceStart = 300, serviceEnd = 1410 } = schedule;
  if (![minuteOffset, intervalMinutes, sundayIntervalMinutes, serviceStart, serviceEnd].every(Number.isInteger)
      || minuteOffset < 0 || intervalMinutes < 1 || sundayIntervalMinutes < 1
      || serviceStart < 0 || serviceEnd > 1440 || serviceStart >= serviceEnd) {
    throw new RangeError('Invalid daily tram schedule.');
  }
  const today = getLocalTime(epochMs, timeZone);
  const dateStart = utcOf({ year: today.year, month: today.month, day: today.day });
  // Eight dates cover every weekday and a skipped civil date at a zone change.
  for (let day = 0; day < 8; day++) {
    const date = new Date(dateStart + day * DAY_MS);
    const interval = date.getUTCDay() === 0 ? sundayIntervalMinutes : intervalMinutes;
    const first = minuteOffset + Math.ceil((serviceStart - minuteOffset) / interval) * interval;
    for (let minute = first; minute < serviceEnd; minute += interval) {
      const parts = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
        hour: Math.floor(minute / 60), minute: minute % 60, second: 0, millisecond: 0 };
      const departure = possibleEpochs(parts, timeZone)[0];
      if (departure >= epochMs) return departure;
    }
  }
  throw new RangeError('The tram schedule has no departure within a week.');
}

function interpolate(points, hour) {
  for (let i = 1; i < points.length; i++) {
    if (hour <= points[i][0]) {
      const [fromHour, fromValue] = points[i - 1], [toHour, toValue] = points[i];
      return fromValue + (toValue - fromValue) * smooth((hour - fromHour) / (toHour - fromHour));
    }
  }
  return points.at(-1)[1];
}

/** Arrival-demand multiplier; existing vehicles retain their physical speed. */
export function getTrafficProfile(epochMs, timeZone = DEFAULT_TIME_ZONE) {
  const { weekday, hour, minute, second } = getLocalTime(epochMs, timeZone);
  const h = hour + minute / 60 + second / 3600;
  const night = weekday === 0 || weekday === 1 ? 0.02 : 0.04;
  let points, label;
  if (weekday === 0) {
    points = [[0, .02], [5, .02], [7, .1], [9, .3], [18, .3], [20, .18], [22, .05], [23, .02], [24, .02]];
    label = 'Sonntag · wenig Verkehr';
  } else if (weekday === 6) {
    points = [[0, .04], [5, .04], [7, .25], [9, .6], [18, .6], [20, .35], [22, .12], [23, .04], [24, .02]];
    label = 'Samstag · mäßiger Verkehr';
  } else {
    points = [[0, night], [5, night], [6, .35], [7, 1.55], [9, 1.55], [10, .9], [12, .8], [13, .9],
      [14, 1.65], [17, 1.65], [18, .85], [20, .5], [22, .12], [23, .04], [24, .04]];
    label = h >= 7 && h < 9 ? 'Berufsverkehr · Morgenspitze'
      : h >= 14 && h < 17 ? 'Berufsverkehr · Nachmittagsspitze' : 'Werktag · Normalverkehr';
  }
  if (h < 5 || h >= 23) {
    label = weekday === 1 && h < 5 ? 'Nacht Sonntag → Montag' : 'Nachtverkehr';
  }
  return { density: interpolate(points, h), label };
}

/**
 * Simple local daylight cycle, intentionally independent of season/location.
 * Dawn 06–08, daylight 08–18, dusk 18–20. Azimuth: 0 north, π/2 east;
 * elevation: radians above the horizon (negative at night).
 */
export function getLightingProfile(epochMs, timeZone = DEFAULT_TIME_ZONE) {
  const { hour, minute, second } = getLocalTime(epochMs, timeZone);
  const h = hour + minute / 60 + second / 3600;
  const daylight = smooth((h - 6) / 2) * (1 - smooth((h - 18) / 2));
  const warmth = Math.max(0, 1 - Math.abs(h - 7), 1 - Math.abs(h - 19));
  const azimuth = ((h / 24) * Math.PI * 2) % (Math.PI * 2);
  const elevation = Math.sin((h - 6) * Math.PI / 12) * Math.PI / 3;
  const label = h >= 6 && h < 8 ? 'Morgendämmerung' : h >= 8 && h < 18 ? 'Tageslicht'
    : h >= 18 && h < 20 ? 'Abenddämmerung' : 'Nacht';
  return { daylight, warmth, night: 1 - daylight, azimuth, elevation, label };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocalTime, localDateTimeToEpoch, nextTramDeparture,
  getTrafficProfile, getLightingProfile } from './time-model.mjs';

const local = (date, time, zone) => localDateTimeToEpoch(date, time, zone);
const schedule = { minuteOffset: 9, intervalMinutes: 10, sundayIntervalMinutes: 20,
  serviceStart: 300, serviceEnd: 1410 };

test('Berlin civil fields use the requested zone, Gregorian date and Sunday-zero weekday', () => {
  const time = getLocalTime(Date.parse('2026-10-03T22:05:42Z'));
  assert.equal(time.date, '2026-10-04');
  assert.equal(time.time, '00:05');
  assert.equal(time.weekday, 0);
  assert.equal(time.second, 42);
  assert.equal(getLocalTime(Date.parse('2026-10-03T22:05:42Z'), 'UTC').date, '2026-10-03');
  assert.equal(getLocalTime(Date.parse('2026-01-04T06:30:00Z')).hour, 7);
  assert.throws(() => getLocalTime(NaN), RangeError);
});

test('local UI conversion round trips, accepts optional seconds, and rejects invalid fields', () => {
  assert.equal(local('2026-10-03', '14:30'), Date.parse('2026-10-03T12:30:00Z'));
  assert.equal(local('2026-10-03', '14:30:25.12'), Date.parse('2026-10-03T12:30:25.120Z'));
  assert.equal(local('2026-10-03', '14:30', 'UTC'), Date.parse('2026-10-03T14:30:00Z'));
  for (const [date, time] of [['2026-02-30', '12:00'], ['2026-10-03', '24:00'],
    ['2026-10-03', '12:60'], ['03.10.2026', '12:00'], ['2026-10-03', '1:00']]) {
    assert.throws(() => local(date, time), RangeError);
  }
});

test('spring DST gap is rejected and autumn repeated time selects its earlier instance', () => {
  assert.throws(() => local('2026-03-29', '02:30'), RangeError);
  assert.equal(local('2026-03-29', '03:30'), Date.parse('2026-03-29T01:30:00Z'));
  assert.equal(local('2026-10-25', '02:30'), Date.parse('2026-10-25T00:30:00Z'));
  assert.equal(getLocalTime(Date.parse('2026-10-25T01:30:00Z')).time, '02:30');
});

test('weekday departures use minute offset, inclusive lookup and exclusive end of service', () => {
  const first = nextTramDeparture(local('2026-10-05', '04:00'), schedule);
  assert.equal(first, local('2026-10-05', '05:09'));
  assert.equal(nextTramDeparture(first, schedule), first);
  assert.equal(nextTramDeparture(first + 1, schedule), local('2026-10-05', '05:19'));
  assert.equal(nextTramDeparture(local('2026-10-05', '23:20'), schedule), local('2026-10-05', '23:29'));
  assert.equal(nextTramDeparture(local('2026-10-05', '23:29') + 1, schedule), local('2026-10-06', '05:09'));
  assert.equal(nextTramDeparture(local('2026-10-05', '23:30'), { ...schedule, minuteOffset: 0 }),
    local('2026-10-06', '05:00'));
});

test('Sunday cadence supports both directions and changes back at the next civil day', () => {
  assert.equal(nextTramDeparture(local('2026-10-04', '05:10'), schedule), local('2026-10-04', '05:29'));
  assert.equal(nextTramDeparture(local('2026-10-04', '05:30'), schedule), local('2026-10-04', '05:49'));
  assert.equal(nextTramDeparture(local('2026-10-04', '05:03'), { ...schedule, minuteOffset: 2 }),
    local('2026-10-04', '05:22'));
  assert.equal(nextTramDeparture(local('2026-10-03', '23:29') + 1, schedule), local('2026-10-04', '05:09'));
  assert.equal(nextTramDeparture(local('2026-10-04', '23:29') + 1, schedule), local('2026-10-05', '05:09'));
  assert.equal(nextTramDeparture(local('2026-10-05', '05:10'), schedule), local('2026-10-05', '05:19'));
});

test('tram service survives both DST nights without drifting its local departure minute', () => {
  assert.equal(nextTramDeparture(local('2026-03-28', '23:40'), schedule), Date.parse('2026-03-29T03:09:00Z'));
  assert.equal(nextTramDeparture(local('2026-10-24', '23:40'), schedule), Date.parse('2026-10-25T04:09:00Z'));
  const early = { ...schedule, serviceStart: 120, serviceEnd: 240 };
  assert.equal(nextTramDeparture(local('2026-03-29', '01:59'), early), local('2026-03-29', '03:09'));
  const repeated = local('2026-10-25', '02:09');
  assert.equal(nextTramDeparture(repeated + 1, early), local('2026-10-25', '02:29'));
  assert.throws(() => nextTramDeparture(repeated, { ...schedule, intervalMinutes: 0 }), RangeError);
});

test('traffic profiles reflect weekday peaks, quiet weekends and the Sunday–Monday night', () => {
  const density = (date, time) => getTrafficProfile(local(date, time)).density;
  assert.equal(density('2026-10-05', '08:00'), 1.55);
  assert.equal(density('2026-10-05', '15:30'), 1.65);
  assert.equal(density('2026-10-05', '12:00'), .8);
  assert.equal(density('2026-10-03', '12:00'), .6);
  assert.equal(density('2026-10-04', '12:00'), .3);
  assert.equal(density('2026-10-06', '02:00'), .04);
  assert.equal(density('2026-10-05', '02:00'), .02);
  assert.equal(density('2026-10-04', '23:30'), .02);
  const before = density('2026-10-05', '06:59:59'), after = density('2026-10-05', '07:00:01');
  assert.ok(Math.abs(after - before) < .001, 'rush-hour boundary must be continuous');
});

test('lighting profiles provide smooth dawn/dusk and renderer angles in radians', () => {
  const light = time => getLightingProfile(local('2026-10-05', time));
  assert.equal(light('02:00').daylight, 0);
  assert.equal(light('07:00').daylight, .5);
  assert.equal(light('12:00').daylight, 1);
  assert.equal(light('19:00').daylight, .5);
  assert.equal(light('20:00').night, 1);
  assert.equal(light('07:00').warmth, 1);
  assert.equal(light('12:00').warmth, 0);
  assert.equal(light('06:00').azimuth, Math.PI / 2);
  assert.equal(light('12:00').azimuth, Math.PI);
  assert.equal(light('12:00').elevation, Math.PI / 3);
  assert.ok(light('02:00').elevation < 0);
  for (let hour = 0; hour < 24; hour++) {
    const profile = light(`${String(hour).padStart(2, '0')}:30`);
    for (const key of ['daylight', 'warmth', 'night']) assert.ok(profile[key] >= 0 && profile[key] <= 1);
  }
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./helpers/database.cjs');
const { getActivityDateRange } = loadSource('src/utils/activityDates.ts');
const { ValidationError } = loadSource('src/utils/errors.ts');

function useTimezone(t, timezone) {
  const previous = process.env.TZ;
  process.env.TZ = timezone;
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}

test('All time does not constrain history', () => {
  assert.deepEqual(getActivityDateRange({ preset: 'all' }), {});
});

test('Today and This month use Beirut local calendar boundaries', (t) => {
  useTimezone(t, 'Asia/Beirut');
  const now = new Date('2026-09-02T20:00:00.000Z');
  assert.deepEqual(getActivityDateRange({ preset: 'today' }, now), {
    startIso: '2026-09-01T21:00:00.000Z', endIso: '2026-09-02T21:00:00.000Z',
  });
  assert.deepEqual(getActivityDateRange({ preset: 'month' }, now), {
    startIso: '2026-08-31T21:00:00.000Z', endIso: '2026-09-30T21:00:00.000Z',
  });
});

test('custom ranges include the entire end date and handle leap years/year rollover', (t) => {
  useTimezone(t, 'UTC');
  assert.deepEqual(getActivityDateRange({ preset: 'custom', fromDate: '2024-02-29', toDate: '2024-02-29' }), {
    startIso: '2024-02-29T00:00:00.000Z', endIso: '2024-03-01T00:00:00.000Z',
  });
  assert.deepEqual(getActivityDateRange({ preset: 'month' }, new Date('2026-12-31T23:00:00.000Z')), {
    startIso: '2026-12-01T00:00:00.000Z', endIso: '2027-01-01T00:00:00.000Z',
  });
});

test('daylight-saving dates use 23/25-hour local days, not fixed 24-hour windows', (t) => {
  useTimezone(t, 'America/New_York');
  const spring = getActivityDateRange({ preset: 'custom', fromDate: '2026-03-08', toDate: '2026-03-08' });
  const fall = getActivityDateRange({ preset: 'custom', fromDate: '2026-11-01', toDate: '2026-11-01' });
  assert.equal((Date.parse(spring.endIso) - Date.parse(spring.startIso)) / 3600000, 23);
  assert.equal((Date.parse(fall.endIso) - Date.parse(fall.startIso)) / 3600000, 25);
});

test('invalid/incomplete calendar dates and reversed ranges are friendly validation errors', () => {
  for (const date of ['', '2026-2-02', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01',
    '2026-01-00', '0000-01-01', '9999-12-31', 'not-a-date']) {
    assert.throws(() => getActivityDateRange({ preset: 'custom', fromDate: date, toDate: date }), ValidationError);
  }
  assert.throws(() => getActivityDateRange({ preset: 'custom', fromDate: '2026-09-03', toDate: '2026-09-02' }), ValidationError);
  assert.throws(() => getActivityDateRange({ preset: 'custom', fromDate: '2026-09-02' }), ValidationError);
  assert.throws(() => getActivityDateRange({ preset: 'unknown' }), ValidationError);
});

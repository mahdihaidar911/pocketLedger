const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { setup, loadSource, createSourceLoader } = require('./helpers/database.cjs');
const { getAppearancePreference, setAppearancePreference, setRecurringRemindersEnabled, getRecurringRemindersEnabled } = loadSource('src/repositories/settingsRepository.ts');
const { createAccount } = loadSource('src/repositories/accountRepository.ts');
const { AppearanceController } = loadSource('src/services/appearanceController.ts');
const { resolveAppearance, isAppearancePreference } = loadSource('src/theme/appearance.ts');
const { lightColors, darkColors } = loadSource('src/theme/colors.ts');
const { ValidationError } = loadSource('src/utils/errors.ts');
const root = path.resolve(__dirname, '..');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(options = {}) {
  let stored = options.preference ?? 'system';
  const writes = [];
  const adapter = {
    read: options.read ?? (async () => stored),
    async write(preference) { if (options.write) await options.write(preference); writes.push(preference); stored = preference; },
  };
  return { controller: new AppearanceController(adapter), writes, adapter };
}

test('missing or invalid saved appearance defaults to System without a migration or write', async (t) => {
  const { db } = await setup(t);
  const before = await db.getAllAsync('SELECT * FROM app_settings');
  assert.equal(await getAppearancePreference(db), 'system');
  assert.deepEqual(await db.getAllAsync('SELECT * FROM app_settings'), before);
  await db.runAsync("INSERT INTO app_settings VALUES (?, ?, ?)", 'appearance_preference', 'unexpected', 'unchanged');
  assert.equal(await getAppearancePreference(db), 'system');
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 10);
});

test('all modes persist using one settings row and leave financial tables and reminders unchanged', async (t) => {
  const { db } = await setup(t);
  await createAccount(db, { name: 'Appearance test', currency: 'USD', type: 'cash', openingBalanceMinor: 1000 });
  await setRecurringRemindersEnabled(db, true);
  const tables = ['accounts', 'categories', 'transactions', 'transfers', 'savings_goals', 'monthly_budgets', 'recurring_payments', 'exchange_rates'];
  const snapshot = () => Promise.all(tables.map(table => db.getAllAsync(`SELECT * FROM ${table} ORDER BY 1`)));
  const before = await snapshot();
  const schema = await db.getAllAsync('SELECT name, sql FROM sqlite_master ORDER BY name');
  for (const mode of ['dark', 'light', 'system']) {
    await setAppearancePreference(db, mode);
    assert.equal(await getAppearancePreference(db), mode);
    assert.equal((await db.getAllAsync("SELECT * FROM app_settings WHERE key = 'appearance_preference'")).length, 1);
    assert.equal(await getRecurringRemindersEnabled(db), true);
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await db.getAllAsync('SELECT name, sql FROM sqlite_master ORDER BY name'), schema);
  }
});

test('invalid appearance values fail quietly without changing saved preferences', async (t) => {
  const { db } = await setup(t);
  await setAppearancePreference(db, 'dark');
  for (const value of ['', null, 'auto', 'DARK', "dark'; DROP TABLE accounts; --"]) {
    await assert.rejects(setAppearancePreference(db, value), ValidationError);
    assert.equal(await getAppearancePreference(db), 'dark');
  }
});

test('a SQLite update failure leaves the previous appearance intact', async (t) => {
  const { db } = await setup(t);
  await setAppearancePreference(db, 'dark');
  await db.execAsync("CREATE TRIGGER fail_appearance BEFORE UPDATE ON app_settings WHEN NEW.key = 'appearance_preference' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
  await assert.rejects(setAppearancePreference(db, 'light'), /synthetic failure/);
  assert.equal(await getAppearancePreference(db), 'dark');
});

test('System follows device changes; explicit modes ignore them and unknown OS values resolve safely', () => {
  assert.equal(resolveAppearance('system', 'light'), 'light');
  assert.equal(resolveAppearance('system', 'dark'), 'dark');
  for (const value of [null, undefined, 'unspecified']) assert.equal(resolveAppearance('system', value), 'light');
  for (const value of ['light', 'dark', null]) {
    assert.equal(resolveAppearance('light', value), 'light');
    assert.equal(resolveAppearance('dark', value), 'dark');
  }
  for (const value of ['system', 'light', 'dark']) assert.equal(isAppearancePreference(value), true);
  for (const value of [undefined, null, '', 1, 'auto']) assert.equal(isAppearancePreference(value), false);
});

test('initialization waits for storage, runs once, and cannot overwrite an early user save', async () => {
  const read = deferred(); let reads = 0;
  const native = harness({ read: () => { reads++; return read.promise; } });
  const first = native.controller.initialize();
  await native.controller.initialize(); await native.controller.setPreference('light');
  assert.equal(reads, 1); assert.equal(native.controller.getSnapshot().ready, false);
  assert.deepEqual(native.writes, []);
  read.resolve('dark'); await first;
  assert.equal(native.controller.getSnapshot().preference, 'dark');
  assert.equal(native.controller.getSnapshot().ready, true);
  await native.controller.initialize(); assert.equal(reads, 1);
});

test('successful changes publish after saving and survive a controller restart', async () => {
  const write = deferred(); const native = harness({ write: () => write.promise });
  await native.controller.initialize();
  const save = native.controller.setPreference('dark');
  assert.equal(native.controller.getSnapshot().saving, true);
  assert.equal(native.controller.getSnapshot().preference, 'system');
  write.resolve(); await save;
  assert.equal(native.controller.getSnapshot().preference, 'dark');
  assert.equal(native.controller.getSnapshot().saving, false);
  const restarted = new AppearanceController(native.adapter); await restarted.initialize();
  assert.equal(restarted.getSnapshot().preference, 'dark');
});

test('rapid or repeated selection performs one write and cannot race an earlier save', async () => {
  const write = deferred(); const native = harness({ write: () => write.promise });
  await native.controller.initialize();
  const first = native.controller.setPreference('dark');
  await native.controller.setPreference('light'); await native.controller.setPreference('dark');
  write.resolve(); await first; await native.controller.setPreference('dark');
  assert.deepEqual(native.writes, ['dark']);
  assert.equal(native.controller.getSnapshot().preference, 'dark');
});

test('failed saves retain the previous mode, show a friendly error, and allow retry', async () => {
  let fail = true;
  const native = harness({ preference: 'light', write: async () => { if (fail) throw new Error('storage failure'); } });
  await native.controller.initialize(); await native.controller.setPreference('dark');
  assert.equal(native.controller.getSnapshot().preference, 'light');
  assert.match(native.controller.getSnapshot().error, /Could not save/);
  assert.equal(native.controller.getSnapshot().saving, false);
  fail = false; await native.controller.setPreference('dark');
  assert.equal(native.controller.getSnapshot().preference, 'dark');
  assert.equal(native.controller.getSnapshot().error, null);
});

test('a read failure uses System without throwing and can recover by explicitly saving System', async () => {
  const native = harness({ read: async () => { throw new Error('read failure'); } });
  await native.controller.initialize();
  assert.equal(native.controller.getSnapshot().ready, true);
  assert.equal(native.controller.getSnapshot().preference, 'system');
  assert.match(native.controller.getSnapshot().error, /Could not load/);
  await native.controller.setPreference('system');
  assert.deepEqual(native.writes, ['system']);
  assert.equal(native.controller.getSnapshot().error, null);
});

test('invalid controller input is rejected and subscribers stop receiving updates after cleanup', async () => {
  const native = harness(); let updates = 0;
  const unsubscribe = native.controller.subscribe(() => updates++);
  await native.controller.initialize(); await native.controller.setPreference('invalid');
  assert.ok(updates > 0); assert.deepEqual(native.writes, []);
  assert.match(native.controller.getSnapshot().error, /Choose System/);
  unsubscribe(); const previous = updates;
  await native.controller.setPreference('dark'); assert.equal(updates, previous);
});

test('native mode switching clears the app override when returning to System and reads the current phone mode', () => {
  let device = 'light', override = 'unspecified', callback, removed = false;
  const calls = [];
  const Appearance = {
    setColorScheme(value) { calls.push(value); override = value; },
    getColorScheme() { return override === 'unspecified' ? device : override; },
    addChangeListener(listener) { callback = listener; return { remove() { removed = true; } }; },
  };
  const native = createSourceLoader({ 'react-native': { Appearance } })('src/services/nativeAppearanceService.ts');
  assert.equal(native.applyNativeAppearance('dark'), 'dark');
  assert.equal(native.applyNativeAppearance('system'), 'light');
  assert.equal(native.applyNativeAppearance('light'), 'light');
  device = 'dark'; assert.equal(native.applyNativeAppearance('system'), 'dark');
  assert.deepEqual(calls, ['dark', 'unspecified', 'light', 'unspecified']);
  let received; const subscription = native.subscribeNativeAppearance(value => { received = value; });
  device = 'light'; callback(); assert.equal(received, 'light');
  subscription.remove(); assert.equal(removed, true);
});

function contrast(a, b) {
  const luminance = (hex) => {
    const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('both palettes cover every token and keep essential text and button labels at least 4.5:1', () => {
  assert.deepEqual(Object.keys(lightColors).sort(), Object.keys(darkColors).sort());
  for (const [name, colors] of Object.entries({ light: lightColors, dark: darkColors })) {
    for (const background of ['background', 'surface', 'surfaceMuted', 'primarySoft', 'primarySelected']) {
      for (const foreground of ['text', 'textSecondary', 'textMuted', 'primary', 'income', 'expense', 'warning']) {
        assert.ok(contrast(colors[foreground], colors[background]) >= 4.5, `${name}: ${foreground} on ${background}`);
      }
    }
    for (const background of ['primarySolid', 'incomeSolid', 'expenseSolid']) {
      assert.ok(contrast(colors.textInverse, colors[background]) >= 4.5, `${name}: white labels on ${background}`);
    }
    assert.ok(contrast(colors.heroMuted, colors.surfaceDark) >= 4.5);
    for (const foreground of ['primary', 'income', 'expense', 'warning']) assert.ok(contrast(colors[foreground], colors.border) >= 3, `${name}: ${foreground} progress on track`);
  }
});

test('every UI color comes from a theme and every text input declares themed keyboard, cursor, and placeholder', () => {
  for (const directory of ['src/app', 'src/components']) {
    for (const relative of fs.readdirSync(path.join(root, directory), { recursive: true }).filter(name => name.endsWith('.tsx'))) {
      const filename = path.join(root, directory, relative), text = fs.readFileSync(filename, 'utf8');
      assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, filename);
      const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === 'TextInput') {
          const names = node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => attribute.name.getText(source));
          for (const required of ['keyboardAppearance', 'selectionColor', 'placeholderTextColor']) assert.ok(names.includes(required), `${filename}: ${required}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
});

test('appearance wraps the existing lock boundary without keying navigation by the current mode', () => {
  const layout = fs.readFileSync(path.join(root, 'src/app/_layout.tsx'), 'utf8');
  assert.match(layout, /<ThemeProvider>\s*<AppLockProvider>/);
  assert.match(layout, /<RootStack\s*\/>/);
  assert.match(layout, /name="settings\/appearance"/);
  assert.doesNotMatch(layout, /key=\{(?:scheme|preference)/);
  const provider = fs.readFileSync(path.join(root, 'src/theme/ThemeProvider.tsx'), 'utf8');
  assert.match(provider, /state.ready \? children/);
  assert.doesNotMatch(provider, /key=\{|setEnabled|unlock\(/);
});

test('the real Appearance page renders all three accessible choices and the matching status bar in each mode', () => {
  const { renderAppearancePreview } = require('./helpers/appearanceRender.cjs');
  for (const mode of ['light', 'dark']) {
    const html = renderAppearancePreview(mode);
    assert.match(html, /role="radiogroup"/);
    assert.equal((html.match(/role="radio"/g) ?? []).length, 3);
    assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1);
    assert.ok(html.includes(`${mode === 'dark' ? 'Dark' : 'Light'} appearance is active`));
    assert.ok(html.includes(`data-status-bar="${mode === 'dark' ? 'light' : 'dark'}"`));
  }
});

test('real budget cards and input forms render synthetic amounts and Unicode in both palettes', () => {
  const { renderAppearancePreview } = require('./helpers/appearanceRender.cjs');
  for (const mode of ['light', 'dark']) {
    const budget = renderAppearancePreview(mode, 'budget');
    assert.match(budget, /Groceries/); assert.match(budget, /75\.00 remaining/); assert.match(budget, /20\.00 over budget/);
    assert.match(renderAppearancePreview(mode, 'form'), /Café \+ قهوة/);
  }
});

test('the real lock screen renders in each palette and never renders its financial children', () => {
  const { renderAppearancePreview } = require('./helpers/appearanceRender.cjs');
  for (const mode of ['light', 'dark']) {
    const html = renderAppearancePreview(mode, 'locked');
    assert.match(html, /App locked/); assert.match(html, /Unlock/);
    assert.doesNotMatch(html, /PRIVATE FINANCIAL CONTENT/);
  }
});

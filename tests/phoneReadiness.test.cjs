const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { setup, loadSource, createSourceLoader } = require('./helpers/database.cjs');
const { renderAppearancePreview } = require('./helpers/appearanceRender.cjs');
const { getPhoneLayout } = loadSource('src/utils/phoneLayout.ts');
const { loadDashboard } = loadSource('src/services/dashboardService.ts');
const { createAccount } = loadSource('src/repositories/accountRepository.ts');
const { createTransaction } = loadSource('src/repositories/transactionRepository.ts');
const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('phone layout responds to narrow screens and larger text without capping font scaling', () => {
  assert.equal(getPhoneLayout(390, 1).compact, false);
  assert.equal(getPhoneLayout(320, 1).compact, true);
  assert.equal(getPhoneLayout(390, 2).compact, true);
  assert.equal(getPhoneLayout(390, 1).showTabLabels, true);
  assert.equal(getPhoneLayout(320, 1).showTabLabels, false);
  assert.equal(getPhoneLayout(390, 2).showTabLabels, false);
  assert.equal(getPhoneLayout(390, 2).summaryMinWidth, 300);
});

test('tab bar follows bottom safe inset and invalid font scale falls back safely', () => {
  for (const inset of [0, 8, 20, 34]) {
    const layout = getPhoneLayout(390, 1, inset);
    assert.equal(layout.tabBottomPadding, Math.max(8, inset));
    assert.ok(layout.tabBarHeight - layout.tabBottomPadding >= 56);
  }
  for (const scale of [NaN, Infinity, 0, -1]) assert.deepEqual(getPhoneLayout(390, scale), getPhoneLayout(390, 1));
});

test('shared screen uses one keyboard-inset strategy and leaves FlatList screens un-nested', () => {
  const screen = source('src/components/Screen.tsx');
  assert.match(screen, /automaticallyAdjustKeyboardInsets/);
  assert.match(screen, /keyboardShouldPersistTaps="handled"/);
  assert.match(screen, /keyboardDismissMode="on-drag"/);
  assert.doesNotMatch(screen, /KeyboardAvoidingView/);
  assert.match(screen, /bottomInset = true/);
  assert.match(screen, /\['top', 'left', 'right', 'bottom'\]/);
  const history = source('src/app/(tabs)/transactions.tsx');
  assert.match(history, /<Screen bottomInset=\{false\}>\s*<FlatList/);
  assert.match(history, /automaticallyAdjustKeyboardInsets/);
  for (const file of ['index', 'transactions', 'savings', 'reports', 'more']) {
    assert.match(source(`src/app/(tabs)/${file}.tsx`), /<Screen bottomInset=\{false\}/);
  }
  assert.equal(JSON.parse(source('app.json')).expo.android.softwareKeyboardLayoutMode, 'resize');
});

test('text fields and their amount containers no longer use fixed heights', () => {
  const files = [...fs.readdirSync(path.join(root, 'src/app'), { recursive: true })
    .filter(f => f.endsWith('.tsx')).map(f => `src/app/${f}`), 'src/components/CategoryForm.tsx'];
  let checked = 0;
  for (const file of files) {
    const text = source(file); if (!text.includes('<TextInput')) continue;
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer) &&
        ['input', 'inputRow', 'amountBox', 'amountInput', 'amountTextInput'].includes(node.name.getText(ast))) {
        checked++;
        assert.ok(!node.initializer.properties.some(p => ts.isPropertyAssignment(p) && p.name.getText(ast) === 'height'), `${file}: ${node.name.getText(ast)}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.ok(checked >= 20);
});

test('an empty database produces genuine empty dashboard data, without modifying schema', async (t) => {
  const { db } = await setup(t);
  const before = await db.getAllAsync('SELECT name, sql FROM sqlite_master ORDER BY name');
  const data = await loadDashboard(db);
  assert.deepEqual(data.accounts, []);
  assert.deepEqual(data.recentTransactions, []);
  assert.deepEqual(data.upcomingRecurring, []);
  assert.deepEqual(data.todayTotals, { usdMinor: 0, lbpMinor: 0 });
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 10);
  assert.deepEqual(await db.getAllAsync('SELECT name, sql FROM sqlite_master ORDER BY name'), before);
});

test('dashboard reads the existing balances/activity/totals and never writes financial data', async (t) => {
  const { db } = await setup(t);
  const account = await createAccount(db, { name: 'Synthetic phone test', type: 'cash', currency: 'USD', openingBalanceMinor: 10000 });
  await createTransaction(db, { type: 'expense', accountId: account.id, categoryId: 'expense-groceries', amountMinor: 2500 });
  const readOnly = { ...db, runAsync: () => { throw new Error('Unexpected write'); }, execAsync: () => { throw new Error('Unexpected DDL'); } };
  const data = await loadDashboard(readOnly);
  assert.equal(data.accounts[0].balanceMinor, 7500);
  assert.equal(data.recentTransactions[0].data.amountMinor, 2500);
  assert.equal(data.todayTotals.usdMinor, 2500);
  assert.equal(data.weekTotals.usdMinor, 2500);
  assert.equal(data.monthTotals.usdMinor, 2500);
});

test('one failed repository read rejects the dashboard instead of returning misleading zero totals', async (t) => {
  const { db } = await setup(t);
  const broken = { ...db, getAllAsync: (sql, ...args) => sql.includes('recurring_payments')
    ? Promise.reject(new Error('Synthetic read failure')) : db.getAllAsync(sql, ...args) };
  await assert.rejects(loadDashboard(broken), /Synthetic read failure/);
  assert.deepEqual((await loadDashboard(db)).accounts, []);
});

// Deterministic hook/focus lifecycle harness. Native navigation and React's
// scheduler are not exercised here; actual callbacks and state updates are.
function hookHarness() {
  const slots = []; let cursor = 0, effect, cleanup, started, focused = true;
  const reads = [], errors = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useCallback(callback, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) slots[i] = { callback, deps }; return slots[i].callback; },
  };
  const db = {};
  const load = createSourceLoader({ react, 'expo-router': { useFocusEffect: callback => { effect = callback; } },
    'expo-sqlite': { useSQLiteContext: () => db },
    '../utils/errors': { logUnexpectedError: (...args) => errors.push(args) },
    '../services/dashboardService': { loadDashboard: () => new Promise((resolve, reject) => reads.push({ resolve, reject })) },
  });
  const { useDashboard } = load('src/hooks/useDashboard.ts');
  function render() { cursor = 0; const result = useDashboard(); if (focused && effect !== started) { cleanup?.(); started = effect; cleanup = effect(); } return result; }
  return { reads, errors, render, blur() { cleanup?.(); cleanup = null; started = null; focused = false; }, focus() { focused = true; return render(); } };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('dashboard hook starts loading and publishes only resolved data', async () => {
  const h = hookHarness();
  assert.equal(h.render().loading, true);
  assert.equal(h.render().data, null);
  assert.equal(h.reads.length, 1);
  h.reads[0].resolve({ label: 'complete result' }); await settle();
  assert.equal(h.render().loading, false);
  assert.deepEqual(h.render().data, { label: 'complete result' });
});

test('dashboard failure is retryable and old totals stay hidden while retrying', async () => {
  const h = hookHarness(); h.render();
  h.reads[0].reject(new Error('Synthetic failure')); await settle();
  assert.equal(h.render().error, true); assert.equal(h.render().data, null);
  h.render().retry(); h.render();
  assert.equal(h.render().loading, true); assert.equal(h.render().error, false);
  h.reads[1].resolve({ label: 'recovered' }); await settle();
  assert.deepEqual(h.render().data, { label: 'recovered' }); assert.equal(h.errors.length, 1);
});

test('late dashboard results from an old focus cannot overwrite a new focus', async () => {
  const h = hookHarness(); h.render(); h.blur(); h.focus();
  h.reads[1].resolve({ label: 'new focus' }); await settle();
  h.reads[0].resolve({ label: 'old focus' }); await settle();
  assert.deepEqual(h.render().data, { label: 'new focus' });
});

test('late rejection after blur/unmount does not update the dashboard or log an obsolete failure', async () => {
  const h = hookHarness(); h.render(); h.blur();
  h.reads[0].reject(new Error('Old request')); await settle();
  assert.equal(h.render().error, false); assert.equal(h.errors.length, 0);
});

test('real Home loading/error screens never render balances or misleading empty states', () => {
  for (const mode of ['light', 'dark']) for (const page of ['home-loading', 'home-error']) {
    const html = renderAppearancePreview(mode, page, { width: 320, fontScale: 2 });
    assert.match(html, page === 'home-loading' ? /Loading your dashboard/ : /Unable to load dashboard/);
    assert.doesNotMatch(html, /Available Balance|Nothing due soon|No accounts yet|Nothing here yet/);
    if (page === 'home-error') assert.match(html, /Try Again/);
    else assert.doesNotMatch(html, /Try Again/);
  }
});

test('real small-screen activity and Home previews preserve complete amounts and Unicode', () => {
  for (const page of ['home', 'activity']) for (const mode of ['light', 'dark']) {
    const html = renderAppearancePreview(mode, page, { width: 320, fontScale: 2 });
    assert.match(html, /123,456,789,012 LBP/);
    assert.match(html, /17,900,000 LBP/);
    assert.match(html, /قهوة/);
  }
});

test('large-text lock screen remains scrollable and never renders private content', () => {
  for (const mode of ['light', 'dark']) {
    const html = renderAppearancePreview(mode, 'locked', { width: 320, fontScale: 2 });
    assert.match(html, /App locked/); assert.match(html, /Unlock/); assert.match(html, /Open device settings/);
    assert.doesNotMatch(html, /PRIVATE FINANCIAL CONTENT/);
  }
  assert.match(source('src/components/AppLockProvider.tsx'), /<Screen scroll contentStyle=\{styles.screen\}/);
  assert.match(source('src/components/AppLockProvider.tsx'), /flexGrow: 1/);
});

// Render real app components through React Native Web for layout/color smoke
// checks. Native services and the initial controller snapshot are mocked; no
// financial database, authentication prompt, or phone settings are accessed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const RN = require('react-native-web');
const root = path.resolve(__dirname, '../..');

function renderAppearancePreview(mode, page = 'appearance', { width = 390, fontScale = 1 } = {}) {
  if (!['light', 'dark'].includes(mode)) throw new Error('Invalid preview mode');
  const snapshot = { preference: mode, ready: true, saving: false, error: null };
  class PreviewAppearanceController {
    getSnapshot = () => snapshot;
    subscribe = () => () => {};
    initialize = async () => {};
    setPreference = async () => {};
  }
  const lockState = { ready: true, enabled: true, locked: true, busy: false, canAccess: false, error: null };
  class PreviewLockController {
    getSnapshot = () => lockState;
    subscribe = () => () => {};
  }
  const icon = ({ name, color, size }) => React.createElement(RN.Text, {
    accessibilityElementsHidden: true, style: { color, fontSize: size, width: size + 2, textAlign: 'center' },
  }, ({ 'sunny-outline': '☀', 'moon-outline': '☾', 'radio-button-on': '◉', 'radio-button-off': '○', 'phone-portrait-outline': '▣' })[name] ?? '◇');
  icon.glyphMap = {};
  // RN Web does not implement native Dynamic Type. Scale text explicitly for
  // the browser layout simulation; this is not a native font/keyboard test.
  const scaledText = (Component) => ({ style, ...props }) => {
    const flat = RN.StyleSheet.flatten(style) ?? {};
    return React.createElement(Component, { ...props, style: [style, {
      fontSize: (flat.fontSize ?? 14) * fontScale,
      ...(flat.lineHeight ? { lineHeight: flat.lineHeight * fontScale } : {}),
    }] });
  };
  const overrides = {
    'react': React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { ...RN, Text: scaledText(RN.Text), TextInput: scaledText(RN.TextInput),
      useWindowDimensions: () => ({ width, height: 568, scale: 1, fontScale }),
      Appearance: { getColorScheme: () => mode, setColorScheme() {}, addChangeListener: () => ({ remove() {} }) } },
    'react-native-safe-area-context': { SafeAreaView: ({ edges, ...props }) => React.createElement(RN.View, props), useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) },
    '@expo/vector-icons': { Ionicons: icon },
    'expo-router': { router: { back() {}, push() {} }, useFocusEffect() {}, DarkTheme: { dark: true }, DefaultTheme: { dark: false },
      ThemeProvider: ({ children }) => children },
    'expo-status-bar': { StatusBar: ({ style }) => React.createElement('span', { 'data-status-bar': style }) },
    'expo-sqlite': { useSQLiteContext: () => { throw new Error('Unexpected database access'); } },
    'expo-system-ui': { setBackgroundColorAsync: async () => {} },
  };
  // The provider needs a stable context identity but does not query it during
  // server rendering; controller snapshots are supplied explicitly above.
  const dummyDb = {};
  overrides['expo-sqlite'].useSQLiteContext = () => dummyDb;
  const transaction = { id: 'synthetic-tx', type: 'expense', currency: 'LBP', amountMinor: 123456789012,
    merchant: 'Café + قهوة — family groceries', categoryName: 'Groceries', accountName: 'Family everyday spending account', occurredAt: '2026-09-03T12:00:00Z' };
  const transfer = { id: 'synthetic-transfer', sourceAccountName: 'Family everyday spending account', destinationAccountName: 'Long-term household savings',
    sourceAmountMinor: 20000, sourceCurrency: 'USD', destinationAmountMinor: 17900000, destinationCurrency: 'LBP', occurredAt: transaction.occurredAt };
  const totals = { usdMinor: 987654, lbpMinor: 123456789012 };
  const dashboard = {
    loading: page === 'home-loading', error: page === 'home-error', retry() {},
    data: page === 'home-error' || page === 'home-loading' ? null : {
      accounts: [{ id: 'synthetic-account', name: 'Family everyday spending account', type: 'cash', currency: 'LBP', balanceMinor: 123456789012 }],
      recentTransactions: [{ kind: 'transaction', data: transaction }, { kind: 'transfer', data: transfer }],
      todayTotals: totals, weekTotals: totals, monthTotals: totals, exchangeRate: { lbpPerUsd: 89500 },
      upcomingRecurring: [{ id: 'synthetic-recurring', name: 'Monthly school and family payment', type: 'expense', currency: 'LBP', amountMinor: 123456789012, accountName: transaction.accountName, nextDueDate: '2026-09-03' }],
    },
  };
  const sourceOverrides = {
    'src/hooks/useDashboard.ts': { useDashboard: () => dashboard },
    'src/hooks/useMonthlyBudgets.ts': { useMonthlyBudgets: () => ({ loading: false, error: false, items: [], retry() {} }) },
    'src/services/appearanceController.ts': { AppearanceController: PreviewAppearanceController },
    'src/services/appLockController.ts': { AppLockController: PreviewLockController },
    'src/services/appLockService.ts': { appLockAdapter: {} },
  };
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(root, filename);
    const relative = path.relative(root, filename);
    if (sourceOverrides[relative]) return sourceOverrides[relative];
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const requireSource = (name) => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (!name.startsWith('.')) throw new Error(`Unmocked preview dependency: ${name}`);
      const base = path.resolve(path.dirname(filename), name);
      const target = [base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(fs.existsSync);
      if (!target) throw new Error(`Missing preview source: ${base}`);
      return load(target);
    };
    vm.runInThisContext(`(function(require,module,exports){\n${code}\n})`, { filename })(requireSource, module, module.exports);
    return module.exports;
  }
  const { ThemeProvider } = load('src/theme/ThemeProvider.tsx');
  let component;
  if (page === 'appearance') component = React.createElement(load('src/app/settings/appearance.tsx').default);
  else if (page === 'form') component = React.createElement(load('src/components/CategoryForm.tsx').CategoryForm, {
    initialValues: { kind: 'expense', name: 'Café + قهوة', icon: 'cart-outline' }, onSubmit: async () => {}, onCancel() {},
  });
  else if (page === 'locked') component = React.createElement(load('src/components/AppLockProvider.tsx').AppLockProvider, null, 'PRIVATE FINANCIAL CONTENT');
  else if (page.startsWith('home')) component = React.createElement(load('src/app/(tabs)/index.tsx').default);
  else if (page === 'activity') {
    const { Screen } = load('src/components/Screen.tsx');
    const { ActivityRow } = load('src/components/ActivityRow.tsx');
    component = React.createElement(Screen, { scroll: true, contentStyle: { gap: 16, paddingBottom: 24 } },
      React.createElement(ActivityRow, { activity: { kind: 'transaction', data: transaction } }),
      React.createElement(ActivityRow, { activity: { kind: 'transfer', data: transfer } }));
  }
  else if (page === 'budget') {
    const { BudgetCard } = load('src/components/BudgetCard.tsx');
    const { Screen } = load('src/components/Screen.tsx');
    const budget = { id: 'synthetic', categoryName: 'Groceries', categoryActive: true, currency: 'USD', limitMinor: 10000, spentMinor: 2500, remainingMinor: 7500 };
    component = React.createElement(Screen, { scroll: true, contentStyle: { gap: 20 } },
      ...[budget, { ...budget, categoryName: 'Transport', spentMinor: 8500, remainingMinor: 1500 },
        { ...budget, categoryName: 'Dining', spentMinor: 12000, remainingMinor: -2000 }].map((item, index) =>
        React.createElement(BudgetCard, { key: index, budget: item, onEdit() {} })));
  } else throw new Error('Unknown preview page');
  const key = `Appearance-${mode}-${page}`;
  RN.AppRegistry.registerComponent(key, () => () => React.createElement(ThemeProvider, null, component));
  const application = RN.AppRegistry.getApplication(key);
  const markup = renderToStaticMarkup(application.element);
  const styles = renderToStaticMarkup(application.getStyleElement());
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles}<style>html,body,#root{margin:0;min-height:100%;height:100%;}body{background:${mode === 'dark' ? '#0D1420' : '#F7F8FA'};}#root{display:flex;flex-direction:column;}</style></head><body><div id="root">${markup}</div></body></html>`;
}

module.exports = { renderAppearancePreview };

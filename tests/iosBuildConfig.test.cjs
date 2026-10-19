const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const config = require('../app.json').expo;

function applyPlugin(entitlements, info) {
  const source = fs.readFileSync(path.join(root, 'plugins/withLocalNotifications.cjs'), 'utf8');
  const module = { exports: {} };
  const requirePlugin = (name) => {
    assert.equal(name, 'expo/config-plugins');
    return {
      withEntitlementsPlist(config, action) { action({ modResults: entitlements }); return config; },
      withInfoPlist(config, action) { action({ modResults: info }); return config; },
    };
  };
  vm.runInThisContext(`(function(require, module, exports) {${source}\n})`)(requirePlugin, module, module.exports);
  module.exports({});
}

test('local notifications plugin removes only remote-push settings and is repeatable', () => {
  const entitlements = { 'aps-environment': 'development', 'keychain-access-groups': ['synthetic-keychain'] };
  const info = { UIBackgroundModes: ['audio', 'remote-notification'], NSFaceIDUsageDescription: 'Keep Face ID permission', CFBundleDisplayName: 'PocketLedger' };
  applyPlugin(entitlements, info); applyPlugin(entitlements, info);
  assert.deepEqual(entitlements, { 'keychain-access-groups': ['synthetic-keychain'] });
  assert.deepEqual(info, { UIBackgroundModes: ['audio'], NSFaceIDUsageDescription: 'Keep Face ID permission', CFBundleDisplayName: 'PocketLedger' });
});

test('local notifications plugin handles empty settings and removes empty background modes', () => {
  for (const info of [{}, { UIBackgroundModes: ['remote-notification'] }]) {
    applyPlugin({}, info);
    assert.equal(info.UIBackgroundModes, undefined);
  }
});

test('app has a stable phone identifier, version, and correct local-reminder mod ordering', () => {
  assert.equal(config.ios.bundleIdentifier, 'com.mhaidar.pocketledger');
  assert.equal(config.ios.buildNumber, '1');
  const notificationIndex = config.plugins.indexOf('expo-notifications');
  assert.ok(notificationIndex >= 0);
  const localIndex = config.plugins.indexOf('./plugins/withLocalNotifications.cjs');
  assert.ok(localIndex >= 0 && localIndex < notificationIndex);
  assert.ok(config.plugins.some(plugin => Array.isArray(plugin) && plugin[0] === 'expo-local-authentication'));
  const reminders = fs.readFileSync(path.join(root, 'src/services/recurringReminderService.ts'), 'utf8');
  assert.match(reminders, /scheduleNotificationAsync/);
  assert.doesNotMatch(reminders, /getExpoPushTokenAsync|getDevicePushTokenAsync/);
});

test('phone installation command selects a physical device and bundles a Release build', () => {
  assert.equal(require('../package.json').scripts['ios:device'], 'expo run:ios --device --configuration Release');
});

test('actual Expo config pipeline omits APNs while retaining Face ID and the phone app identifier', () => {
  const output = execFileSync(process.execPath, [require.resolve('expo/bin/cli'), 'config', '--type', 'introspect', '--json'], {
    cwd: root, encoding: 'utf8', timeout: 30000, env: { ...process.env, EXPO_NO_TELEMETRY: '1', EXPO_OFFLINE: '1' },
  });
  const result = JSON.parse(output);
  assert.equal(result.ios.entitlements['aps-environment'], undefined);
  assert.ok(!result.ios.infoPlist.UIBackgroundModes?.includes('remote-notification'));
  assert.match(result.ios.infoPlist.NSFaceIDUsageDescription, /Face ID/);
  assert.equal(result.ios.bundleIdentifier, 'com.mhaidar.pocketledger');
});

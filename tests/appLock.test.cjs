const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, createSourceLoader } = require('./helpers/database.cjs');
const { AppLockController } = loadSource('src/services/appLockController.ts');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(options = {}) {
  let stored = options.enabled ?? false;
  const writes = [];
  let authCalls = 0;
  const adapter = {
    async readEnabled() { return options.read ? options.read() : stored; },
    async writeEnabled(value) { if (options.write) await options.write(value); stored = value; writes.push(value); },
    async authenticate() { authCalls++; return options.auth ? options.auth() : { success: true }; },
  };
  const controller = new AppLockController(adapter, options.appState ?? 'active');
  return { controller, adapter, writes, get authCalls() { return authCalls; } };
}

test('financial screens stay gated until the preference has been read', async () => {
  const read = deferred();
  const { controller } = harness({ read: () => read.promise });
  const pending = controller.initialize();
  assert.equal(controller.getSnapshot().canAccess, false);
  read.resolve(false); await pending;
  assert.equal(controller.getSnapshot().canAccess, true);
  assert.equal(controller.getSnapshot().enabled, false);
});

test('enabled cold launch requires successful authentication, including device-passcode-only use', async () => {
  const native = harness({ enabled: true });
  await native.controller.initialize();
  assert.equal(native.controller.getSnapshot().canAccess, false);
  await native.controller.unlock();
  assert.equal(native.controller.getSnapshot().canAccess, true);
  assert.equal(native.authCalls, 1);
  assert.deepEqual(native.writes, []);
});

test('cancelled and failed authentication never unlock or disable protection', async () => {
  for (const auth of [async () => ({ success: false }), async () => { throw new Error('native failure'); }]) {
    const native = harness({ enabled: true, auth });
    await native.controller.initialize(); await native.controller.unlock();
    const state = native.controller.getSnapshot();
    assert.equal(state.canAccess, false); assert.equal(state.enabled, true); assert.equal(state.busy, false);
    assert.ok(state.error); assert.deepEqual(native.writes, []);
  }
});

test('background, inactive, and Android blur relock; returning alone never unlocks', async () => {
  const { controller } = harness({ enabled: true });
  await controller.initialize();
  for (const state of ['background', 'inactive']) {
    await controller.unlock(); assert.equal(controller.getSnapshot().canAccess, true);
    controller.setAppState(state); assert.equal(controller.getSnapshot().canAccess, false);
    controller.setAppState('active'); assert.equal(controller.getSnapshot().canAccess, false);
  }
});

test('a successful native prompt can resume from inactive without immediately relocking', async () => {
  const auth = deferred();
  const { controller } = harness({ enabled: true, auth: () => auth.promise });
  await controller.initialize();
  const pending = controller.unlock();
  controller.setAppState('inactive');
  auth.resolve({ success: true }); await pending;
  assert.equal(controller.getSnapshot().canAccess, false);
  controller.setAppState('active'); assert.equal(controller.getSnapshot().canAccess, true);
  controller.setAppState('background'); controller.setAppState('active');
  assert.equal(controller.getSnapshot().canAccess, false, 'authorization is single-use');
});

test('a new leave event discards pending authentication before it can expose a screen', async () => {
  const auth = deferred();
  const { controller } = harness({ enabled: true, auth: () => auth.promise });
  await controller.initialize();
  const pending = controller.unlock(); controller.setAppState('inactive');
  auth.resolve({ success: true }); await pending;
  controller.setAppState('background'); controller.setAppState('active');
  assert.equal(controller.getSnapshot().canAccess, false);
});

test('repeated Unlock presses produce only one native prompt', async () => {
  const auth = deferred();
  const native = harness({ enabled: true, auth: () => auth.promise });
  await native.controller.initialize();
  const first = native.controller.unlock();
  await native.controller.unlock(); await native.controller.setEnabled(false);
  assert.equal(native.authCalls, 1); assert.deepEqual(native.writes, []);
  auth.resolve({ success: true }); await first;
  assert.equal(native.controller.getSnapshot().canAccess, true);
});

test('enabling and disabling authenticate before saving, and persist across controller restarts', async () => {
  const native = harness(); await native.controller.initialize();
  await native.controller.setEnabled(true);
  assert.equal(native.authCalls, 1); assert.deepEqual(native.writes, [true]);
  const restart = new AppLockController(native.adapter); await restart.initialize();
  assert.equal(restart.getSnapshot().canAccess, false);
  await restart.unlock(); await restart.setEnabled(false);
  assert.equal(native.authCalls, 3); assert.deepEqual(native.writes, [true, false]);
  const again = new AppLockController(native.adapter); await again.initialize();
  assert.equal(again.getSnapshot().canAccess, true);
});

test('cancelled setup leaves the app unlocked and does not store an enabled flag', async () => {
  const native = harness({ auth: async () => ({ success: false }) });
  await native.controller.initialize(); await native.controller.setEnabled(true);
  assert.equal(native.controller.getSnapshot().enabled, false);
  assert.equal(native.controller.getSnapshot().canAccess, true);
  assert.deepEqual(native.writes, []);
});

test('locked settings cannot disable protection without first unlocking', async () => {
  const native = harness({ enabled: true });
  await native.controller.initialize(); await native.controller.setEnabled(false);
  assert.equal(native.authCalls, 0); assert.deepEqual(native.writes, []);
  assert.equal(native.controller.getSnapshot().canAccess, false);
});

test('cancelling Disable keeps the saved lock enabled for the next app visit', async () => {
  let success = true;
  const native = harness({ enabled: true, auth: async () => ({ success }) });
  await native.controller.initialize(); await native.controller.unlock();
  success = false; await native.controller.setEnabled(false);
  assert.equal(native.controller.getSnapshot().enabled, true);
  assert.deepEqual(native.writes, []);
  native.controller.setAppState('background'); native.controller.setAppState('active');
  assert.equal(native.controller.getSnapshot().canAccess, false);
});

test('security-read failures fail closed and can retry safely', async () => {
  let fail = true;
  const { controller } = harness({ read: async () => { if (fail) throw new Error('storage error'); return true; } });
  await controller.initialize(); await controller.unlock();
  assert.equal(controller.getSnapshot().ready, false);
  assert.equal(controller.getSnapshot().canAccess, false);
  fail = false; await controller.initialize();
  assert.equal(controller.getSnapshot().ready, true);
  assert.equal(controller.getSnapshot().canAccess, false);
});

test('failed preference writes keep financial screens gated until saved state is rechecked', async () => {
  for (const enabled of [true, false]) {
    const native = harness({ enabled, write: async () => { throw new Error('write failed'); } });
    await native.controller.initialize(); if (enabled) await native.controller.unlock();
    await native.controller.setEnabled(!enabled);
    assert.equal(native.controller.getSnapshot().ready, false);
    assert.equal(native.controller.getSnapshot().canAccess, false);
    await native.controller.initialize();
    assert.equal(native.controller.getSnapshot().enabled, enabled);
    assert.equal(native.controller.getSnapshot().canAccess, !enabled);
  }
});

test('authentication never starts while backgrounded and Lock Now requires a fresh unlock', async () => {
  const native = harness({ enabled: true, appState: 'background' });
  await native.controller.initialize(); await native.controller.unlock();
  assert.equal(native.authCalls, 0);
  native.controller.setAppState('active'); await native.controller.unlock();
  native.controller.lockNow(); assert.equal(native.controller.getSnapshot().canAccess, false);
  await native.controller.unlock(); assert.equal(native.authCalls, 2);
});

function nativeAdapter(options = {}) {
  const calls = { reads: [], writes: [], auth: [] };
  const loader = createSourceLoader({
    'react-native': { Platform: { OS: options.os ?? 'ios' } },
    'expo-secure-store': {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
      isAvailableAsync: async () => options.available !== false,
      getItemAsync: async (...args) => { calls.reads.push(args); return options.value ?? null; },
      setItemAsync: async (...args) => { calls.writes.push(args); },
    },
    'expo-local-authentication': {
      SecurityLevel: { NONE: 0 },
      getEnrolledLevelAsync: async () => options.level ?? 1,
      authenticateAsync: async (settings) => { calls.auth.push(settings); return options.result ?? { success: true }; },
    },
  });
  return { adapter: loader('src/services/appLockService.ts').appLockAdapter, calls };
}

test('native adapter uses strong biometrics with device-passcode fallback and stores only a flag', async () => {
  const { adapter, calls } = nativeAdapter({ value: '1', level: 1 });
  assert.equal(await adapter.readEnabled(), true);
  assert.deepEqual(await adapter.authenticate(), { success: true });
  await adapter.writeEnabled(false);
  assert.equal(calls.auth[0].disableDeviceFallback, false);
  assert.equal(calls.auth[0].biometricsSecurityLevel, 'strong');
  assert.equal(calls.auth[0].fallbackLabel, 'Use Device Passcode');
  assert.equal(calls.writes[0][1], '0');
  assert.deepEqual(calls.writes[0][2], { keychainService: 'dailyfinance.app-lock', keychainAccessible: 6 });
  assert.deepEqual(calls.reads[0][1], calls.writes[0][2]);
});

test('missing/corrupt native storage never masquerades as a disabled lock', async () => {
  await assert.rejects(nativeAdapter({ available: false }).adapter.readEnabled(), /unavailable/);
  await assert.rejects(nativeAdapter({ value: 'invalid' }).adapter.readEnabled(), /Invalid/);
  assert.equal(await nativeAdapter().adapter.readEnabled(), false);
  assert.equal(await nativeAdapter({ value: '0' }).adapter.readEnabled(), false);
});

test('no enrolled device security is a quiet setup message with no prompt or saved flag', async () => {
  const { adapter, calls } = nativeAdapter({ level: 0 });
  const result = await adapter.authenticate();
  assert.equal(result.success, false); assert.match(result.message, /device passcode/);
  assert.equal(calls.auth.length, 0); assert.equal(calls.writes.length, 0);
});

test('native cancel, lockout, and passcode removal return friendly failures', async () => {
  for (const error of ['user_cancel', 'system_cancel', 'lockout', 'passcode_not_set', 'not_enrolled']) {
    const { adapter } = nativeAdapter({ result: { success: false, error } });
    const result = await adapter.authenticate();
    assert.equal(result.success, false); assert.ok(result.message);
  }
});

test('web cannot enable native app lock or invoke device APIs', async () => {
  const { adapter, calls } = nativeAdapter({ os: 'web' });
  assert.equal(await adapter.readEnabled(), false);
  assert.equal((await adapter.authenticate()).success, false);
  await assert.rejects(adapter.writeEnabled(true));
  assert.deepEqual(calls, { reads: [], writes: [], auth: [] });
});

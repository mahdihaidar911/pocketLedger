const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

// PocketLedger schedules reminders on the device; it does not register for
// server-sent APNs pushes. List this BEFORE expo-notifications: Expo's mod
// actions run in reverse registration order, so cleanup executes after the
// notification plugin. Personal Team builds don't request the paid Push
// Notifications capability. Revisit this plugin
// before adding remote notifications; local reminders and Face ID stay enabled.
module.exports = function withLocalNotifications(config) {
  config = withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    return mod;
  });
  return withInfoPlist(config, (mod) => {
    if (Array.isArray(mod.modResults.UIBackgroundModes)) {
      mod.modResults.UIBackgroundModes = mod.modResults.UIBackgroundModes.filter(
        (mode) => mode !== 'remote-notification'
      );
      if (mod.modResults.UIBackgroundModes.length === 0) delete mod.modResults.UIBackgroundModes;
    }
    return mod;
  });
};

const { AndroidConfig, withStringsXml } = require("expo/config-plugins");

/**
 * Android's counterpart to `CFBundleDisplayName`: the launcher reads
 * `app_name`, which Expo fills from `name`. `name` stays as is because iOS
 * derives its product and scheme names from it.
 *
 * @type {import("expo/config-plugins").ConfigPlugin<{ label: string }>}
 */
const withAndroidLabel = (config, { label }) =>
	withStringsXml(config, (config) => {
		config.modResults = AndroidConfig.Strings.setStringItem(
			[
				AndroidConfig.Resources.buildResourceItem({
					name: "app_name",
					value: label,
				}),
			],
			config.modResults,
		);
		return config;
	});

module.exports = { withAndroidLabel };

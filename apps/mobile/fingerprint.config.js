// The home-screen name has no effect on JS and native compatibility. Keeping it
// out of the fingerprint lets a build that differs only in its name take the
// same updates as the builds already installed.
const BRAND_SOURCE = "../../packages/shared/src/brand.ts";
const ANDROID_LABEL_PLUGIN = "withAndroidLabel";

/** @param {string} expoConfigJson */
function withoutDisplayName(expoConfigJson) {
	const expoConfig = JSON.parse(expoConfigJson);
	const hasIosName =
		expoConfig.ios?.infoPlist?.CFBundleDisplayName !== undefined;
	const androidLabel = expoConfig.plugins?.findIndex(
		(plugin) => Array.isArray(plugin) && plugin[0] === ANDROID_LABEL_PLUGIN,
	);
	if (!hasIosName && !(androidLabel >= 0)) {
		return expoConfigJson;
	}
	if (hasIosName) {
		delete expoConfig.ios.infoPlist.CFBundleDisplayName;
	}
	if (androidLabel >= 0) {
		expoConfig.plugins[androidLabel] = ANDROID_LABEL_PLUGIN;
	}
	return JSON.stringify(expoConfig);
}

/** @type {import('expo/fingerprint').Config} */
module.exports = {
	sourceSkips: [
		"ExpoConfigVersions",
		"PackageJsonAndroidAndIosScriptsIfNotContainRun",
	],
	ignorePaths: [BRAND_SOURCE],
	fileHookTransform: (source, chunk) =>
		source.type === "contents" && source.id === "expoConfig"
			? withoutDisplayName(chunk)
			: chunk,
};

const PLAY_MAX_VERSION_CODE = 2_100_000_000;

module.exports = function withVersionCode(config) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(config.version ?? "");
  if (!match) {
    throw new Error(`[mobile] version "${config.version}" is not major.minor.patch`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 999 || patch > 999) {
    throw new Error(`[mobile] version ${config.version} has a minor or patch above 999`);
  }
  const versionCode = major * 1_000_000 + minor * 1_000 + patch;
  if (versionCode < 1 || versionCode > PLAY_MAX_VERSION_CODE) {
    throw new Error(`[mobile] versionCode ${versionCode} is outside 1..${PLAY_MAX_VERSION_CODE}`);
  }
  return { ...config, android: { ...config.android, versionCode } };
};

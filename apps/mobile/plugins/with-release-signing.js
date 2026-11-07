const { withAppBuildGradle } = require("expo/config-plugins");

const PROPERTY = "METIS_UPLOAD_STORE_FILE";

const RELEASE_SIGNING_CONFIG = `signingConfigs {
        release {
            if (project.hasProperty('${PROPERTY}')) {
                storeFile file(METIS_UPLOAD_STORE_FILE)
                storePassword METIS_UPLOAD_STORE_PASSWORD
                keyAlias METIS_UPLOAD_KEY_ALIAS
                keyPassword METIS_UPLOAD_KEY_PASSWORD
            }
        }`;

function replaceOnce(contents, pattern, replacement) {
  if (!pattern.test(contents)) {
    throw new Error(`[mobile] android/app/build.gradle has no match for ${pattern}`);
  }
  return contents.replace(pattern, replacement);
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== "groovy") {
      throw new Error("[mobile] release signing expects a Groovy android/app/build.gradle");
    }
    let gradle = modConfig.modResults.contents;
    if (gradle.includes(PROPERTY)) {
      return modConfig;
    }
    gradle = replaceOnce(
      gradle,
      /(buildTypes \{[\s\S]*?release \{[^}]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig(project.hasProperty('${PROPERTY}') ? signingConfigs.release : signingConfigs.debug)`,
    );
    gradle = replaceOnce(gradle, /signingConfigs \{/, RELEASE_SIGNING_CONFIG);
    modConfig.modResults.contents = gradle;
    return modConfig;
  });
};

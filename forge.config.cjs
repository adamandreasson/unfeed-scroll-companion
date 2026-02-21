/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
  packagerConfig: {
    asar: true,
    icon: "./assets/icon",
    ...(process.platform === "darwin" && {
      osxSign: {
        // Use the keychain created in CI (Import step); osx-sign looks up "Developer ID Application:" there
        ...(process.env.CSC_KEYCHAIN && {
          keychain: process.env.CSC_KEYCHAIN,
          identity: "Developer ID Application:",
          // Fail the build if signing fails (don't silently ship adhoc-signed)
          continueOnError: false,
        }),
      },
      ...(process.env.APPLE_ID &&
        process.env.APPLE_APP_SPECIFIC_PASSWORD &&
        process.env.APPLE_TEAM_ID && {
          osxNotarize: {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
          },
        }),
    }),
  },
  makers: [
    { name: "@electron-forge/maker-squirrel", config: { name: "scroll-companion", iconUrl: "https://unfeed.news/icons/favicon.ico", setupIcon: "./assets/icon.ico" } },
    { name: "@electron-forge/maker-dmg", config: { name: "Scroll Companion", icon: "./assets/icon.icns" } },
    { name: "@electron-forge/maker-deb", config: { name: "scroll-companion", icon: "./assets/icon.png" } },
  ],
  plugins: [{ name: "@electron-forge/plugin-auto-unpack-natives", config: {} }],
};

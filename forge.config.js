/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
  packagerConfig: {
    asar: true,
    ...(process.platform === "darwin" && {
      osxSign: {},
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
    { name: "@electron-forge/maker-squirrel", config: { name: "scroll-companion" } },
    { name: "@electron-forge/maker-dmg", config: { name: "Scroll Companion" } },
    { name: "@electron-forge/maker-deb", config: { name: "scroll-companion" } },
  ],
  plugins: [{ name: "@electron-forge/plugin-auto-unpack-natives", config: {} }],
};

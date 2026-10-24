module.exports = {
  hooks: {
    readPackage(pkg) {
      // @astrojs/check uses the pre-native TypeScript API. Resolve it locally
      // rather than accepting the project's TypeScript 7 compiler as a peer.
      if (pkg.name === '@astrojs/check') {
        delete pkg.peerDependencies.typescript;
        pkg.dependencies.typescript = '^6.0.0';
      }
      return pkg;
    },
  },
};

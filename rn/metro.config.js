const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// rn/ lives inside the web (Vite) repo, which has its own node_modules one level up.
// Pin module resolution to rn/node_modules first so we never end up with two Reacts.
// (Hierarchical lookup stays ON — packages with nested node_modules, e.g. reanimated's
// own semver@7, need it; `disableHierarchicalLookup` broke `expo export`.)
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

module.exports = config;

---
name: react-native-maps web bundling
description: How to prevent react-native-maps from crashing the Metro web bundler in an Expo app
---

react-native-maps imports `react-native/Libraries/Utilities/codegenNativeCommands` which Metro's web bundler cannot resolve. Even wrapping the import in `require()` inside a runtime Platform.OS check does NOT work — Metro performs static analysis regardless.

**The fix:** Use Metro's platform-specific file resolution.
- Create `components/MyMap.tsx` — imports from `react-native-maps`, renders `MapView`
- Create `components/MyMap.web.tsx` — no react-native-maps import, renders a fallback View

Metro automatically picks `MyMap.web.tsx` for web builds and `MyMap.tsx` for native builds. No conditional logic needed in the component itself.

**Why:** Metro bundles all modules reachable via static imports at build time, so runtime conditionals can't prevent the native module from being included in the web bundle.

**How to apply:** Any native-only package that crashes web bundling (react-native-maps, react-native-camera, etc.) — split into `.web.tsx` fallback + `.tsx` native, never import the native package from a shared module.

Pin react-native-maps to `1.18.0` (not 1.20.1) — the pinned version works with Expo SDK 54 in this project. Do NOT add it to `plugins` in app.json.

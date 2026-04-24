# Capacitor native wrap

Ships the same React + Vite PWA as a native iOS and Android app. Same codebase, same build output, just a native shell around it that unlocks:

- **Persistent compass permission on iOS** — no "Enable compass" button on every reload.
- **Background GPS** — machine tracking keeps posting positions with the screen locked.
- **Deeper camera control** — system camera UI with tap-to-focus and orientation correction, via `@capacitor/camera`.
- **App Store / Play Store distribution**.

The PWA stays a first-class target; every platform abstraction in `src/platform/` falls back to the web API when `Capacitor.isNativePlatform()` is false.

## One-time setup (your machine)

### macOS for iOS

Prerequisites:
- Xcode 15+ from the App Store
- CocoaPods: `brew install cocoapods`
- An Apple Developer account for signing (free for dev, ~€100/yr for App Store)

```bash
# Generate the iOS shell. Writes /ios (gitignored).
npm run cap:add:ios

# Build the web bundle + copy into the shell + open Xcode.
npm run cap:ios
```

In Xcode:
1. Set your Team in `Signing & Capabilities`.
2. Pick your device/simulator in the top bar.
3. ▶ Run.

### Linux or macOS for Android

Prerequisites:
- Android Studio (latest)
- Android SDK Platform 34 + Build Tools 34
- Java 17+

```bash
npm run cap:add:android
npm run cap:android
```

Android Studio opens. Use the green ▶ to run on a connected device or emulator.

## iOS permissions

Add these keys to `ios/App/App/Info.plist` after `cap:add:ios` generates the shell. Reason strings are shown to the user in the native permission prompts.

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Waldblick logs your position with every observation so you can find the tree again later.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Machine tracking continues in the background so your crew can see where harvesters and forwarders are working in real time.</string>

<key>NSCameraUsageDescription</key>
<string>Take photos of trees, beetle damage, and reforestation work to attach to observations.</string>

<key>NSMicrophoneUsageDescription</key>
<string>Record voice notes alongside observations — faster than typing in the rain.</string>

<key>NSMotionUsageDescription</key>
<string>Read compass heading so the "Navigate here" screen can point you to the tree.</string>
```

Also under `Signing & Capabilities`, add the **Background Modes** capability with `Location updates` checked. That's what lets the background-geolocation plugin keep firing when the app is backgrounded.

## Android permissions

`npm run cap:add:android` generates a `android/app/src/main/AndroidManifest.xml`. Ensure these permissions are present inside `<manifest>` (they should be added by the plugins, but verify):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

For Android 13+ (API 33) add:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

## Development loop

Two options:

### Fast iteration: point the native shell at Vite dev server

Uncomment the `server.url` block in `capacitor.config.ts`:

```ts
server: {
  url: 'http://192.168.4.128:5173',
  cleartext: true,
  androidScheme: 'https',
},
```

Then `npm run cap:sync && npx cap run ios` (or android). Every web edit live-reloads in the native shell via Vite's hot reload.

### Production build: bundled

Comment the `server.url` back out, then:

```bash
npm run cap:sync   # build + copy dist/ into the shell
npm run cap:ios    # or cap:android
```

The native shell loads the static build from within the app. This is what you ship to stores.

## Platform-abstracted features

Already wired via `src/platform/`:

| Feature | Module | Native gives you |
|---|---|---|
| Geolocation | `platform/geolocation.ts` | Persistent iOS permission, background updates |
| Camera | `platform/camera.ts` | System camera, tap-to-focus, orientation correction |
| Compass | `platform/orientation.ts` | Permission persists — no "Enable compass" reload loop |

Anywhere in the app that wants native-first capability imports from `@/platform/*` instead of calling `navigator.*` directly. The modules transparently fall back to web APIs when `isNative()` is false.

## Store submission checklist (v2, when ready)

- [ ] Apple Developer account (€99/yr)
- [ ] Google Play Developer account (one-off $25)
- [ ] App icons at every required size — regenerate via `npm run icons` then use [App Icon Generator](https://appicon.co) for platform bundles, or let Capacitor Assets handle it
- [ ] Screenshots at required sizes (Apple: 6.7" + 5.5"; Play: 16:9 or 9:16)
- [ ] Privacy policy URL
- [ ] Age rating (forestry app = 4+)
- [ ] Data safety form on Play Console (Supabase, Google Directions)
- [ ] App Review Information: demo account, contact info
- [ ] TestFlight / Internal testing for a week before public release

## Troubleshooting

**"Failed to open Info.plist" during `cap:ios`** — you haven't run `cap:add:ios` yet, or `ios/` was deleted. Re-add.

**Background geolocation silently stops after a few minutes on iOS** — you're missing the "Location updates" Background Mode capability. See iOS section above.

**Blank white screen on launch** — the shell couldn't find `dist/`. Run `npm run cap:sync` first.

**"App not installed" on Android** — signing mismatch. Clear the app from the device and reinstall.

# SOS on the Home Screen / Lock Screen

## What already works today

```bash
open "linq://sos"        # macOS
adb shell am start -a android.intent.action.VIEW -d "linq://sos"   # Android
xcrun simctl openurl booted "linq://sos"                            # iOS sim
```

The app is registered for the `linq` scheme (`frontend/app.json` ->
`"scheme": "linq"`) and `src/hooks/useSosDeepLink.ts` routes the URL straight
to the SOS confirmation screen.

**That URL is the whole contract.** Every native control below is a thin shell
that opens it. Nothing about the SOS flow needs to change when these land.

Note: `useSosDeepLink` deliberately routes to **confirmation**, not to
auto-activation. A widget tap is easy to trigger by accident, and silently
alerting a user's real emergency contacts is worse than one extra tap.

---

## Platform reality check

Being straight about what each platform allows, because this is safety-critical
and half of it is simply not permitted:

| Platform | Home screen | Lock screen | Blocked without app open |
|---|---|---|---|
| **Android 12+** | App Widget | **Quick Settings Tile** | No |
| **Android 11 and below** | App Widget | App Widget only (tap to open) | No |
| **iOS 17+** | Interactive Widget | **App Intent via Lock Screen / Control Center / Action Button** | **Yes** |
| **iOS 16 and below** | Nothing interactive | Nothing | **Yes** |

### The iOS limitation you must understand

**iOS does not allow a third-party app to raise an SOS from the lock screen
without the device being unlocked and the user confirming.** A third-party app
has no access to the lock screen "actions" area (that is reserved for Apple and
a handful of partners such as car manufacturers). There is no API for it.

On iOS 17+ an **App Intent** can be surfaced on the Lock Screen via the
Shortcuts app, Control Center, or the Action Button, and it runs without opening
the app. But because the phone is still locked, iOS withholds precise location
and the app cannot silently call a backend with a trusted identity.

So the honest iOS behaviour is:
- the intent opens the app / foregrounds it,
- iOS then presents its own **"Unlock to use LinQ"** prompt,
- after unlock the confirmation screen appears.

That is an OS constraint, not a gap in this implementation. Attempting to
circumvent it is not something to ship in a safety feature.

**Android is the platform where this genuinely works**, including from the lock
screen, via a Quick Settings Tile.

---

## Android — Quick Settings Tile (recommended, works from lock screen)

This is the highest-value option: one pull-down and one tap raises SOS even
with the phone locked.

### 1. Declare the tile in `AndroidManifest.xml`

```xml
<!-- res/xml/qs_tiles.xml -->
<tiles>
  <tile
    android:icon="@drawable/ic_sos_tile"
    android:label="@string/sos_tile_label"
    android:description="@string/sos_tile_description"
    android:activeIcon="@drawable/ic_sos_tile_active"
    android:state="disabled" />
</tiles>
```

```xml
<!-- res/values/strings.xml -->
<string name="app_name">LinQ</string>
<string name="sos_tile_label">SOS</string>
<string name="sos_tile_description">Raise a LinQ emergency alert</string>
```

Add to the application tag:

```xml
<service
  android:name=".sos.LinQSosTileService"
  android:exported="true"
  android:icon="@drawable/ic_sos_tile"
  android:label="@string/sos_tile_label"
  android:permission="android.permission.BIND_QUICK_SETTINGS_TILE" />
```

### 2. The tile service

```kotlin
package com.linq.app.sos

import android.content.Intent
import android.net.Uri
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.Toast

class LinQSosTileService : TileService() {

  override fun onStartListening() {
    super.onStartListening()
    // Reflect live SOS state so the tile greys out when an incident is active.
    val prefs = getSharedPreferences("linq_sos", MODE_PRIVATE)
    qsTile?.apply {
      state = if (prefs.getBoolean("active", false)) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
      label = if (prefs.getBoolean("active", false)) "SOS ACTIVE" else "SOS"
      updateTile()
    }
  }

  override fun onClick() {
    super.onClick()

    if (getSharedPreferences("linq_sos", MODE_PRIVATE).getBoolean("active", false)) {
      // An incident is already running; do not stack another one.
      Toast.makeText(this, "A LinQ SOS is already active", Toast.LENGTH_SHORT).show()
      return
    }

    // Opens linq://sos -> the app's SOS confirmation screen.
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("linq://sos"))
    intent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    )
    // From the lock screen the OS will raise the unlock prompt first, which is
    // the correct and only legal behaviour.
    startActivityAndCollapse(
      android.app.PendingIntent.getActivity(
        this, 0, intent, android.app.PendingIntent.FLAG_IMMUTABLE
      )
    )
  }
}
```

### 3. Mirror live SOS state into the tile

In `src/services/sos/sosSession.ts`, mirror the `status` field to native
preferences so the tile can grey itself out:

```ts
import { NativeModules } from 'react-native';

// Optional bridge; safe to no-op in Expo Go / web.
const SosNative = (NativeModules as { LinQSosTile?: { setActive(v: boolean): void } }).LinQSosTile;

export function syncSosTile(active: boolean) {
  try { SosNative?.setActive?.(active); } catch { /* not available */ }
}
```

Call it from `SosContext` wherever the incident status changes.

### 4. Verify

```bash
adb shell cmd statusbar add-tile com.linq.app/com.linq.app.sos.LinQSosTileService
adb shell cmd statusbar click-tile com.linq.app
```

---

## Android — Home Screen App Widget

`res/layout/sos_widget.xml` — a single red pill button plus a state label.

`SosWidgetProvider : AppWidgetProvider` renders it, and tapping the button
launches the same `linq://sos` intent.

Widget updates should be pushed from the app whenever SOS state changes:

```kotlin
// from the app, after an incident starts/ends
val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
  .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds)
sendBroadcast(intent)
```

`res/xml/sos_widget_info.xml` needs `android:previewImage`, `minWidth 180dp`,
`updatePeriodMillis="1800000"`, and `android:resizeMode="horizontal|vertical"`.

---

## iOS — App Intent + Interactive Widget (iOS 17+)

Requires a bare/prebuild native target; there is no Expo module for this.

### App Intent (Siri, Shortcuts, Control Center, Action Button)

```swift
// LinQSosIntent.swift
import AppIntents
import Foundation

@available(iOS 17.0, *)
struct RaiseLinQSOS: AppIntent {
  static var title: LocalizedStringResource = "Raise LinQ SOS"
  static var description = IntentDescription(
    "Opens LinQ so you can confirm an emergency alert."
  )
  // Must not be able to run while the device is locked.
  static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  @MainActor
  func perform() async throws -> some IntentResult {
    // Open the confirmation screen. iOS raises the unlock prompt first, which
    // is the only legal path from a locked device.
    await MainActor.run {
      UIApplication.shared.open(URL(string: "linq://sos")!)
    }
    return .result()
  }
}

// Expose it as a Shortcut / App Shortcut
@available(iOS 17.0, *)
struct LinQShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: RaiseLinQSOS(),
      phrases: ["Raise SOS with \(.applicationName)"],
      shortTitle: "SOS",
      systemImageName: "exclamationmark.triangle.fill"
    )
  }
}
```

`authenticationPolicy: .requiresAuthentication` is what forces the unlock
prompt. Removing it would let the intent run while locked, but iOS would then
withhold location and the alert could go out with a stale position — so do not
remove it.

### Interactive Widget

```swift
// SosWidget.swift
import WidgetKit
import SwiftUI
import AppIntents

@available(iOS 17.0, *)
struct SosWidgetEntry: TimelineEntry { let date: Date }

@available(iOS 17.0, *)
struct SosWidgetView: View {
  var body: some View {
    Button(intent: RaiseLinQSOS()) {
      VStack(spacing: 6) {
        Image(systemName: "exclamationmark.triangle.fill").font(.title)
        Text("SOS").font(.caption.bold())
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color(red: 0.94, green: 0.27, blue: 0.27))
      .foregroundStyle(.white)
      .clipShape(RoundedRectangle(cornerRadius: 16))
    }
    .buttonStyle(.plain)
  }
}

@available(iOS 17.0, *)
struct SosWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "SosWidget", provider: SosProvider()) { entry in
      SosWidgetView().containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName("LinQ SOS")
    .description("Raise a LinQ emergency alert.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
  }
}
```

`.accessoryCircular` / `.accessoryRectangular` are what place it in the **Lock
Screen** slot in iOS 17+.

---

## What must be added to the app once native targets exist

1. `scheme: "linq"` is already set in `app.json` — nothing to change.
2. `src/hooks/useSosDeepLink.ts` already routes `linq://sos` to confirmation.
3. Mirror SOS state to the tile/widget after activation and after ending, so the
   control reflects reality and refuses to stack duplicate incidents.

## Testing checklist

- [ ] Tile appears in the quick-settings editor and is draggable
- [ ] Tapping the tile from the **lock screen** opens the unlock prompt, then
      the SOS confirmation screen
- [ ] Tile greys out and reads "SOS ACTIVE" while an incident is running
- [ ] Tapping the tile during an active incident does **not** create a second
      incident
- [ ] Home-screen widget opens the same confirmation screen
- [ ] iOS Action Button / Control Center / Shortcut triggers the intent and
      requires unlock
- [ ] After activation, the dashboard and the rider's emergency contacts are
      notified exactly once

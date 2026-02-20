# SNT Portal Android (WebView)

Android wrapper for the existing web portal.

## Build debug APK

```bash
cd mobile-android
./gradlew assembleDebug -PPORTAL_BASE_URL=https://<production-web-domain>
```

Output APK:

`app/build/outputs/apk/debug/app-debug.apk`

## Install on a test device

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Notes

- `PORTAL_BASE_URL` must be HTTPS.
- Default `PORTAL_BASE_URL` is `https://app.snt-portal.ru` and can be overridden via `-PPORTAL_BASE_URL=...`.
- External links outside the portal domain are opened with Android `ACTION_VIEW`.
- Geolocation prompts runtime location permission (`ACCESS_FINE_LOCATION`).
- If `gradle/wrapper/gradle-wrapper.jar` is missing in your local checkout, run `gradle wrapper` once after installing JDK 17+ and Gradle.

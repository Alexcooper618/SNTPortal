# SNT Portal Android (Native v1)

Android app migrated to native stack:

- `Kotlin + Jetpack Compose`
- `Hilt DI`
- `Retrofit/OkHttp` with token refresh
- `EncryptedSharedPreferences` session storage
- Native tabs: `Главная`, `Новости`, `Чат`, `Профиль`
- Web fallback for non-native sections

## Build debug APK

```bash
cd mobile-android
./gradlew assembleDebug -PPORTAL_BASE_URL=https://app.snt-portal.ru -PNATIVE_APP_ENABLED=true
```

Output APK:

`app/build/outputs/apk/debug/app-debug.apk`

## Feature flags

- `PORTAL_BASE_URL` — base portal URL (`https://app.snt-portal.ru` by default)
- `NATIVE_APP_ENABLED` — turn native shell on/off (`true` by default)

If `NATIVE_APP_ENABLED=false`, app opens full web portal fallback.

## Install on device

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

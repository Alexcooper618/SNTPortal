plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun escapeBuildConfig(value: String): String =
    value.replace("\\", "\\\\").replace("\"", "\\\"")

val defaultPortalBaseUrl = "https://app.snt-portal.ru"
val configuredPortalBaseUrl =
    (project.findProperty("PORTAL_BASE_URL") as String?)
        ?.trim()
        ?.ifEmpty { null }
        ?: defaultPortalBaseUrl

android {
    namespace = "ru.snt.portal"
    compileSdk = 34

    defaultConfig {
        applicationId = "ru.snt.portal"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField(
            "String",
            "PORTAL_BASE_URL",
            "\"${escapeBuildConfig(configuredPortalBaseUrl)}\""
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("com.google.android.material:material:1.12.0")
}

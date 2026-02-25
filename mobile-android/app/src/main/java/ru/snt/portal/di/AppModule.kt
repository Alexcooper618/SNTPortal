package ru.snt.portal.di

import android.content.Context
import androidx.room.Room
import com.google.gson.Gson
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import ru.snt.portal.BuildConfig
import ru.snt.portal.core.network.AuthInterceptor
import ru.snt.portal.core.network.PortalApi
import ru.snt.portal.core.network.TokenAuthenticator
import ru.snt.portal.core.network.resolvePortalConfig
import ru.snt.portal.core.session.EncryptedSessionStore
import ru.snt.portal.core.storage.PortalDatabase
import ru.snt.portal.core.storage.dao.ChatMessageDao
import ru.snt.portal.core.storage.dao.ChatRoomDao
import ru.snt.portal.core.storage.dao.NewsPostDao
import ru.snt.portal.core.session.SessionStore
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideGson(): Gson = Gson()

    @Provides
    @Singleton
    @Named("apiBaseUrl")
    fun provideApiBaseUrl(): String = resolvePortalConfig().apiBaseUrl

    @Provides
    @Singleton
    @Named("portalBaseUrl")
    fun providePortalBaseUrl(): String = resolvePortalConfig().portalBaseUrl

    @Provides
    @Singleton
    @Named("nativeAppEnabled")
    fun provideNativeAppEnabled(): Boolean = BuildConfig.NATIVE_APP_ENABLED

    @Provides
    @Singleton
    fun providePortalDatabase(
        @ApplicationContext context: Context,
    ): PortalDatabase {
        return Room.databaseBuilder(
            context,
            PortalDatabase::class.java,
            "portal_cache.db",
        ).fallbackToDestructiveMigration().build()
    }

    @Provides
    fun provideChatRoomDao(db: PortalDatabase): ChatRoomDao = db.chatRoomDao()

    @Provides
    fun provideChatMessageDao(db: PortalDatabase): ChatMessageDao = db.chatMessageDao()

    @Provides
    fun provideNewsPostDao(db: PortalDatabase): NewsPostDao = db.newsPostDao()

    @Provides
    @Singleton
    fun provideLoggingInterceptor(): HttpLoggingInterceptor {
        val level = if (BuildConfig.DEBUG) {
            HttpLoggingInterceptor.Level.BASIC
        } else {
            HttpLoggingInterceptor.Level.NONE
        }
        return HttpLoggingInterceptor().apply { this.level = level }
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(
        authInterceptor: AuthInterceptor,
        tokenAuthenticator: TokenAuthenticator,
        loggingInterceptor: HttpLoggingInterceptor,
    ): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(loggingInterceptor)
            .authenticator(tokenAuthenticator)
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(
        client: OkHttpClient,
        gson: Gson,
        @Named("apiBaseUrl") apiBaseUrl: String,
    ): Retrofit {
        return Retrofit.Builder()
            .baseUrl(apiBaseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }

    @Provides
    @Singleton
    fun providePortalApi(retrofit: Retrofit): PortalApi = retrofit.create(PortalApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class StorageModule {
    @Binds
    @Singleton
    abstract fun bindSessionStore(impl: EncryptedSessionStore): SessionStore
}

package ru.snt.portal

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebResourceErrorCompat
import androidx.webkit.WebViewClientCompat
import java.util.Locale

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var errorContainer: LinearLayout
    private lateinit var errorMessage: TextView
    private lateinit var retryButton: Button
    private lateinit var portalHost: String
    private lateinit var portalUrl: String

    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null

    private val locationPermissionRequester =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val callback = pendingGeoCallback
            val origin = pendingGeoOrigin
            if (callback != null && origin != null) {
                callback.invoke(origin, granted, false)
            }
            pendingGeoOrigin = null
            pendingGeoCallback = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.web_view)
        errorContainer = findViewById(R.id.error_container)
        errorMessage = findViewById(R.id.error_message)
        retryButton = findViewById(R.id.retry_button)

        val baseUrl = BuildConfig.PORTAL_BASE_URL.trim()
        val baseUri = Uri.parse(baseUrl)
        val host = baseUri.host?.lowercase(Locale.US).orEmpty()

        if (baseUri.scheme != "https" || host.isEmpty()) {
            showBlockingError(getString(R.string.invalid_base_url, baseUrl))
            return
        }

        portalHost = host
        portalUrl = baseUri.toString()

        configureWebView()

        retryButton.setOnClickListener {
            webView.loadUrl(portalUrl)
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (::webView.isInitialized && webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        )

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(portalUrl)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::webView.isInitialized) {
            webView.saveState(outState)
        }
    }

    @Suppress("SetJavaScriptEnabled")
    private fun configureWebView() {
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setGeolocationEnabled(true)
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            allowFileAccess = false
            allowContentAccess = false
            userAgentString = "$userAgentString SntPortalAndroid/0.1"
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                if (origin == null || callback == null) {
                    callback?.invoke(origin, false, false)
                    return
                }

                val hasPermission = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED

                if (hasPermission) {
                    callback.invoke(origin, true, false)
                    return
                }

                pendingGeoOrigin = origin
                pendingGeoCallback = callback
                locationPermissionRequester.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return handleNavigation(request.url)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                return handleNavigation(Uri.parse(url))
            }

            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                hideBlockingError()
            }

            override fun onReceivedSslError(
                view: WebView,
                handler: SslErrorHandler,
                error: SslError
            ) {
                handler.cancel()
                showBlockingError(getString(R.string.ssl_error))
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceErrorCompat
            ) {
                super.onReceivedError(view, request, error)
                if (request.isForMainFrame) {
                    showBlockingError(getString(R.string.network_error))
                }
            }

            override fun onReceivedHttpError(
                view: WebView,
                request: WebResourceRequest,
                errorResponse: WebResourceResponse
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                if (request.isForMainFrame && errorResponse.statusCode >= 500) {
                    showBlockingError(getString(R.string.server_error))
                }
            }
        }
    }

    private fun handleNavigation(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase(Locale.US).orEmpty()

        return when (scheme) {
            "http", "https" -> {
                val targetHost = uri.host?.lowercase(Locale.US)
                if (targetHost == portalHost) {
                    false
                } else {
                    openExternal(uri)
                    true
                }
            }

            "tel", "mailto" -> {
                openExternal(uri)
                true
            }

            "about", "data", "blob", "javascript" -> false

            else -> {
                openExternal(uri)
                true
            }
        }
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            // Keep app stable if no activity can handle the intent.
        }
    }

    private fun showBlockingError(message: String) {
        errorMessage.text = message
        errorContainer.visibility = View.VISIBLE
        webView.visibility = View.GONE
    }

    private fun hideBlockingError() {
        errorContainer.visibility = View.GONE
        webView.visibility = View.VISIBLE
    }
}

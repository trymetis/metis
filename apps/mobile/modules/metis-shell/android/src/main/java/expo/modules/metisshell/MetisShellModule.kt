package expo.modules.metisshell

import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MetisShellModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MetisShell")

    AsyncFunction("clearStorageData") { promise: Promise ->
      val cookies = CookieManager.getInstance()
      cookies.removeAllCookies { _ ->
        cookies.flush()
        WebStorage.getInstance().deleteAllData()
        clearHttpCache()
        promise.resolve()
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("clearCache") { promise: Promise ->
      WebStorage.getInstance().deleteAllData()
      clearHttpCache()
      promise.resolve()
    }.runOnQueue(Queues.MAIN)
  }

  private fun clearHttpCache() {
    val context = appContext.reactContext ?: return
    val webView = WebView(context)
    webView.clearCache(true)
    webView.destroy()
  }
}

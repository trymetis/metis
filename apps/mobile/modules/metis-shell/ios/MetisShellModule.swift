import ExpoModulesCore
import WebKit

public class MetisShellModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MetisShell")

    AsyncFunction("clearStorageData") { (promise: Promise) in
      WKWebsiteDataStore.default().removeData(
        ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
        modifiedSince: .distantPast
      ) {
        HTTPCookieStorage.shared.removeCookies(since: .distantPast)
        URLCache.shared.removeAllCachedResponses()
        promise.resolve()
      }
    }.runOnQueue(.main)

    AsyncFunction("clearCache") { (promise: Promise) in
      let types: Set<String> = [
        WKWebsiteDataTypeDiskCache,
        WKWebsiteDataTypeMemoryCache,
        WKWebsiteDataTypeIndexedDBDatabases,
        WKWebsiteDataTypeFileSystem,
      ]
      WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: .distantPast) {
        URLCache.shared.removeAllCachedResponses()
        promise.resolve()
      }
    }.runOnQueue(.main)
  }
}

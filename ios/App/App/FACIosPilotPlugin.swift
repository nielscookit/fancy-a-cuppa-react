import Capacitor
import Foundation
import Security

@objc(FACIosPilotPlugin)
final class FACIosPilotPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "FACIosPilotPlugin"
    let jsName = "FACIosPilot"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "saveTea", returnType: CAPPluginReturnPromise)]

    private let keychainItem: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.fancyacuppa.app.ios-pilot",
        kSecAttrAccount as String: "community-tea-v4",
        kSecAttrSynchronizable as String: false
    ]
    private let session = URLSession(configuration: .ephemeral, delegate: NoPilotRedirects(), delegateQueue: nil)

    override func load() {
        super.load()
        guard Self.isPilot, let provision = ProcessInfo.processInfo.environment["FAC_IOS_PILOT_PROVISION"] else { return }
        unsetenv("FAC_IOS_PILOT_PROVISION")
        guard Self.validToken(provision) else { return }
        let values: [String: Any] = [
            kSecValueData as String: Data(provision.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let status = SecItemUpdate(keychainItem as CFDictionary, values as CFDictionary)
        if status == errSecItemNotFound {
            _ = SecItemAdd(keychainItem.merging(values) { _, new in new } as CFDictionary, nil)
        }
    }

    @objc func saveTea(_ call: CAPPluginCall) {
        guard Self.isPilot, let token = readToken() else {
            call.reject("Pilot write access is unavailable. The catalogue remains available.", "PILOT_UNPROVISIONED")
            return
        }
        guard let payload = call.getString("payload"), payload.utf8.count <= 4_205_000,
              let url = URL(string: "https://zfkiiqqyapahxirguxgj.supabase.co/functions/v1/community-tea-v4") else {
            call.reject("Invalid pilot save request.", "PILOT_REQUEST")
            return
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 35)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(token, forHTTPHeaderField: "X-FAC-Pilot-Token")
        request.httpBody = Data(payload.utf8)

        session.dataTask(with: request) { data, response, _ in
            guard let response = response as? HTTPURLResponse,
                  (200...599).contains(response.statusCode),
                  !(300...399).contains(response.statusCode),
                  let data, let body = String(data: data, encoding: .utf8) else {
                call.reject("Save could not be confirmed. Try the same save again.", "PILOT_NETWORK")
                return
            }
            call.resolve(["status": response.statusCode, "body": body])
        }.resume()
    }

    private func readToken() -> String? {
        var query = keychainItem
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let token = String(data: data, encoding: .utf8),
              Self.validToken(token) else { return nil }
        return token
    }

    private static func validToken(_ token: String) -> Bool {
        token.utf8.count == 64 && token.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }

    private static var isPilot: Bool {
        let bundle = Bundle.main
        guard bundle.bundleIdentifier == "com.fancyacuppa.app",
              let index = bundle.url(forResource: "index", withExtension: "html", subdirectory: "public"),
              let html = try? String(contentsOf: index, encoding: .utf8) else { return false }
        return html.contains("name=\"fac-ios-pilot\"")
    }
}

private final class NoPilotRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

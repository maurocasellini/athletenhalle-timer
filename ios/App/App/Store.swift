import Foundation
import UIKit
import StoreKit
import Security
import Capacitor

/// In-app purchase "GRIT full version" (one-time, non-consumable, Family Sharing) + 3-day trial.
///
/// JS API (window.Capacitor.Plugins.Store):
///   status()     → { unlocked, trialStart, trialEnd, now, price?, productName? }
///   purchase()   → { result: purchased | pending | cancelled | failed | unavailable, unlocked }
///   restore()    → { unlocked }
///   redeemCode() → shows Apple's offer-code sheet; the result arrives as an "entitlement" event
///   event "entitlement" → { unlocked }  (purchases, redeemed codes, Family Sharing, refunds)
///
/// No server: StoreKit 2 verifies transactions on the device. Only the trial start date is
/// stored – in the device keychain, so reinstalling the app does not restart the trial.
@objc(StorePlugin)
public class StorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StorePlugin"
    public let jsName = "Store"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "redeemCode", returnType: CAPPluginReturnPromise),
    ]

    /// Must match the in-app purchase created in App Store Connect (type: Non-Consumable).
    static let productID = "com.maurocasellini.grit.full"
    static let trialDays: Double = 3

    private var updatesTask: Task<Void, Never>?
    private var cachedProduct: Product?

    override public func load() {
        // Purchases made elsewhere, redeemed offer codes, Family Sharing changes, refunds …
        updatesTask = Task.detached { [weak self] in
            for await update in Transaction.updates {
                if case .verified(let transaction) = update {
                    await transaction.finish()
                }
                await self?.emitEntitlement()
            }
        }
    }

    deinit { updatesTask?.cancel() }

    // MARK: helpers

    private func product() async -> Product? {
        if let p = cachedProduct { return p }
        let p = try? await Product.products(for: [Self.productID]).first
        cachedProduct = p
        return p
    }

    static func isUnlocked() async -> Bool {
        for await result in Transaction.currentEntitlements {
            if case .verified(let t) = result, t.productID == productID, t.revocationDate == nil {
                return true
            }
        }
        return false
    }

    private func emitEntitlement() async {
        let unlocked = await Self.isUnlocked()
        notifyListeners("entitlement", data: ["unlocked": unlocked])
    }

    // MARK: JS methods

    @objc func status(_ call: CAPPluginCall) {
        Task {
            let unlocked = await Self.isUnlocked()
            let p = await product()
            let start = TrialClock.startMs()
            var result: [String: Any] = [
                "unlocked": unlocked,
                "trialStart": start,
                "trialEnd": start + Self.trialDays * 86_400_000,
                "now": Date().timeIntervalSince1970 * 1000,
            ]
            if let p = p {
                result["price"] = p.displayPrice
                result["productName"] = p.displayName
            }
            call.resolve(result)
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        Task {
            guard let p = await product() else {
                call.resolve(["result": "unavailable", "unlocked": false])
                return
            }
            do {
                switch try await p.purchase() {
                case .success(let verification):
                    if case .verified(let t) = verification {
                        await t.finish()
                        call.resolve(["result": "purchased", "unlocked": true])
                    } else {
                        let unlocked = await Self.isUnlocked()
                        call.resolve(["result": "failed", "unlocked": unlocked])
                    }
                case .pending:
                    // e.g. "Ask to Buy" – the outcome arrives later as an "entitlement" event
                    call.resolve(["result": "pending", "unlocked": false])
                case .userCancelled:
                    call.resolve(["result": "cancelled", "unlocked": false])
                @unknown default:
                    call.resolve(["result": "failed", "unlocked": false])
                }
            } catch {
                call.resolve(["result": "failed", "unlocked": false, "error": error.localizedDescription])
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            try? await AppStore.sync()
            let unlocked = await Self.isUnlocked()
            call.resolve(["unlocked": unlocked])
        }
    }

    @objc func redeemCode(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if #available(iOS 16.0, *), let scene = self.bridge?.viewController?.view.window?.windowScene {
                Task { @MainActor in
                    try? await AppStore.presentOfferCodeRedeemSheet(in: scene)
                    call.resolve()
                }
            } else {
                SKPaymentQueue.default().presentCodeRedemptionSheet()
                call.resolve()
            }
        }
    }
}

// MARK: - Trial start (device keychain only)

enum TrialClock {
    private static let account = "grit.trialStart"

    /// First call ever stores "now"; later calls return that same moment.
    static func startMs() -> Double {
        if let saved = read() { return saved }
        let now = Date().timeIntervalSince1970 * 1000
        write(now)
        return now
    }

    private static func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Bundle.main.bundleIdentifier ?? "grit",
            kSecAttrAccount as String: account,
        ]
    }

    private static func read() -> Double? {
        var q = baseQuery()
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data,
              let text = String(data: data, encoding: .utf8),
              let value = Double(text) else { return nil }
        return value
    }

    private static func write(_ value: Double) {
        var q = baseQuery()
        SecItemDelete(q as CFDictionary)
        q[kSecValueData as String] = Data(String(value).utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }
}

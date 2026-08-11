import Capacitor
import StoreKit

@objc(StoreKitPlugin)
public final class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPlugin"
    public let jsName = "MahjongStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise)
    ]

    @objc public func purchase(_ call: CAPPluginCall) {
        guard let productID = productID(call) else { return }
        Task {
            do {
                guard let product = try await Product.products(for: [productID]).first else {
                    call.reject("The App Store product is unavailable.", "product_unavailable")
                    return
                }
                switch try await product.purchase() {
                case .success(let result):
                    guard case .verified(let transaction) = result else {
                        call.reject("The App Store could not verify this transaction.", "unverified_transaction")
                        return
                    }
                    resolve(call, result: result, transaction: transaction, status: "purchased")
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.reject("The App Store returned an unknown purchase state.", "unknown_purchase_state")
                }
            } catch {
                call.reject("The purchase could not be completed.", "purchase_failed")
            }
        }
    }

    @objc public func currentEntitlement(_ call: CAPPluginCall) {
        guard let productID = productID(call) else { return }
        Task { await entitlement(productID: productID, call: call, status: "entitled") }
    }

    @objc public func restore(_ call: CAPPluginCall) {
        guard let productID = productID(call) else { return }
        Task {
            do {
                // Apple requires this to be triggered by an explicit Restore tap.
                try await AppStore.sync()
                await entitlement(productID: productID, call: call, status: "restored")
            } catch {
                call.reject("Purchases could not be restored.", "restore_failed")
            }
        }
    }

    @objc public func finish(_ call: CAPPluginCall) {
        guard let transactionID = call.getString("transactionId") else {
            call.reject("A transaction id is required.", "missing_transaction_id")
            return
        }
        Task {
            for await result in Transaction.unfinished {
                guard case .verified(let transaction) = result else { continue }
                if String(transaction.id) == transactionID {
                    await transaction.finish()
                    call.resolve()
                    return
                }
            }
            // A transaction that is already finished is still a successful end
            // state; finishing is idempotent from the bridge's point of view.
            call.resolve()
        }
    }

    private func productID(_ call: CAPPluginCall) -> String? {
        guard let value = call.getString("productId"), !value.isEmpty else {
            call.reject("A product id is required.", "missing_product_id")
            return nil
        }
        return value
    }

    private func entitlement(productID: String, call: CAPPluginCall, status: String) async {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            if transaction.productID == productID {
                resolve(call, result: result, transaction: transaction, status: status)
                return
            }
        }
        call.resolve(["status": "not_found"])
    }

    private func resolve(
        _ call: CAPPluginCall,
        result: VerificationResult<Transaction>,
        transaction: Transaction,
        status: String
    ) {
        call.resolve([
            "status": status,
            "productId": transaction.productID,
            "transactionId": String(transaction.id),
            "signedTransaction": result.jwsRepresentation
        ])
    }
}

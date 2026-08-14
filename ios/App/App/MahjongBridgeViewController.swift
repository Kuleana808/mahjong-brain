import Capacitor
import UIKit

@objc(AccessibilityPreferencesPlugin)
final class AccessibilityPreferencesPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AccessibilityPreferencesPlugin"
    let jsName = "MahjongAccessibility"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "preferences", returnType: CAPPluginReturnPromise)
    ]

    override func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(preferencesDidChange),
            name: UIContentSizeCategory.didChangeNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(preferencesDidChange),
            name: UIAccessibility.reduceMotionStatusDidChangeNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(preferencesDidChange),
            name: UIAccessibility.darkerSystemColorsStatusDidChangeNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc func preferences(_ call: CAPPluginCall) {
        call.resolve(currentPreferences())
    }

    @objc private func preferencesDidChange() {
        notifyListeners("change", data: currentPreferences())
    }

    private func currentPreferences() -> [String: Any] {
        let category = bridge?.viewController?.traitCollection.preferredContentSizeCategory
            ?? UIApplication.shared.preferredContentSizeCategory
        return [
            "textScale": textScale(category),
            "reduceMotion": UIAccessibility.isReduceMotionEnabled,
            "increaseContrast": UIAccessibility.isDarkerSystemColorsEnabled
        ]
    }

    private func textScale(_ category: UIContentSizeCategory) -> Double {
        switch category {
        case .extraSmall: return 0.88
        case .small: return 0.94
        case .medium: return 0.97
        case .large: return 1.0
        case .extraLarge: return 1.12
        case .extraExtraLarge: return 1.23
        case .extraExtraExtraLarge: return 1.35
        case .accessibilityMedium: return 1.5
        case .accessibilityLarge: return 1.65
        case .accessibilityExtraLarge: return 1.8
        case .accessibilityExtraExtraLarge: return 1.95
        case .accessibilityExtraExtraExtraLarge: return 2.1
        default: return 1.0
        }
    }
}

final class MahjongBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AccessibilityPreferencesPlugin())
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(StoreKitPlugin())
        bridge?.registerPluginInstance(AdMobPlugin())
        bridge?.registerPluginInstance(GameCenterPlugin())
    }
}

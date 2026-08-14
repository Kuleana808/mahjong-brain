import Capacitor
import GoogleMobileAds
import UserMessagingPlatform

@objc(AdMobPlugin)
public final class AdMobPlugin: CAPPlugin, CAPBridgedPlugin, FullScreenContentDelegate {
    public let identifier = "AdMobPlugin"
    public let jsName = "MahjongAds"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showRewarded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showInterstitial", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showPrivacyOptions", returnType: CAPPluginReturnPromise)
    ]

    private var rewarded: [String: RewardedAd] = [:]
    private var interstitial: InterstitialAd?
    private var pendingCall: CAPPluginCall?
    private var pendingEarned = false
    private var configured = false

    private let testRewardedID = "ca-app-pub-3940256099942544/1712485313"
    private let testInterstitialID = "ca-app-pub-3940256099942544/4411468910"

    @objc public func configure(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                let parameters = RequestParameters()
                try await ConsentInformation.shared.requestConsentInfoUpdate(with: parameters)
                try await ConsentForm.loadAndPresentIfRequired(from: bridge?.viewController)
                guard ConsentInformation.shared.canRequestAds else {
                    call.resolve(statusPayload(reason: "Consent is not ready."))
                    return
                }
                guard appIdentifierConfigured else {
                    call.resolve(statusPayload(reason: "Production AdMob identifiers are not configured."))
                    return
                }
                // Launch with contextual ads only. This keeps the revenue path
                // independent of ATT and prevents the SDK's default first-party
                // identifier from becoming an undeclared personalization input.
                MobileAds.shared.requestConfiguration.setPublisherFirstPartyIDEnabled(false)
                MobileAds.shared.requestConfiguration.publisherPrivacyPersonalizationState = .disabled
                await MobileAds.shared.start()
                configured = true
                await preloadAll()
                call.resolve(statusPayload(reason: nil))
            } catch {
                call.resolve(statusPayload(reason: "Consent could not be completed."))
            }
        }
    }

    @objc public func status(_ call: CAPPluginCall) {
        Task { @MainActor in call.resolve(statusPayload(reason: nil)) }
    }

    @objc public func showRewarded(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard pendingCall == nil else {
                call.reject("Another ad is already open.", "ad_in_progress")
                return
            }
            guard let placement = call.getString("placement"), ["hint", "revive"].contains(placement) else {
                call.reject("A valid rewarded placement is required.", "invalid_placement")
                return
            }
            guard let ad = rewarded[placement], let viewController = bridge?.viewController else {
                call.resolve(["status": "unavailable"])
                await preloadRewarded(placement)
                return
            }
            if let customData = call.getString("customData"), !customData.isEmpty {
                let options = ServerSideVerificationOptions()
                options.customRewardText = customData
                ad.serverSideVerificationOptions = options
            }
            pendingCall = call
            pendingEarned = false
            rewarded[placement] = nil
            ad.fullScreenContentDelegate = self
            ad.present(from: viewController) { [weak self] in self?.pendingEarned = true }
        }
    }

    @objc public func showInterstitial(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard pendingCall == nil else {
                call.reject("Another ad is already open.", "ad_in_progress")
                return
            }
            guard let ad = interstitial, let viewController = bridge?.viewController else {
                call.resolve(["status": "unavailable"])
                await preloadInterstitial()
                return
            }
            pendingCall = call
            interstitial = nil
            ad.fullScreenContentDelegate = self
            ad.present(from: viewController)
        }
    }

    @objc public func showPrivacyOptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                try await ConsentForm.presentPrivacyOptionsForm(from: bridge?.viewController)
                call.resolve()
            } catch {
                call.reject("Privacy options are unavailable.", "privacy_options_unavailable")
            }
        }
    }

    @MainActor public func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        let call = pendingCall
        pendingCall = nil
        if ad is RewardedAd {
            call?.resolve(["status": pendingEarned ? "completed" : "dismissed"])
            pendingEarned = false
            Task { await preloadRewarded("hint"); await preloadRewarded("revive") }
        } else {
            call?.resolve(["status": "completed"])
            Task { await preloadInterstitial() }
        }
    }

    @MainActor public func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        pendingCall?.resolve(["status": "error", "message": "The ad could not be shown."])
        pendingCall = nil
        pendingEarned = false
        Task { await preloadAll() }
    }

    @MainActor private func preloadAll() async {
        await preloadRewarded("hint")
        await preloadRewarded("revive")
        await preloadInterstitial()
    }

    @MainActor private func preloadRewarded(_ placement: String) async {
        guard configured, rewarded[placement] == nil, let id = rewardedID(placement) else { return }
        do { rewarded[placement] = try await RewardedAd.load(with: id, request: Request()) }
        catch { rewarded[placement] = nil }
    }

    @MainActor private func preloadInterstitial() async {
        guard configured, interstitial == nil, let id = configuredID("ADMOB_INTERSTITIAL_ID", test: testInterstitialID) else { return }
        do { interstitial = try await InterstitialAd.load(with: id, request: Request()) }
        catch { interstitial = nil }
    }

    private func rewardedID(_ placement: String) -> String? {
        configuredID(placement == "hint" ? "ADMOB_REWARDED_HINT_ID" : "ADMOB_REWARDED_REVIVE_ID", test: testRewardedID)
    }

    private var debugBuild: Bool {
        (Bundle.main.object(forInfoDictionaryKey: "CAPACITOR_DEBUG") as? String) == "true"
    }

    private var appIdentifierConfigured: Bool {
        debugBuild || configuredID("GADApplicationIdentifier", test: nil) != nil
    }

    private func configuredID(_ key: String, test: String?) -> String? {
        if debugBuild { return test }
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String,
              value.hasPrefix("ca-app-pub-"), !value.contains("$(") else { return nil }
        return value
    }

    @MainActor private func statusPayload(reason: String?) -> [String: Any] {
        var payload: [String: Any] = [
            "configured": configured,
            "canRequestAds": ConsentInformation.shared.canRequestAds,
            "privacyOptionsRequired": ConsentInformation.shared.privacyOptionsRequirementStatus == .required,
            "hintReady": rewarded["hint"] != nil,
            "reviveReady": rewarded["revive"] != nil,
            "interstitialReady": interstitial != nil
        ]
        if let reason { payload["reason"] = reason }
        return payload
    }
}

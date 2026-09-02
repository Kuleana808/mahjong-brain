import AuthenticationServices
import Capacitor

@objc(AppleSignInPlugin)
public final class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin,
    ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var controller: ASAuthorizationController?

    @objc public func signIn(_ call: CAPPluginCall) {
        guard pendingCall == nil else {
            call.reject("A sign-in request is already active.", "sign_in_active")
            return
        }

        pendingCall = call
        let request = ASAuthorizationAppleIDProvider().createRequest()
        // Mahjong Brain does not need a name or email. The opaque Apple subject
        // and identity token are sufficient for account and unlock recovery.
        request.requestedScopes = []

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        self.controller = controller
        controller.performRequests()
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let tokenData = credential.identityToken,
            let identityToken = String(data: tokenData, encoding: .utf8)
        else {
            finishReject("Apple did not return an identity token.", code: "missing_identity_token")
            return
        }

        pendingCall?.resolve([
            "identityToken": identityToken,
            "userIdentifier": credential.user
        ])
        finish()
    }

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        let authError = error as? ASAuthorizationError
        if authError?.code == .canceled {
            finishReject("Sign in was cancelled.", code: "cancelled")
        } else {
            finishReject("Sign in with Apple could not be completed.", code: "apple_sign_in_failed")
        }
    }

    private func finishReject(_ message: String, code: String) {
        pendingCall?.reject(message, code)
        finish()
    }

    private func finish() {
        pendingCall = nil
        controller = nil
    }
}

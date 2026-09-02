import Capacitor
import GameKit
import UIKit

@objc(GameCenterPlugin)
public final class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GameCenterPlugin"
    public let jsName = "MahjongGameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlockAchievement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showDashboard", returnType: CAPPluginReturnPromise)
    ]

    private var authenticationCall: CAPPluginCall?

    @objc public func authenticate(_ call: CAPPluginCall) {
        guard authenticationCall == nil else {
            call.reject("Game Center authentication is already in progress.", "authentication_in_progress")
            return
        }
        authenticationCall = call
        GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, error in
            guard let self else { return }
            DispatchQueue.main.async {
                if let viewController {
                    self.bridge?.viewController?.present(viewController, animated: true)
                    return
                }
                let active = self.authenticationCall
                self.authenticationCall = nil
                if let error {
                    active?.reject(error.localizedDescription, "authentication_failed", error)
                    return
                }
                active?.resolve(self.currentStatus())
            }
        }
    }

    @objc public func status(_ call: CAPPluginCall) {
        call.resolve(currentStatus())
    }

    @objc public func submitScore(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Sign in to Game Center first.", "not_authenticated")
            return
        }
        guard let leaderboardID = call.getString("leaderboardID"), !leaderboardID.isEmpty,
              let value = call.getInt("value"), value >= 0 else {
            call.reject("A leaderboardID and non-negative integer value are required.", "invalid_score")
            return
        }
        GKLeaderboard.submitScore(
            value,
            context: 0,
            player: GKLocalPlayer.local,
            leaderboardIDs: [leaderboardID]
        ) { error in
            if let error {
                call.reject(error.localizedDescription, "score_submission_failed", error)
            } else {
                call.resolve(["submitted": true])
            }
        }
    }

    @objc public func unlockAchievement(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Sign in to Game Center first.", "not_authenticated")
            return
        }
        guard let identifier = call.getString("identifier"), !identifier.isEmpty else {
            call.reject("An achievement identifier is required.", "invalid_achievement")
            return
        }
        let achievement = GKAchievement(identifier: identifier)
        achievement.percentComplete = min(100, max(0, call.getDouble("percentComplete") ?? 100))
        achievement.showsCompletionBanner = call.getBool("showsCompletionBanner") ?? true
        GKAchievement.report([achievement]) { error in
            if let error {
                call.reject(error.localizedDescription, "achievement_submission_failed", error)
            } else {
                call.resolve(["submitted": true])
            }
        }
    }

    @objc public func showDashboard(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Sign in to Game Center first.", "not_authenticated")
            return
        }
        DispatchQueue.main.async {
            let controller = GKGameCenterViewController(state: .dashboard)
            controller.gameCenterDelegate = self
            self.bridge?.viewController?.present(controller, animated: true)
            call.resolve(["presented": true])
        }
    }

    private func currentStatus() -> [String: Any] {
        let player = GKLocalPlayer.local
        return [
            "authenticated": player.isAuthenticated,
            "displayName": player.isAuthenticated ? player.displayName : "",
            "playerID": player.isAuthenticated ? player.gamePlayerID : ""
        ]
    }
}

extension GameCenterPlugin: GKGameCenterControllerDelegate {
    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}

//  AppState.swift
//  Auth phase + the cached profile every screen reads its targets from.

import SwiftUI

/// Deliberately file-scope rather than nested inside `AppState`: a type nested
/// in a `@MainActor` declaration can pick up that isolation, and an isolated
/// `==` can't satisfy `Equatable`'s nonisolated requirement.
enum Phase: Equatable {
    case launching
    case signedOut
    /// Signed in, but the server has no Profile row — onboarding is a
    /// web-app-only flow, so we point the user there rather than
    /// reimplementing a five-step wizard on a screen this small.
    case needsProfile
    case ready
}

@MainActor
final class AppState: ObservableObject {

    @Published private(set) var phase: Phase = .launching
    @Published private(set) var profile: Profile?
    @Published var signInError: String?
    @Published var isSigningIn = false

    /// Bumped whenever a log lands, so sibling tabs re-read their day without
    /// holding references to each other.
    @Published private(set) var dataVersion = 0

    private let api = APIClient.shared

    func bootstrap() async {
        AppConfig.restoreCookies()
        await loadProfile(initial: true)
    }

    func loadProfile(initial: Bool = false) async {
        do {
            profile = try await api.fetchProfile()
            phase = .ready
        } catch APIError.unauthorized {
            profile = nil
            phase = .signedOut
        } catch APIError.noProfile {
            profile = nil
            phase = .needsProfile
        } catch {
            // A dead server on a cold launch shouldn't dump the user at a login
            // screen they can't get past — keep them signed in and let each
            // screen surface its own "can't reach the server" state.
            if initial && phase == .launching {
                phase = profile == nil ? .signedOut : .ready
            }
        }
    }

    func signIn(email: String, password: String) async {
        isSigningIn = true
        signInError = nil
        defer { isSigningIn = false }
        do {
            try await api.signIn(email: email, password: password)
            await loadProfile()
            if phase == .signedOut {
                signInError = "Signed in, but the session didn't stick. Check the server address."
            }
        } catch {
            signInError = (error as? APIError)?.errorDescription ?? error.localizedDescription
            Haptics.failed()
        }
    }

    func signOut() async {
        await api.signOut()
        profile = nil
        phase = .signedOut
    }

    func markDataChanged() {
        dataVersion &+= 1
    }

    /// Re-reads the profile after a log that awards XP, so the dashboard's
    /// level and streak don't drift until the next cold launch.
    func refreshAfterLog() async {
        markDataChanged()
        if let updated = try? await api.fetchProfile() {
            profile = updated
        }
    }
}

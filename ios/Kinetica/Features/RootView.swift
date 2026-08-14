//  RootView.swift
//  Four tabs. Workouts are deliberately absent from this build.

import SwiftUI

@MainActor
struct RootView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        switch state.phase {
        case .launching:
            LaunchView()
        case .signedOut:
            LoginView()
        case .needsProfile:
            NeedsProfileView()
        case .ready:
            MainTabs()
        }
    }
}

@MainActor
private struct MainTabs: View {
    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Today", systemImage: "circle.hexagongrid") }
            NutritionView()
                .tabItem { Label("Food", systemImage: "fork.knife") }
            JournalView()
                .tabItem { Label("Journal", systemImage: "text.book.closed") }
            ProfileView()
                .tabItem { Label("You", systemImage: "person") }
        }
    }
}

@MainActor
private struct LaunchView: View {
    var body: some View {
        VStack(spacing: 18) {
            ChalkRing(progress: 0.72, lineWidth: 10)
                .frame(width: 76, height: 76)
            Text("Kinetica")
                .displayFont(28, .medium)
                .foregroundColor(.kInk)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .screenBackground()
    }
}

/// The onboarding wizard lives in the web app and only runs once; duplicating
/// it here would be five screens of work for a one-time flow.
@MainActor
private struct NeedsProfileView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Eyebrow("Almost there")
            Text("Finish setup in the browser")
                .displayFont(28, .medium)
                .foregroundColor(.kInk)
            Text("This account hasn't got a profile yet. Open Kinetica in Safari, run through onboarding once, then come back — everything after that happens here.")
                .bodyFont()
                .foregroundColor(.kInkMuted)
            Text(AppConfig.baseURLString)
                .utilityFont(12)
                .foregroundColor(.kAccent)
            Spacer()
            Button("Check again") {
                Task { await state.loadProfile() }
            }
            .buttonStyle(KPrimaryButtonStyle())
            Button("Sign out") {
                Task { await state.signOut() }
            }
            .buttonStyle(KQuietButtonStyle())
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .screenBackground()
    }
}

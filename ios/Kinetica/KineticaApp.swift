//  KineticaApp.swift
//  Kinetica — Iron & Chalk
//
//  Native client for the self-hosted Kinetica server. Built against the iOS 15
//  SDK (Xcode 13.2.1), so nothing here may use post-15 SwiftUI: no
//  NavigationStack, no presentationDetents, no Swift Charts.

import SwiftUI
import UIKit

@main
@MainActor
struct KineticaApp: App {
    @StateObject private var state = AppState()

    init() {
        Chrome.apply()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .tint(.kAccent)
                .task { await state.bootstrap() }
        }
    }
}

/// UIKit-level chrome. SwiftUI on iOS 15 still defers the tab and nav bars to
/// UIAppearance, and the default translucent grey reads as a stock utility app
/// — which is the exact look this design language exists to avoid.
enum Chrome {
    static func apply() {
        let background = UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(hex: 0x1C1A18) : UIColor(hex: 0xE8E4DC)
        }
        let ink = UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(hex: 0xEDE9E2) : UIColor(hex: 0x2B2825)
        }
        let accent = UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(hex: 0xD19E52) : UIColor(hex: 0xB8863B)
        }

        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithOpaqueBackground()
        tabAppearance.backgroundColor = background
        tabAppearance.shadowColor = ink.withAlphaComponent(0.12)
        for item in [tabAppearance.stackedLayoutAppearance, tabAppearance.inlineLayoutAppearance, tabAppearance.compactInlineLayoutAppearance] {
            item.normal.iconColor = ink.withAlphaComponent(0.45)
            item.normal.titleTextAttributes = [
                .foregroundColor: ink.withAlphaComponent(0.45),
                .font: UIFont.systemFont(ofSize: 10, weight: .medium),
            ]
            item.selected.iconColor = accent
            item.selected.titleTextAttributes = [
                .foregroundColor: accent,
                .font: UIFont.systemFont(ofSize: 10, weight: .semibold),
            ]
        }
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance

        let navAppearance = UINavigationBarAppearance()
        navAppearance.configureWithOpaqueBackground()
        navAppearance.backgroundColor = background
        navAppearance.shadowColor = .clear
        // Fraunces on the large title is the one place the display face earns
        // its keep in system chrome; it falls back to the serif system face if
        // the font files aren't bundled.
        let largeTitleFont = UIFont(name: "Fraunces-SemiBold", size: 30)
            ?? UIFont.systemFont(ofSize: 30, weight: .semibold)
        navAppearance.largeTitleTextAttributes = [.foregroundColor: ink, .font: largeTitleFont]
        navAppearance.titleTextAttributes = [
            .foregroundColor: ink,
            .font: UIFont(name: "Fraunces-Medium", size: 17) ?? UIFont.systemFont(ofSize: 17, weight: .medium),
        ]
        UINavigationBar.appearance().standardAppearance = navAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navAppearance
        UINavigationBar.appearance().compactAppearance = navAppearance
    }
}

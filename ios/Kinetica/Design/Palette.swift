//  Palette.swift
//  Iron & Chalk — Kinetica's colour tokens.
//
//  Never write a raw hex anywhere else in the app. Dark mode is not an
//  inversion of the light palette; it's the same gear photographed at night,
//  so each token carries its own dark value rather than being derived.

import SwiftUI
import UIKit

/// The single place a hex literal is allowed to appear. Both the named tokens
/// and the adaptive ones below read from here, so a palette change is one edit.
private enum Hex {
    // Light
    static let chalkFog: UInt32 = 0xE8E4DC
    static let bone: UInt32 = 0xF7F5F0
    static let iron: UInt32 = 0x2B2825
    static let ropeOchre: UInt32 = 0xB8863B
    static let deepMoss: UInt32 = 0x4A5D45
    static let ember: UInt32 = 0xC1502E

    // Dark
    static let ironDark: UInt32 = 0x1C1A18
    static let slate: UInt32 = 0x26231F
    static let boneDark: UInt32 = 0xEDE9E2
    static let ropeOchreDark: UInt32 = 0xD19E52
    /// Moss and ember also need lifting at night; the spec only names the
    /// accent, but the same contrast problem applies to both.
    static let deepMossDark: UInt32 = 0x7E9476
    static let emberDark: UInt32 = 0xE0714B
}

extension Color {

    // MARK: Named tokens
    //
    // The spec's vocabulary, fixed regardless of appearance. Reach for these
    // only where a colour must not change with the colour scheme — button
    // labels that always sit on ochre, for instance.

    /// Primary background — stone / chalk dust, not cream.
    static let chalkFog = Color(hex: Hex.chalkFog)
    /// Elevated surfaces, cards.
    static let bone = Color(hex: Hex.bone)
    /// Primary text and icons.
    static let iron = Color(hex: Hex.iron)
    /// Primary accent — CTAs, active states, selected tab.
    static let ropeOchre = Color(hex: Hex.ropeOchre)
    /// Secondary accent — completed states, positive trend.
    static let deepMoss = Color(hex: Hex.deepMoss)
    /// Reserved *only* for PRs, streak milestones, new records. Never decorative.
    static let ember = Color(hex: Hex.ember)

    static let ironDark = Color(hex: Hex.ironDark)
    static let slate = Color(hex: Hex.slate)
    static let boneDark = Color(hex: Hex.boneDark)
    static let ropeOchreDark = Color(hex: Hex.ropeOchreDark)

    // MARK: Adaptive tokens
    //
    // What views actually use. A dynamic `UIColor` provider gives automatic
    // light/dark resolution without threading a colour scheme through the
    // whole view tree.

    /// Page background.
    static let kBackground = dynamic(light: Hex.chalkFog, dark: Hex.ironDark)
    /// Card / elevated surface.
    static let kSurface = dynamic(light: Hex.bone, dark: Hex.slate)
    /// Primary text.
    static let kInk = dynamic(light: Hex.iron, dark: Hex.boneDark)
    /// Primary accent, contrast-lifted in the dark.
    static let kAccent = dynamic(light: Hex.ropeOchre, dark: Hex.ropeOchreDark)
    /// Secondary / positive accent.
    static let kMoss = dynamic(light: Hex.deepMoss, dark: Hex.deepMossDark)
    /// Earned-only accent. At most once per screen.
    static let kEmber = dynamic(light: Hex.ember, dark: Hex.emberDark)

    /// Muted text — ink at reduced weight rather than a separate grey, so it
    /// always sits in the same family as the body copy.
    static var kInkMuted: Color { kInk.opacity(0.58) }
    /// Faint hairlines and inactive ring tracks.
    static var kHairline: Color { kInk.opacity(0.12) }

    // MARK: Helpers

    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }

    private static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light)
        })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

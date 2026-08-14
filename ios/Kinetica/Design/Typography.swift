//  Typography.swift
//  Three type roles, each doing one job.
//
//  Display  — Fraunces. Numbers, headers, counts. The personality carrier;
//             big numbers should read as stamped, not printed.
//  Body     — SF Pro Rounded. Instructions, coaching copy, chat.
//  Utility  — SF Mono. Timestamps, macro tables, captions. Data reads as data.
//
//  Fraunces ships in Resources/Fonts and is registered via UIAppFonts. If the
//  files ever go missing the display role degrades to the system serif rather
//  than silently falling back to San Francisco, which would flatten the whole
//  identity.

import SwiftUI
import UIKit

enum KType {

    enum DisplayWeight {
        case medium, semibold

        var postScriptName: String {
            switch self {
            case .medium: return "Fraunces-Medium"
            case .semibold: return "Fraunces-SemiBold"
            }
        }

        var systemWeight: Font.Weight {
            switch self {
            case .medium: return .medium
            case .semibold: return .semibold
            }
        }
    }

    /// Default sizes from the spec. Dynamic Type scales relative to these.
    enum Size {
        /// Streak / PR numbers.
        static let displayXL: CGFloat = 56
        /// Section headers.
        static let display: CGFloat = 28
        /// Sub-headers and card figures.
        static let displaySmall: CGFloat = 20
        static let body: CGFloat = 17
        static let utility: CGFloat = 13
    }

    /// True once Fraunces has been registered by the system.
    static let hasFraunces: Bool = UIFont(name: "Fraunces-SemiBold", size: 12) != nil

    static func display(_ size: CGFloat, _ weight: DisplayWeight = .semibold, relativeTo style: Font.TextStyle = .title) -> Font {
        if hasFraunces {
            return .custom(weight.postScriptName, size: size, relativeTo: style)
        }
        return .system(size: size, weight: weight.systemWeight, design: .serif)
    }

    /// Past AX3 Fraunces starts breaking layouts at display sizes, so the spec
    /// hands off to rounded bold at a capped size instead of scaling further.
    static func displayCapped(_ size: CGFloat, _ weight: DisplayWeight, sizeCategory: ContentSizeCategory) -> Font {
        if sizeCategory > .accessibilityLarge {
            return .system(size: min(size, 34), weight: .bold, design: .rounded)
        }
        return display(size, weight)
    }

    static func body(_ size: CGFloat = Size.body, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }

    static func utility(_ size: CGFloat = Size.utility, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

// MARK: - View sugar

private struct DisplayFont: ViewModifier {
    @Environment(\.sizeCategory) private var sizeCategory
    let size: CGFloat
    let weight: KType.DisplayWeight

    func body(content: Content) -> some View {
        content.font(KType.displayCapped(size, weight, sizeCategory: sizeCategory))
    }
}

extension View {
    /// Fraunces at `size`, degrading to rounded bold past AX3.
    func displayFont(_ size: CGFloat, _ weight: KType.DisplayWeight = .semibold) -> some View {
        modifier(DisplayFont(size: size, weight: weight))
    }

    func bodyFont(_ size: CGFloat = KType.Size.body, weight: Font.Weight = .regular) -> some View {
        font(KType.body(size, weight: weight))
    }

    /// SF Mono for data. The spec asks for slight letter-spacing here, but
    /// `tracking`/`kerning` only arrived in iOS 16 — on this SDK the options are
    /// AttributedString gymnastics or going without, and mono is already wide
    /// enough that going without is the honest trade.
    func utilityFont(_ size: CGFloat = KType.Size.utility, weight: Font.Weight = .regular) -> some View {
        font(KType.utility(size, weight: weight))
    }
}

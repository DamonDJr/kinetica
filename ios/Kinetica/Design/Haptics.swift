//  Haptics.swift
//  Light on a logged entry, medium on something earned, nothing on navigation.
//  Routine taps staying silent is what makes the earned ones land.

import UIKit

enum Haptics {
    /// A meal, water, or journal entry landed.
    static func logged() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    /// A PR, streak milestone, or goal met — pairs with the one `ember` moment
    /// a screen is allowed.
    static func earned() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    static func failed() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}

// swift-tools-version: 6.2
// (6.2 rather than the xtool template's 6.0 — `.iOS(.v26)` isn't available in
// PackageDescription before then.)

// Second build system, same sources.
//
// `path: "Kinetica"` deliberately points at the existing source tree rather
// than moving it under Sources/, so the Xcode 13 project and xtool build the
// exact same files. Nothing here breaks the .xcodeproj, and either route can
// be abandoned without touching a line of app code.
//
// An xtool project is a *library* product — xtool supplies the app shell and
// links this in. That's why there's no executable target despite @main living
// in KineticaApp.swift.

import PackageDescription

let package = Package(
    name: "Kinetica",
    platforms: [
        // xtool builds against the iOS 26.4 SDK. The Xcode 13 project that
        // forced an iOS 15 ceiling is gone — `xtool dev generate-xcode-project`
        // makes a fresh one if an Xcode project is ever wanted again.
        .iOS(.v26),
    ],
    products: [
        .library(
            name: "Kinetica",
            targets: ["Kinetica"]
        ),
    ],
    targets: [
        .target(
            name: "Kinetica",
            path: "Kinetica",
            // Handled by xtool.yml, not SwiftPM: a library target's resources
            // land in a nested .bundle, which is the wrong place for fonts
            // registered via UIAppFonts and for the app icon.
            exclude: [
                "Resources",
            ],
            swiftSettings: [
                // The code is written in Swift 5 idioms and relies on closures
                // inheriting actor isolation. Swift 6's strict concurrency
                // would demand a rewrite that buys nothing here.
                .swiftLanguageMode(.v5),
            ]
        ),
    ]
)

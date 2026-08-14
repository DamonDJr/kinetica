// swift-tools-version: 6.0

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
        // Matches the Xcode project. Raising this is safe once the xtool route
        // is the only one in use — it would unlock NavigationStack and the rest
        // of the post-15 API surface the code currently works around.
        .iOS(.v15),
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
                "Info.plist",
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

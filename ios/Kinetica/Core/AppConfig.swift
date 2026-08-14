//  AppConfig.swift
//  Where the app points and how it remembers being signed in.

import Foundation

enum AppConfig {

    /// The Tailscale host the Next.js server runs on. Editable in Settings so
    /// the same build works against `next dev` on the LAN without a rebuild —
    /// which matters here, because re-signing a sideloaded app is a chore.
    static let defaultBaseURL = "https://damonj-pc.tailcc1d47.ts.net:9879"

    private static let baseURLKey = "kinetica.baseURL"
    private static let cookieKey = "kinetica.sessionCookies"

    static var baseURLString: String {
        get { UserDefaults.standard.string(forKey: baseURLKey) ?? defaultBaseURL }
        set {
            let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleaned = trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed
            UserDefaults.standard.set(cleaned, forKey: baseURLKey)
        }
    }

    static var baseURL: URL {
        URL(string: baseURLString) ?? URL(string: defaultBaseURL)!
    }

    // MARK: - Session cookie persistence
    //
    // Better Auth is cookie-session based with no bearer plugin enabled, so the
    // native client authenticates exactly like the browser does. `URLSession`
    // parses and attaches the cookie for us; we only snapshot it to
    // UserDefaults so a cold launch doesn't land on the login screen.

    static func persistCookies() {
        guard let cookies = HTTPCookieStorage.shared.cookies(for: baseURL), !cookies.isEmpty else { return }
        let payload = cookies.compactMap { $0.properties }.map { properties -> [String: String] in
            var flat: [String: String] = [:]
            for (key, value) in properties {
                if let string = value as? String {
                    flat[key.rawValue] = string
                } else if let date = value as? Date {
                    flat[key.rawValue] = String(date.timeIntervalSince1970)
                }
            }
            return flat
        }
        UserDefaults.standard.set(payload, forKey: cookieKey)
    }

    static func restoreCookies() {
        guard let payload = UserDefaults.standard.array(forKey: cookieKey) as? [[String: String]] else { return }
        for flat in payload {
            var properties: [HTTPCookiePropertyKey: Any] = [:]
            for (key, value) in flat {
                let cookieKey = HTTPCookiePropertyKey(key)
                if cookieKey == .expires {
                    if let seconds = TimeInterval(value) {
                        properties[cookieKey] = Date(timeIntervalSince1970: seconds)
                    }
                } else {
                    properties[cookieKey] = value
                }
            }
            if let cookie = HTTPCookie(properties: properties) {
                HTTPCookieStorage.shared.setCookie(cookie)
            }
        }
    }

    static func clearCookies() {
        UserDefaults.standard.removeObject(forKey: cookieKey)
        if let cookies = HTTPCookieStorage.shared.cookies(for: baseURL) {
            for cookie in cookies { HTTPCookieStorage.shared.deleteCookie(cookie) }
        }
    }
}

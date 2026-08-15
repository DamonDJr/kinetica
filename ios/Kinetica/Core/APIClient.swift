//  APIClient.swift
//  Thin client over the existing Next.js API.
//
//  The iOS app deliberately owns no business logic: totals, dedupe, BMR-backed
//  targets and the AI pipeline all stay server-side, so the phone and the web
//  app can never disagree about what was eaten. This file is transport only.

import Foundation

enum APIError: LocalizedError {
    case unauthorized
    case noProfile
    case message(String)
    case badResponse
    case offline

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Signed out — sign in again."
        case .noProfile: return "No profile on the server yet. Finish onboarding in the web app first."
        case .message(let text): return text
        case .badResponse: return "The server sent something unexpected."
        case .offline: return "Can't reach the server. Is Tailscale up and the PC awake?"
        }
    }
}

private struct ErrorEnvelope: Decodable {
    var error: String?
}

// MARK: - Request payloads

struct SignInPayload: Encodable {
    var email: String
    var password: String
}

struct WaterPayload: Encodable {
    var type = "water"
    var amountMl: Int
    var date: String?
}

struct MealPayload: Encodable {
    var type = "meal"
    var name: String
    var mealType: String
    var notes: String?
    var date: String?
    var items: [MealItem]
    /// "ai" | "photo" | "search" makes the server auto-save the food for reuse.
    /// Blank/manual entries deliberately pass nil so they don't pollute My Foods.
    var source: String?
    var servingDescription: String?
    var brand: String?
}

struct MealPatchPayload: Encodable {
    var id: String
    var name: String
    var mealType: String
    var notes: String?
    var date: String?
    var items: [MealItem]
}

struct BurnedPayload: Encodable {
    var kcal: Int
    var date: String?
}

struct JournalPayload: Encodable {
    var content: String
    var mood: Int
    var energy: Int?
    var context: String
    var isWin: Bool
}

struct JournalReplyPayload: Encodable {
    var entryId: String
}

struct AnalyzePayload: Encodable {
    var description: String
}

/// Three-state field for PATCH bodies.
///
/// The profile API distinguishes an *absent* key from a `null` one: absent
/// leaves the column alone, null clears it. Swift's synthesised encoder can't
/// express that — it drops nil optionals entirely — and the difference is not
/// academic here. `clampInt(null)` on the server coerces to 0 and clamps up to
/// the minimum, so sending `{"age": null}` would silently set the user's age
/// to 5. Every field that could be blank goes through this.
enum Field<T: Encodable> {
    /// Leave the server's value untouched.
    case omit
    /// Explicitly set the column to null.
    case clear
    case value(T)

    func encode<K: CodingKey>(into container: inout KeyedEncodingContainer<K>, forKey key: K) throws {
        switch self {
        case .omit: break
        case .clear: try container.encodeNil(forKey: key)
        case .value(let wrapped): try container.encode(wrapped, forKey: key)
        }
    }

    /// `.value` when parseable, otherwise the caller's choice of absent or null.
    static func optional(_ wrapped: T?, whenNil: Field<T> = .omit) -> Field<T> {
        if let wrapped = wrapped { return .value(wrapped) }
        return whenNil
    }
}

struct ProfileBasics: Encodable {
    var displayName: Field<String> = .omit
    var age: Field<Int> = .omit
    var gender: Field<String> = .omit
    var heightIn: Field<Double> = .omit
    var weightLbs: Field<Double> = .omit
    var goalWeightLbs: Field<Double> = .omit
    var bmrOverride: Field<Int> = .omit
    var activityLevel: Field<String> = .omit

    enum CodingKeys: String, CodingKey {
        case displayName, age, gender, heightIn, weightLbs, goalWeightLbs, bmrOverride, activityLevel
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try displayName.encode(into: &container, forKey: .displayName)
        try age.encode(into: &container, forKey: .age)
        try gender.encode(into: &container, forKey: .gender)
        try heightIn.encode(into: &container, forKey: .heightIn)
        try weightLbs.encode(into: &container, forKey: .weightLbs)
        try goalWeightLbs.encode(into: &container, forKey: .goalWeightLbs)
        try bmrOverride.encode(into: &container, forKey: .bmrOverride)
        try activityLevel.encode(into: &container, forKey: .activityLevel)
    }
}

struct ProfileBasicsPayload: Encodable {
    var basics: ProfileBasics
}

struct TargetsPayload: Encodable {
    struct Targets: Encodable {
        var calorieTargetMin: Int
        var calorieTargetMax: Int
        var proteinTargetG: Int
        var carbTargetG: Int?
        var fatTargetG: Int?
    }
    var targets: Targets
}

struct EmptyPayload: Encodable {}

// MARK: - Client

final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private init() {
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 30
        // The AI pipeline runs a local model that can chew for a while on a
        // photo or a long description; the streaming route's own cap is 120s.
        configuration.timeoutIntervalForResource = 180
        session = URLSession(configuration: configuration)

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            if let date = APIClient.isoWithFraction.date(from: raw) { return date }
            if let date = APIClient.isoPlain.date(from: raw) { return date }
            throw DecodingError.dataCorrupted(
                DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Unparseable date \(raw)")
            )
        }

        encoder = JSONEncoder()
    }

    private static let isoWithFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let isoPlain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// Day-window *query* param. The server parses this with `new Date()` and
    /// then snaps to its own local midnight, so sending a bare UTC instant
    /// would put late-evening and early-morning requests on the wrong day
    /// whenever the device isn't on GMT. Pinning to noon and carrying an
    /// explicit offset makes the intended day unambiguous either way.
    static func dayQuery(_ date: Date) -> String {
        let noon = Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: date) ?? date
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = TimeZone.current
        return formatter.string(from: noon)
    }

    /// Day param for a *write*, or nil when the entry belongs to today.
    ///
    /// The API pins any date it's given to 12:00 (so back-dated entries land
    /// inside the right day window regardless of timezone). That's correct for
    /// back-dating and wrong for logging now — passing today's date stamps the
    /// meal 12:00 instead of when it was actually eaten. Omitting the key lets
    /// the column default to `now()`.
    static func backdateParam(_ date: Date) -> String? {
        Calendar.current.isDateInToday(date) ? nil : dayString(date)
    }

    /// Day param for *write* bodies, which the API matches as `YYYY-MM-DD` and
    /// pins to noon server-side itself.
    static func dayString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    // MARK: Request building

    private func makeRequest(_ path: String, method: String, query: [URLQueryItem] = []) throws -> URLRequest {
        guard var components = URLComponents(
            url: AppConfig.baseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        ) else {
            throw APIError.message("Server address isn't a valid URL.")
        }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else {
            throw APIError.message("Server address isn't a valid URL.")
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // Better Auth validates the Origin header against `trustedOrigins`.
        // A native client sends none by default, so we present the server's own
        // origin — the same one the PWA sends.
        request.setValue(AppConfig.baseURLString, forHTTPHeaderField: "Origin")
        return request
    }

    private func validate(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
        guard !(200..<300).contains(http.statusCode) else { return }

        let detail = (try? decoder.decode(ErrorEnvelope.self, from: data))?.error
        switch http.statusCode {
        case 401: throw APIError.unauthorized
        case 404 where detail == "No profile": throw APIError.noProfile
        default: throw APIError.message(detail ?? "Request failed (\(http.statusCode)).")
        }
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        do {
            let (data, response) = try await session.data(for: request)
            try validate(response, data: data)
            AppConfig.persistCookies()
            return data
        } catch let error as APIError {
            throw error
        } catch let error as URLError where error.code == .cancelled {
            throw error
        } catch is URLError {
            throw APIError.offline
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.badResponse
        }
    }

    // MARK: Verbs

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = [], as type: T.Type) async throws -> T {
        let data = try await perform(try makeRequest(path, method: "GET", query: query))
        return try decode(T.self, from: data)
    }

    @discardableResult
    func send<Body: Encodable, T: Decodable>(
        _ path: String,
        method: String,
        body: Body,
        query: [URLQueryItem] = [],
        as type: T.Type
    ) async throws -> T {
        var request = try makeRequest(path, method: method, query: query)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        let data = try await perform(request)
        return try decode(T.self, from: data)
    }

    @discardableResult
    func delete<T: Decodable>(_ path: String, query: [URLQueryItem], as type: T.Type) async throws -> T {
        let data = try await perform(try makeRequest(path, method: "DELETE", query: query))
        return try decode(T.self, from: data)
    }

    // MARK: - Auth

    func signIn(email: String, password: String) async throws {
        var request = try makeRequest("api/auth/sign-in/email", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(SignInPayload(email: email, password: password))
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
            if !(200..<300).contains(http.statusCode) {
                let detail = (try? decoder.decode(ErrorEnvelope.self, from: data))?.error
                throw APIError.message(detail ?? "Wrong email or password.")
            }
            AppConfig.persistCookies()
        } catch let error as APIError {
            throw error
        } catch is URLError {
            throw APIError.offline
        }
    }

    func signOut() async {
        _ = try? await send("api/auth/sign-out", method: "POST", body: EmptyPayload(), as: OKEnvelope.self)
        AppConfig.clearCookies()
    }

    // MARK: - Profile

    func fetchProfile() async throws -> Profile {
        let envelope = try await get("api/profile", as: ProfileEnvelope.self)
        guard let profile = envelope.profile else { throw APIError.noProfile }
        return profile
    }

    func updateBasics(_ basics: ProfileBasics) async throws -> Profile {
        let envelope = try await send(
            "api/profile",
            method: "PATCH",
            body: ProfileBasicsPayload(basics: basics),
            as: ProfileEnvelope.self
        )
        guard let profile = envelope.profile else { throw APIError.noProfile }
        return profile
    }

    func updateTargets(_ targets: TargetsPayload.Targets) async throws -> Profile {
        let envelope = try await send(
            "api/profile",
            method: "PATCH",
            body: TargetsPayload(targets: targets),
            as: ProfileEnvelope.self
        )
        guard let profile = envelope.profile else { throw APIError.noProfile }
        return profile
    }

    // MARK: - Nutrition

    func fetchDay(_ date: Date) async throws -> NutritionDay {
        try await get(
            "api/nutrition",
            query: [URLQueryItem(name: "date", value: APIClient.dayQuery(date))],
            as: NutritionDay.self
        )
    }

    func fetchBurned(_ date: Date) async throws -> Int {
        let envelope = try await get(
            "api/nutrition/burned",
            query: [URLQueryItem(name: "date", value: APIClient.dayQuery(date))],
            as: BurnedEnvelope.self
        )
        return envelope.kcal
    }

    @discardableResult
    func setBurned(kcal: Int, date: Date) async throws -> Int {
        let envelope = try await send(
            "api/nutrition/burned",
            method: "POST",
            body: BurnedPayload(kcal: kcal, date: APIClient.dayString(date)),
            as: BurnedEnvelope.self
        )
        return envelope.kcal
    }

    @discardableResult
    func logMeal(_ payload: MealPayload) async throws -> Meal {
        try await send("api/nutrition", method: "POST", body: payload, as: MealEnvelope.self).meal
    }

    @discardableResult
    func updateMeal(_ payload: MealPatchPayload) async throws -> Meal {
        try await send("api/nutrition", method: "PATCH", body: payload, as: MealEnvelope.self).meal
    }

    func deleteMeal(id: String) async throws {
        try await delete("api/nutrition", query: [URLQueryItem(name: "id", value: id)], as: OKEnvelope.self)
    }

    func logWater(ml: Int, date: Date) async throws {
        try await send(
            "api/nutrition",
            method: "POST",
            body: WaterPayload(amountMl: ml, date: APIClient.backdateParam(date)),
            as: OKEnvelope.self
        )
    }

    func savedFoods(matching query: String, limit: Int = 30) async throws -> [SavedFood] {
        var items = [URLQueryItem(name: "limit", value: String(limit))]
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { items.append(URLQueryItem(name: "q", value: trimmed)) }
        return try await get("api/saved-foods", query: items, as: SavedFoodsEnvelope.self).foods
    }

    // MARK: - Body measurements

    func fetchMeasurements(days: Int = 180) async throws -> [Measurement] {
        try await get(
            "api/measurements",
            query: [URLQueryItem(name: "days", value: String(days))],
            as: MeasurementsEnvelope.self
        ).measurements
    }

    /// The server also syncs a new weight back onto the profile, so callers
    /// should refresh the profile afterwards or the targets will look stale.
    @discardableResult
    func logMeasurement(_ payload: MeasurementPayload) async throws -> Measurement {
        struct Envelope: Decodable { var measurement: Measurement }
        return try await send("api/measurements", method: "POST", body: payload, as: Envelope.self).measurement
    }

    func deleteMeasurement(id: String) async throws {
        try await delete("api/measurements", query: [URLQueryItem(name: "id", value: id)], as: OKEnvelope.self)
    }

    // MARK: - Journal

    func fetchJournal() async throws -> [JournalEntry] {
        try await get("api/journal", as: JournalEnvelope.self).entries
    }

    func logJournal(_ payload: JournalPayload) async throws -> JournalEntry {
        try await send("api/journal", method: "POST", body: payload, as: JournalEntryEnvelope.self).entry
    }

    /// Fire-and-forget follow-up: the entry is already saved, so a local model
    /// that's offline or slow costs us a reply, never the entry.
    func fetchCoachReply(entryId: String) async throws -> JournalEntry {
        try await send(
            "api/journal/reply",
            method: "POST",
            body: JournalReplyPayload(entryId: entryId),
            as: JournalEntryEnvelope.self
        ).entry
    }

    // MARK: - Streaming analyze

    /// POSTs a description to the multi-stage nutrition pipeline and reads its
    /// newline-delimited JSON, surfacing each stage as it lands so the button
    /// can say what the coach is actually doing.
    func analyze(description: String, onStage: @escaping (String) -> Void) async throws -> NutritionEstimate {
        var request = try makeRequest("api/nutrition/analyze", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(AnalyzePayload(description: description))

        let bytes: URLSession.AsyncBytes
        let response: URLResponse
        do {
            (bytes, response) = try await session.bytes(for: request)
        } catch is URLError {
            throw APIError.offline
        }

        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }

        let contentType = http.value(forHTTPHeaderField: "Content-Type") ?? ""
        guard contentType.contains("ndjson") else {
            // Auth / validation failures come back as ordinary JSON.
            var raw = Data()
            for try await byte in bytes { raw.append(byte) }
            try validate(response, data: raw)
            throw APIError.badResponse
        }

        var estimate: NutritionEstimate?
        var failure: String?

        for try await line in bytes.lines {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, let data = trimmed.data(using: .utf8) else { continue }
            guard let event = parseAnalyzeEvent(data) else { continue }
            switch event {
            case .stage(let label):
                await MainActor.run { onStage(label) }
            case .result(let value):
                estimate = value
            case .failure(let text):
                failure = text
            }
        }

        if let failure = failure { throw APIError.message(failure) }
        guard let estimate = estimate else {
            throw APIError.message("The coach didn't return an estimate. Try again, or log it blank.")
        }
        return estimate
    }

    private func parseAnalyzeEvent(_ data: Data) -> AnalyzeEvent? {
        struct Line: Decodable {
            var type: String
            var label: String?
            var error: String?
            var estimate: NutritionEstimate?
        }
        guard let line = try? decoder.decode(Line.self, from: data) else { return nil }
        switch line.type {
        case "stage":
            if let label = line.label { return .stage(label) }
        case "result":
            if let estimate = line.estimate { return .result(estimate) }
        case "error":
            return .failure(line.error ?? "The analysis failed.")
        default:
            return nil
        }
        return nil
    }
}

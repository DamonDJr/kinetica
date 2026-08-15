//  Models.swift
//  Wire types mirroring the Next.js API's JSON.
//
//  One trap worth knowing: the server's Profile stores *imperial* values in
//  metric-sounding columns — `heightCm` holds inches and `weightKg`/
//  `goalWeightKg` hold pounds (see app/api/profile/route.ts). The Swift names
//  below tell the truth; the CodingKeys carry the lie across the wire.

import Foundation

// MARK: - Profile

struct Profile: Codable, Identifiable {
    var id: String
    var displayName: String
    var age: Int?
    var gender: String?
    var heightIn: Double?
    var weightLbs: Double?
    var goalWeightLbs: Double?
    var bmrOverride: Int?
    var activityLevel: String
    var calorieTarget: Int?
    var calorieTargetMin: Int?
    var calorieTargetMax: Int?
    var proteinTargetG: Int?
    var carbTargetG: Int?
    var fatTargetG: Int?
    var xpPoints: Int
    var level: Int
    var streakDays: Int

    enum CodingKeys: String, CodingKey {
        case id, displayName, age, gender
        case heightIn = "heightCm"
        case weightLbs = "weightKg"
        case goalWeightLbs = "goalWeightKg"
        case bmrOverride, activityLevel
        case calorieTarget, calorieTargetMin, calorieTargetMax
        case proteinTargetG, carbTargetG, fatTargetG
        case xpPoints, level, streakDays
    }

    var calorieGoal: Int { calorieTarget ?? 2000 }
    var proteinGoal: Int { proteinTargetG ?? 150 }

    /// Mifflin-St Jeor, mirroring lib/bmr.ts. Kept client-side so the dashboard
    /// is one request rather than three.
    var bmr: Int? {
        if let override = bmrOverride, override > 0 { return override }
        guard let lbs = weightLbs, let inches = heightIn, let age = age, lbs > 0, inches > 0 else { return nil }
        let kg = lbs * 0.453592
        let cm = inches * 2.54
        let value = 10 * kg + 6.25 * cm - 5 * Double(age) + (gender == "female" ? -161 : 5)
        return Int(value.rounded())
    }

    /// XP needed to reach the next level. Mirrors the web app's curve.
    var xpForNextLevel: Int { level * 500 }
}

struct ProfileEnvelope: Codable {
    var profile: Profile?
}

// MARK: - Nutrition

/// Not `Identifiable`: rows being composed share a nil server `id`, so lists
/// key off `localID` instead.
struct MealItem: Codable, Equatable {
    var id: String?
    var name: String
    var calories: Int
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    var servingAmount: Double
    var servingUnit: String
    var servingGrams: Double?
    var baseCalories: Int
    var baseProteinG: Double
    var baseCarbsG: Double
    var baseFatG: Double
    var baseServingAmount: Double
    var baseServingGrams: Double?
    var savedFoodId: String?

    /// Client-side row identity — items being composed haven't got a server id
    /// yet, so lists key off this instead.
    var localID: String = UUID().uuidString

    enum CodingKeys: String, CodingKey {
        case id, name, calories, proteinG, carbsG, fatG
        case servingAmount, servingUnit, servingGrams
        case baseCalories, baseProteinG, baseCarbsG, baseFatG
        case baseServingAmount, baseServingGrams, savedFoodId
    }

    init(
        id: String? = nil,
        name: String,
        calories: Int = 0,
        proteinG: Double = 0,
        carbsG: Double = 0,
        fatG: Double = 0,
        servingAmount: Double = 1,
        servingUnit: String = "",
        servingGrams: Double? = nil,
        savedFoodId: String? = nil
    ) {
        self.id = id
        self.name = name
        self.calories = calories
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
        self.servingAmount = servingAmount
        self.servingUnit = servingUnit
        self.servingGrams = servingGrams
        self.baseCalories = calories
        self.baseProteinG = proteinG
        self.baseCarbsG = carbsG
        self.baseFatG = fatG
        self.baseServingAmount = servingAmount
        self.baseServingGrams = servingGrams
        self.savedFoodId = savedFoodId
    }

    /// Rescales the logged macros from the stored per-serving baseline. Mirrors
    /// lib/serving-math.ts: the `base*` fields are the calibration point, so
    /// editing the amount twice never compounds rounding.
    mutating func setServingAmount(_ amount: Double) {
        let safeBase = baseServingAmount > 0 ? baseServingAmount : 1
        let factor = amount / safeBase
        servingAmount = amount
        calories = Int((Double(baseCalories) * factor).rounded())
        proteinG = (baseProteinG * factor * 10).rounded() / 10
        carbsG = (baseCarbsG * factor * 10).rounded() / 10
        fatG = (baseFatG * factor * 10).rounded() / 10
        if let baseGrams = baseServingGrams {
            servingGrams = (baseGrams * factor * 10).rounded() / 10
        }
    }

    /// Re-pins the baseline to the current values — used after a hand edit, so
    /// subsequent serving changes scale from the corrected numbers.
    mutating func recalibrate() {
        baseCalories = calories
        baseProteinG = proteinG
        baseCarbsG = carbsG
        baseFatG = fatG
        baseServingAmount = servingAmount
        baseServingGrams = servingGrams
    }

    var servingLabel: String {
        let amount = servingAmount == servingAmount.rounded()
            ? String(Int(servingAmount))
            : String(format: "%.2g", servingAmount)
        var parts = [amount]
        if !servingUnit.isEmpty { parts.append(servingUnit) }
        if let grams = servingGrams, grams > 0 { parts.append("(\(Int(grams.rounded()))g)") }
        return parts.joined(separator: " ")
    }
}

/// Summed macros for a set of rows. A named type rather than a tuple: the
/// editors sum items in several places, and labelled-tuple inference is the
/// sort of thing Swift 5.5 gets fussy about.
struct MacroTotals {
    var calories: Int = 0
    var proteinG: Double = 0
    var carbsG: Double = 0
    var fatG: Double = 0

    static func sum(_ items: [MealItem]) -> MacroTotals {
        var totals = MacroTotals()
        for item in items {
            totals.calories += item.calories
            totals.proteinG += item.proteinG
            totals.carbsG += item.carbsG
            totals.fatG += item.fatG
        }
        return totals
    }

    var macroLine: String {
        "P \(Int(proteinG.rounded()))   C \(Int(carbsG.rounded()))   F \(Int(fatG.rounded()))"
    }
}

struct Meal: Codable, Identifiable {
    var id: String
    var mealType: String
    var name: String
    var calories: Int
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    var notes: String?
    var loggedAt: Date
    var items: [MealItem]?
}

struct WaterEntry: Codable, Identifiable {
    var id: String
    var amountMl: Int
    var loggedAt: Date
}

struct NutritionDay: Codable {
    var meals: [Meal]
    var water: [WaterEntry]
    var waterMl: Int

    static let empty = NutritionDay(meals: [], water: [], waterMl: 0)

    var calories: Int { meals.reduce(0) { $0 + $1.calories } }
    var proteinG: Double { meals.reduce(0) { $0 + $1.proteinG } }
    var carbsG: Double { meals.reduce(0) { $0 + $1.carbsG } }
    var fatG: Double { meals.reduce(0) { $0 + $1.fatG } }
}

struct SavedFood: Codable, Identifiable {
    var id: String
    var name: String
    var brand: String?
    var servingDescription: String
    var servingAmount: Double
    var servingUnit: String
    var servingGrams: Double?
    var calories: Int
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    var source: String
    var useCount: Int

    var asMealItem: MealItem {
        MealItem(
            name: name,
            calories: calories,
            proteinG: proteinG,
            carbsG: carbsG,
            fatG: fatG,
            servingAmount: servingAmount,
            servingUnit: servingUnit,
            servingGrams: servingGrams,
            savedFoodId: id
        )
    }
}

// MARK: - AI estimate (streaming analyze pipeline)

struct EstimateItem: Codable {
    var name: String
    var calories: Double
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    var servingAmount: Double?
    var servingUnit: String?
    var servingGrams: Double?
}

struct NutritionEstimate: Codable {
    var name: String
    var servingDescription: String?
    var brand: String?
    var calories: Double
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    var servingAmount: Double?
    var servingUnit: String?
    var servingGrams: Double?
    var confidence: String?
    var notes: String?
    var items: [EstimateItem]?

    /// The estimate as editable rows. A single-component estimate still becomes
    /// one row so the editor has something to scale.
    var editableItems: [MealItem] {
        if let items = items, !items.isEmpty {
            return items.map { item in
                MealItem(
                    name: item.name,
                    calories: Int(item.calories.rounded()),
                    proteinG: item.proteinG,
                    carbsG: item.carbsG,
                    fatG: item.fatG,
                    servingAmount: item.servingAmount ?? 1,
                    servingUnit: item.servingUnit ?? "",
                    servingGrams: item.servingGrams
                )
            }
        }
        return [MealItem(
            name: name,
            calories: Int(calories.rounded()),
            proteinG: proteinG,
            carbsG: carbsG,
            fatG: fatG,
            servingAmount: servingAmount ?? 1,
            servingUnit: servingUnit ?? "",
            servingGrams: servingGrams
        )]
    }
}

/// One line of the analyze route's newline-delimited JSON stream.
enum AnalyzeEvent {
    case stage(String)
    case result(NutritionEstimate)
    case failure(String)
}

// MARK: - Journal

struct JournalEntry: Codable, Identifiable {
    var id: String
    var content: String
    var mood: Int
    var energy: Int?
    var context: String
    var isWin: Bool
    var coachReply: String?
    var loggedAt: Date
}

// MARK: - Envelopes

struct MealEnvelope: Codable { var meal: Meal }
struct SavedFoodsEnvelope: Codable { var foods: [SavedFood] }
struct JournalEnvelope: Codable { var entries: [JournalEntry] }
struct JournalEntryEnvelope: Codable { var entry: JournalEntry }
struct BurnedEnvelope: Codable { var kcal: Int }
struct OKEnvelope: Codable { var ok: Bool? }

// MARK: - Meal types

enum MealType: String, CaseIterable, Identifiable {
    case breakfast, lunch, dinner, snack, other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .breakfast: return "Breakfast"
        case .lunch: return "Lunch"
        case .dinner: return "Dinner"
        case .snack: return "Snack"
        case .other: return "Other"
        }
    }

    /// Chips default from the clock — the overwhelmingly common case is
    /// logging what you just ate.
    static func forNow(_ date: Date = Date()) -> MealType {
        switch Calendar.current.component(.hour, from: date) {
        case 4..<11: return .breakfast
        case 11..<15: return .lunch
        case 15..<17: return .snack
        case 17..<22: return .dinner
        default: return .snack
        }
    }
}

// MARK: - Body measurements

/// Unlike `Profile`, this endpoint is genuinely metric: `weightKg` really is
/// kilograms and the circumferences really are centimetres. The server converts
/// when it syncs a new weight back to `Profile.weightKg` (which stores pounds).
///
/// The app is imperial everywhere the user can see, so conversion happens at
/// this boundary and nowhere else — the wire stays metric, the UI stays
/// imperial. Constants match lib/utils.ts exactly so a value can round-trip.
struct Measurement: Codable, Identifiable {
    static let kgPerLb = 0.453592
    static let cmPerIn = 2.54

    var id: String
    var takenAt: Date
    var weightKg: Double?
    var bodyFatPct: Double?
    var waistCm: Double?
    var chestCm: Double?
    var hipsCm: Double?
    var armCm: Double?
    var thighCm: Double?
    var neckCm: Double?
    var notes: String?

    var weightLbs: Double? { Measurement.toLbs(weightKg) }
    var waistIn: Double? { Measurement.toInches(waistCm) }
    var chestIn: Double? { Measurement.toInches(chestCm) }
    var hipsIn: Double? { Measurement.toInches(hipsCm) }
    var armIn: Double? { Measurement.toInches(armCm) }
    var thighIn: Double? { Measurement.toInches(thighCm) }
    var neckIn: Double? { Measurement.toInches(neckCm) }

    static func toLbs(_ kg: Double?) -> Double? {
        guard let kg = kg else { return nil }
        return (kg / kgPerLb * 10).rounded() / 10
    }

    static func toKg(_ lbs: Double?) -> Double? {
        guard let lbs = lbs else { return nil }
        return (lbs * kgPerLb * 100).rounded() / 100
    }

    static func toInches(_ cm: Double?) -> Double? {
        guard let cm = cm else { return nil }
        return (cm / cmPerIn * 10).rounded() / 10
    }

    static func toCm(_ inches: Double?) -> Double? {
        guard let inches = inches else { return nil }
        return (inches * cmPerIn * 100).rounded() / 100
    }
}

struct MeasurementsEnvelope: Codable { var measurements: [Measurement] }

/// Metric on the wire, per the note on `Measurement`.
struct MeasurementPayload: Encodable {
    var weightKg: Double?
    var bodyFatPct: Double?
    var waistCm: Double?
    var chestCm: Double?
    var hipsCm: Double?
    var armCm: Double?
    var thighCm: Double?
    var neckCm: Double?
    var notes: String?
}

/// The measurable fields, so the editor and the chart picker can be driven off
/// one list rather than repeating eight near-identical blocks.
enum MeasurementField: String, CaseIterable, Identifiable {
    case weight, bodyFat, waist, chest, hips, arm, thigh, neck

    var id: String { rawValue }

    var label: String {
        switch self {
        case .weight: return "Weight"
        case .bodyFat: return "Body fat"
        case .waist: return "Waist"
        case .chest: return "Chest"
        case .hips: return "Hips"
        case .arm: return "Arm"
        case .thigh: return "Thigh"
        case .neck: return "Neck"
        }
    }

    var unit: String {
        switch self {
        case .weight: return "lb"
        case .bodyFat: return "%"
        default: return "in"
        }
    }

    /// The user-facing (imperial) value for this field.
    func value(in measurement: Measurement) -> Double? {
        switch self {
        case .weight: return measurement.weightLbs
        case .bodyFat: return measurement.bodyFatPct
        case .waist: return measurement.waistIn
        case .chest: return measurement.chestIn
        case .hips: return measurement.hipsIn
        case .arm: return measurement.armIn
        case .thigh: return measurement.thighIn
        case .neck: return measurement.neckIn
        }
    }

    /// Converts a typed imperial value into the metric the API expects.
    func metric(from imperial: Double) -> Double {
        switch self {
        case .weight: return Measurement.toKg(imperial) ?? imperial
        case .bodyFat: return imperial
        default: return Measurement.toCm(imperial) ?? imperial
        }
    }
}

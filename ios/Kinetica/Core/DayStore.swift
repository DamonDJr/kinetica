//  DayStore.swift
//  One day's intake. Shared by the dashboard and the food tab, which ask the
//  same two questions of the server and would otherwise drift apart.

import SwiftUI

@MainActor
final class DayStore: ObservableObject {
    @Published var date: Date
    @Published private(set) var day: NutritionDay = .empty
    @Published private(set) var burnedKcal: Int = 0
    @Published private(set) var isLoading = false
    @Published var errorText: String?

    private let api = APIClient.shared

    /// Whether `date` means "today" or a day the user deliberately navigated
    /// to. Only the former should roll forward on its own.
    private var followsToday: Bool

    init(date: Date = Date()) {
        self.date = date
        self.followsToday = Calendar.current.isDateInToday(date)
    }

    var isToday: Bool { Calendar.current.isDateInToday(date) }

    /// `date` is captured once when the store is created, so an app that sits
    /// in memory across midnight keeps showing — and logging to — yesterday.
    /// Call this whenever the app comes back to the foreground.
    ///
    /// Returns true if the day moved, so the caller knows to reload.
    @discardableResult
    func rollOverIfNeeded() -> Bool {
        guard followsToday, !Calendar.current.isDateInToday(date) else { return false }
        date = Date()
        return true
    }

    func shift(days: Int) {
        guard let next = Calendar.current.date(byAdding: .day, value: days, to: date) else { return }
        // No logging into the future — the API pins forward-dated entries back
        // to "now" anyway, so offering the day would be a lie.
        if next > Date() && !Calendar.current.isDateInToday(next) { return }
        date = next
        followsToday = Calendar.current.isDateInToday(next)
        Task { await load() }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let dayResult = api.fetchDay(date)
            async let burnedResult = api.fetchBurned(date)
            let (fetchedDay, fetchedBurned) = try await (dayResult, burnedResult)
            day = fetchedDay
            burnedKcal = fetchedBurned
            errorText = nil
        } catch {
            errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func logWater(ml: Int) async {
        do {
            try await api.logWater(ml: ml, date: date)
            Haptics.logged()
            await load()
        } catch {
            errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
            Haptics.failed()
        }
    }

    func deleteMeal(id: String) async {
        do {
            try await api.deleteMeal(id: id)
            await load()
        } catch {
            errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
            Haptics.failed()
        }
    }

    func setBurned(_ kcal: Int) async {
        do {
            burnedKcal = try await api.setBurned(kcal: kcal, date: date)
        } catch {
            errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Meals grouped in the order you'd eat them, skipping empty groups.
    var groupedMeals: [MealGroup] {
        MealType.allCases.compactMap { type in
            let matches = day.meals.filter { $0.mealType == type.rawValue }
            return matches.isEmpty ? nil : MealGroup(type: type, meals: matches)
        }
    }
}

struct MealGroup: Identifiable {
    let type: MealType
    let meals: [Meal]

    var id: String { type.rawValue }
    var calories: Int { meals.reduce(0) { $0 + $1.calories } }
}

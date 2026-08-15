//  NutritionView.swift
//  A day's food. Browsable backwards, never forwards.

import SwiftUI

@MainActor
struct NutritionView: View {
    @EnvironmentObject private var state: AppState
    @StateObject private var store = DayStore()
    @Environment(\.scenePhase) private var scenePhase
    @State private var showingLogSheet = false

    private var profile: Profile? { state.profile }

    private var calorieProgress: Double {
        guard let profile = profile, profile.calorieGoal > 0 else { return 0 }
        return Double(store.day.calories) / Double(profile.calorieGoal)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    dateBar
                    summary
                    if let error = store.errorText {
                        ServerTrouble(message: error) { Task { await store.load() } }
                    }
                    mealSections
                    waterRow
                    Spacer(minLength: 32)
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
            }
            .refreshable { await store.load() }
            .screenBackground()
            .navigationTitle("Food")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingLogSheet = true
                    } label: {
                        Image(systemName: "plus")
                            .foregroundColor(.kAccent)
                    }
                }
            }
        }
        .task { await store.load() }
        .onChange(of: state.dataVersion) {
            Task { await store.load() }
        }
        // Coming back after midnight has to move the day on; the store pins it
        // when the view is first built and the app can sit in memory for days.
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            store.rollOverIfNeeded()
            Task { await store.load() }
        }
        .sheet(isPresented: $showingLogSheet) {
            LogMealView(date: store.date) {
                Task {
                    await store.load()
                    await state.refreshAfterLog()
                }
            }
        }
    }

    // MARK: Date

    private var dateBar: some View {
        HStack {
            Button {
                store.shift(days: -1)
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.kInk)
            }
            .buttonStyle(.plain)

            Spacer()

            VStack(spacing: 2) {
                Text(store.isToday ? "Today" : Self.titleFormatter.string(from: store.date))
                    .displayFont(22, .medium)
                    .foregroundColor(.kInk)
                Eyebrow(Self.eyebrowFormatter.string(from: store.date))
            }

            Spacer()

            Button {
                store.shift(days: 1)
            } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(store.isToday ? .kInkMuted.opacity(0.4) : .kInk)
            }
            .buttonStyle(.plain)
            .disabled(store.isToday)
        }
        .padding(.top, 8)
    }

    // MARK: Summary

    private var summary: some View {
        let goal = profile?.calorieGoal ?? 2000
        let net = store.day.calories - store.burnedKcal - (profile?.bmr ?? 0)

        return CardSurface {
            VStack(spacing: 18) {
                HStack(spacing: 20) {
                    ChalkRing(progress: calorieProgress, lineWidth: 12) {
                        VStack(spacing: 0) {
                            Text("\(store.day.calories)")
                                .displayFont(24, .semibold)
                                .foregroundColor(.kInk)
                            Text("of \(goal)")
                                .utilityFont(9)
                                .foregroundColor(.kInkMuted)
                        }
                    }
                    .frame(width: 104, height: 104)

                    VStack(alignment: .leading, spacing: 12) {
                        Figure(
                            value: net >= 0 ? "+\(net)" : "\(net)",
                            caption: "net vs burn",
                            unit: "kcal",
                            tint: net > 0 ? .kInk : .kMoss
                        )
                        Figure(value: "\(store.day.meals.count)", caption: "meals logged", tint: .kInkMuted)
                    }
                    Spacer(minLength: 0)
                }

                VStack(spacing: 12) {
                    MacroBar(label: "Protein", value: store.day.proteinG, target: Double(profile?.proteinGoal ?? 150))
                    MacroBar(label: "Carbs", value: store.day.carbsG, target: Double(profile?.carbTargetG ?? 220), tint: .kInk.opacity(0.35))
                    MacroBar(label: "Fat", value: store.day.fatG, target: Double(profile?.fatTargetG ?? 70), tint: .kInk.opacity(0.35))
                }
            }
        }
    }

    // MARK: Meals

    @ViewBuilder
    private var mealSections: some View {
        if store.day.meals.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Nothing logged yet")
                EmptyNote(store.isToday
                    ? "Tap + and describe what you ate — the coach will work out the macros."
                    : "No meals recorded for this day.")
            }
        } else {
            ForEach(store.groupedMeals) { group in
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader(title: group.type.label) {
                        Text("\(group.calories) kcal")
                            .utilityFont(11)
                            .foregroundColor(.kInkMuted)
                    }
                    ForEach(group.meals) { meal in
                        // iOS 15 has no ViewBuilder-destination NavigationLink,
                        // so the destination is built eagerly as a value.
                        NavigationLink(
                            destination: MealDetailView(meal: meal) {
                                Task {
                                    await store.load()
                                    state.markDataChanged()
                                }
                            }
                        ) {
                            MealRow(meal: meal)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var waterRow: some View {
        CardSurface {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(store.day.waterMl)")
                        .displayFont(24, .semibold)
                        .foregroundColor(.kInk)
                    Eyebrow("ml water")
                }
                Spacer()
                ForEach([250, 500], id: \.self) { amount in
                    Button("+\(amount)") {
                        Task { await store.logWater(ml: amount) }
                    }
                    .bodyFont(14, weight: .medium)
                    .foregroundColor(.kAccent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        Capsule().strokeBorder(Color.kHairline, lineWidth: 1)
                    )
                }
            }
        }
    }

    private static let titleFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMMM"
        return formatter
    }()

    private static let eyebrowFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE"
        return formatter
    }()
}

// MARK: - Row

@MainActor
struct MealRow: View {
    let meal: Meal

    var body: some View {
        CardSurface(padding: 14) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(meal.name)
                        .bodyFont(16, weight: .medium)
                        .foregroundColor(.kInk)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text(macroLine)
                        .utilityFont(11)
                        .foregroundColor(.kInkMuted)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(meal.calories)")
                        .displayFont(20, .semibold)
                        .foregroundColor(.kInk)
                    Text(Self.timeFormatter.string(from: meal.loggedAt))
                        .utilityFont(10)
                        .foregroundColor(.kInkMuted)
                }
            }
        }
    }

    private var macroLine: String {
        let items = meal.items?.count ?? 0
        let macros = "P \(Int(meal.proteinG.rounded()))  C \(Int(meal.carbsG.rounded()))  F \(Int(meal.fatG.rounded()))"
        return items > 1 ? "\(macros)  ·  \(items) items" : macros
    }

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter
    }()
}

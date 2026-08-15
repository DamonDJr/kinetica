//  DashboardView.swift
//  Today at a glance. One Chalk Ring, one earned moment, nothing else shouting.

import SwiftUI

/// File-scope, not nested in the view: a type declared inside a `@MainActor`
/// type can inherit that isolation, which then clashes with `Identifiable`'s
/// nonisolated `id` requirement.
private enum DashboardSheet: String, Identifiable {
    case logFood, burned
    var id: String { rawValue }
}

/// Likewise file-scope. No conformances to trip over, but keeping the two
/// together is clearer than splitting them on a technicality.
private enum Earned {
    case streakMilestone(Int)
    case proteinHit
    case none
}

@MainActor
struct DashboardView: View {
    @EnvironmentObject private var state: AppState
    @StateObject private var store = DayStore()
    @Environment(\.scenePhase) private var scenePhase
    @State private var activeSheet: DashboardSheet?
    @State private var pulse = false
    @State private var hasPulsed = false

    private var profile: Profile? { state.profile }

    /// The single `ember` moment this screen is allowed. Priority order, first
    /// match wins — if nothing was earned, nothing turns ember.
    private var earned: Earned {
        if let profile = profile, profile.streakDays > 0, profile.streakDays % 7 == 0 {
            return .streakMilestone(profile.streakDays)
        }
        if let profile = profile, store.day.proteinG >= Double(profile.proteinGoal), store.day.proteinG > 0 {
            return .proteinHit
        }
        return .none
    }

    private var calorieProgress: Double {
        guard let profile = profile, profile.calorieGoal > 0 else { return 0 }
        return Double(store.day.calories) / Double(profile.calorieGoal)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header
                    ring
                    macros
                    if let error = store.errorText {
                        ServerTrouble(message: error) { Task { await store.load() } }
                    }
                    quickActions
                    streakCard
                    Spacer(minLength: 24)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }
            .refreshable {
                await store.load()
                await state.loadProfile()
            }
            .screenBackground()
            .navigationBarHidden(true)
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
        // One sheet modifier, not two: stacking `.sheet(isPresented:)` on a
        // single view is unreliable before iOS 16 — the last one wins and the
        // other silently never presents.
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .logFood:
                LogMealView(date: store.date) {
                    Task {
                        await store.load()
                        await state.refreshAfterLog()
                    }
                }
            case .burned:
                BurnedSheet(current: store.burnedKcal) { kcal in
                    Task { await store.setBurned(kcal) }
                }
            }
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Eyebrow(Self.dayFormatter.string(from: Date()))
                Text(greeting)
                    .displayFont(30, .medium)
                    .foregroundColor(.kInk)
            }
            Spacer(minLength: 12)
            // iOS 15's ScrollView has no pull-to-refresh, so reloading needs to
            // be an actual control rather than a gesture that silently does
            // nothing.
            Button {
                Task {
                    await store.load()
                    await state.loadProfile()
                }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(store.isLoading ? .kInkMuted : .kInk)
            }
            .buttonStyle(.plain)
            .disabled(store.isLoading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 12)
    }

    private var greeting: String {
        let name = profile?.displayName.split(separator: " ").first.map { String($0) } ?? "You"
        switch Calendar.current.component(.hour, from: Date()) {
        case 0..<5: return "Still up, \(name)"
        case 5..<12: return "Morning, \(name)"
        case 12..<18: return "Afternoon, \(name)"
        default: return "Evening, \(name)"
        }
    }

    // MARK: Ring

    private var ring: some View {
        let goal = profile?.calorieGoal ?? 2000
        let remaining = goal - store.day.calories
        let over = remaining < 0

        return HStack(alignment: .center, spacing: 22) {
            ChalkRing(progress: calorieProgress, lineWidth: 16, tint: over ? .kMoss : .kAccent) {
                VStack(spacing: 0) {
                    Text("\(store.day.calories)")
                        .displayFont(38, .semibold)
                        .foregroundColor(.kInk)
                    Text("kcal")
                        .utilityFont(10)
                        .foregroundColor(.kInkMuted)
                }
            }
            .frame(width: 150, height: 150)

            VStack(alignment: .leading, spacing: 14) {
                Figure(
                    value: over ? "\(-remaining)" : "\(remaining)",
                    caption: over ? "over target" : "left today",
                    unit: "kcal",
                    tint: over ? .kMoss : .kInk
                )
                Figure(value: "\(goal)", caption: "target", unit: "kcal", tint: .kInkMuted)
                Button {
                    activeSheet = .burned
                } label: {
                    Figure(
                        value: "\(store.burnedKcal + (profile?.bmr ?? 0))",
                        caption: "burned",
                        unit: "kcal",
                        tint: .kInkMuted
                    )
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
    }

    // MARK: Macros

    private var macros: some View {
        CardSurface {
            VStack(spacing: 14) {
                MacroBar(
                    label: "Protein",
                    value: store.day.proteinG,
                    target: Double(profile?.proteinGoal ?? 150),
                    tint: proteinTint
                )
                MacroBar(
                    label: "Carbs",
                    value: store.day.carbsG,
                    target: Double(profile?.carbTargetG ?? 220),
                    tint: .kInk.opacity(0.35)
                )
                MacroBar(
                    label: "Fat",
                    value: store.day.fatG,
                    target: Double(profile?.fatTargetG ?? 70),
                    tint: .kInk.opacity(0.35)
                )
                HStack {
                    Text("Water")
                        .utilityFont(10)
                        .foregroundColor(.kInkMuted)
                    Spacer()
                    Text("\(store.day.waterMl) ml")
                        .utilityFont(11)
                        .foregroundColor(.kInkMuted)
                    Button {
                        Task { await store.logWater(ml: 250) }
                    } label: {
                        Image(systemName: "plus.circle")
                            .font(.system(size: 18, weight: .regular))
                            .foregroundColor(.kAccent)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 2)
            }
        }
    }

    private var proteinTint: Color {
        if case .proteinHit = earned { return .kEmber }
        let goal = Double(profile?.proteinGoal ?? 150)
        return store.day.proteinG >= goal ? .kMoss : .kAccent
    }

    // MARK: Actions

    private var quickActions: some View {
        HStack(spacing: 12) {
            Button {
                activeSheet = .logFood
            } label: {
                Label("Log food", systemImage: "plus")
            }
            .buttonStyle(KPrimaryButtonStyle())

            NavigationLink(
                destination: JournalComposeView { _ in
                    Task { await state.refreshAfterLog() }
                }
            ) {
                Label("Journal", systemImage: "square.and.pencil")
                    .bodyFont(15, weight: .medium)
                    .foregroundColor(.kInk)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .strokeBorder(Color.kHairline, lineWidth: 1)
                    )
            }
        }
    }

    // MARK: Streak

    private var streakCard: some View {
        let streak = profile?.streakDays ?? 0
        let level = profile?.level ?? 1
        let xp = profile?.xpPoints ?? 0
        let nextLevelXP = profile?.xpForNextLevel ?? 500
        var isMilestone = false
        if case .streakMilestone = earned { isMilestone = true }

        return CardSurface {
            HStack(alignment: .center, spacing: 18) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        Text("\(streak)")
                            .displayFont(KType.Size.displayXL, .semibold)
                            .foregroundColor(isMilestone ? .kEmber : .kInk)
                            .scaleEffect(pulse ? 1.06 : 1)
                        Text("days")
                            .utilityFont(12)
                            .foregroundColor(.kInkMuted)
                    }
                    Eyebrow(isMilestone ? "streak milestone" : "current streak")
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 6) {
                    Figure(value: "\(level)", caption: "level")
                    Text("\(xp) / \(nextLevelXP) xp")
                        .utilityFont(10)
                        .foregroundColor(.kInkMuted)
                }
            }
        }
        .onAppear {
            // A single scale-pulse and one medium tap. No confetti — `ember`
            // carrying the moment is the whole point.
            guard isMilestone, !hasPulsed else { return }
            hasPulsed = true
            Haptics.earned()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) { pulse = true }
            // Task rather than DispatchQueue.asyncAfter: the delayed work
            // mutates isolated view state, and a Task keeps it plainly on the
            // main actor instead of relying on how Dispatch's closures are
            // audited for concurrency in this SDK.
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 300_000_000)
                withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { pulse = false }
            }
        }
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE d MMMM"
        return formatter
    }()
}

// MARK: - Supporting views

/// Reachability copy. Failing to load isn't the user's fault, and on a
/// self-hosted setup the cause is nearly always the same two things.
@MainActor
struct ServerTrouble: View {
    let message: String
    var retry: () -> Void

    var body: some View {
        CardSurface {
            VStack(alignment: .leading, spacing: 10) {
                Text(message)
                    .bodyFont(14)
                    .foregroundColor(.kInk)
                Button("Try again", action: retry)
                    .buttonStyle(KQuietButtonStyle())
            }
        }
    }
}

/// Calories burned is a single daily number read off a watch, so it's an
/// overwrite, not an accumulation — the sheet reflects that.
@MainActor
private struct BurnedSheet: View {
    @Environment(\.dismiss) private var dismiss
    let current: Int
    var onSave: (Int) -> Void

    @State private var text: String = ""

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("Active calories from your watch for this day. This replaces the day's figure rather than adding to it.")
                    .bodyFont(15)
                    .foregroundColor(.kInkMuted)
                HStack {
                    TextField("0", text: $text)
                        .keyboardType(.numberPad)
                        .kFieldStyle(alignment: .trailing)
                    Text("kcal")
                        .utilityFont(12)
                        .foregroundColor(.kInkMuted)
                }
                Button("Save") {
                    onSave(Int(text) ?? 0)
                    Haptics.logged()
                    dismiss()
                }
                .buttonStyle(KPrimaryButtonStyle())
                Spacer()
            }
            .padding(20)
            .screenBackground()
            .navigationTitle("Calories burned")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .onAppear { text = current > 0 ? String(current) : "" }
    }
}

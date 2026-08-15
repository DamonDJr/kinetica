//  MeasurementsView.swift
//  Body measurements over time.
//
//  Units: the API is genuinely metric here (kg/cm) while the rest of the app is
//  imperial — see the note on `Measurement`. Everything on this screen is lb/in;
//  conversion happens only where the payload is built.

import SwiftUI
import Charts

@MainActor
struct MeasurementsView: View {
    @EnvironmentObject private var state: AppState

    @State private var measurements: [Measurement] = []
    @State private var field: MeasurementField = .weight
    @State private var rangeDays = 180
    @State private var isLoading = false
    @State private var errorText: String?
    @State private var showingAdd = false
    @State private var pendingDelete: Measurement?

    private let api = APIClient.shared
    private let ranges = [30, 90, 180, 365]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let error = errorText {
                    ServerTrouble(message: error) { Task { await load() } }
                }

                if measurements.isEmpty && !isLoading {
                    emptyState
                } else {
                    headline
                    fieldPicker
                    chartCard
                    history
                }

                Spacer(minLength: 32)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
        .refreshable { await load() }
        .screenBackground()
        .navigationTitle("Measurements")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showingAdd = true
                } label: {
                    Image(systemName: "plus").foregroundColor(.kAccent)
                }
            }
        }
        .task { await load() }
        .sheet(isPresented: $showingAdd) {
            LogMeasurementView(latest: measurements.first) {
                Task {
                    await load()
                    // The server syncs a new weight onto the profile, so the
                    // targets elsewhere would otherwise show stale numbers.
                    await state.loadProfile()
                }
            }
        }
        .alert("Delete this entry?", isPresented: Binding(
            get: { pendingDelete != nil },
            set: { if !$0 { pendingDelete = nil } }
        )) {
            Button("Cancel", role: .cancel) { pendingDelete = nil }
            Button("Delete", role: .destructive) {
                if let target = pendingDelete { Task { await delete(target) } }
            }
        }
    }

    // MARK: Data shaping

    /// Entries carrying the selected field, oldest first — charts want
    /// ascending x, the API returns newest first.
    private var points: [TrendPoint] {
        measurements
            .compactMap { m in
                guard let value = field.value(in: m) else { return nil }
                return TrendPoint(id: m.id, date: m.takenAt, value: value)
            }
            .sorted { $0.date < $1.date }
    }

    private var latest: TrendPoint? { points.last }
    private var earliest: TrendPoint? { points.first }

    private var delta: Double? {
        guard let latest = latest, let earliest = earliest, points.count > 1 else { return nil }
        return latest.value - earliest.value
    }

    /// Only weight has a goal to aim at, and only when the profile carries one.
    private var goalValue: Double? {
        guard field == .weight else { return nil }
        return state.profile?.goalWeightLbs
    }

    /// Moving toward the goal is the positive direction, which isn't always
    /// "down" — someone gaining toward a heavier goal is making progress too.
    private var deltaTint: Color {
        guard let delta = delta, let goal = goalValue, let latest = latest else { return .kInkMuted }
        if abs(delta) < 0.05 { return .kInkMuted }
        let movingDown = delta < 0
        let goalIsBelow = goal < latest.value
        return movingDown == goalIsBelow ? .kMoss : .kInkMuted
    }

    // MARK: Views

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Nothing measured yet")
                .displayFont(24, .medium)
                .foregroundColor(.kInk)
            Text("Log a weight and the trend builds from there. Waist, chest, arm and the rest are optional — anything you record gets its own chart.")
                .bodyFont(15)
                .foregroundColor(.kInkMuted)
            Button("Add the first one") { showingAdd = true }
                .buttonStyle(KPrimaryButtonStyle())
                .padding(.top, 4)
        }
        .padding(.top, 20)
    }

    private var headline: some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow(field.label)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(latest.map { format($0.value) } ?? "—")
                    .displayFont(44, .semibold)
                    .foregroundColor(.kInk)
                Text(field.unit)
                    .utilityFont(12)
                    .foregroundColor(.kInkMuted)
                if let delta = delta {
                    Text("\(delta > 0 ? "+" : "")\(format(delta))")
                        .utilityFont(12)
                        .foregroundColor(deltaTint)
                        .padding(.leading, 6)
                }
            }
            if let latest = latest {
                Text("Last measured \(Self.stamp.string(from: latest.date))")
                    .utilityFont(10)
                    .foregroundColor(.kInkMuted)
            }
        }
        .padding(.top, 6)
    }

    private var fieldPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Only fields with data are offered, so the picker doesn't imply
            // charts that would be empty. Weight is always present.
            FlowLayout {
                ForEach(availableFields) { option in
                    Chip(title: option.label, selected: option == field) { field = option }
                }
            }
            FlowLayout {
                ForEach(ranges, id: \.self) { days in
                    Chip(title: rangeLabel(days), selected: days == rangeDays) {
                        rangeDays = days
                        Task { await load() }
                    }
                }
            }
        }
    }

    private var availableFields: [MeasurementField] {
        MeasurementField.allCases.filter { option in
            option == .weight || measurements.contains { option.value(in: $0) != nil }
        }
    }

    @ViewBuilder
    private var chartCard: some View {
        CardSurface {
            if points.count < 2 {
                Text("One reading so far — the trend appears once there are two.")
                    .bodyFont(14)
                    .foregroundColor(.kInkMuted)
                    .frame(height: 100)
            } else {
                Chart {
                    ForEach(points) { point in
                        AreaMark(
                            x: .value("Date", point.date),
                            y: .value(field.label, point.value)
                        )
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color.kAccent.opacity(0.28), Color.kAccent.opacity(0.02)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value(field.label, point.value)
                        )
                        .foregroundStyle(Color.kAccent)
                        .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                        .symbol {
                            Circle()
                                .fill(Color.kAccent)
                                .frame(width: 5, height: 5)
                        }
                    }

                    if let goal = goalValue {
                        RuleMark(y: .value("Goal", goal))
                            .foregroundStyle(Color.kMoss)
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                            .annotation(alignment: .leading) {
                                Text("goal \(format(goal))")
                                    .utilityFont(9)
                                    .foregroundColor(.kMoss)
                            }
                    }
                }
                .chartYScale(domain: yDomain)
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { value in
                        AxisGridLine().foregroundStyle(Color.kHairline)
                        AxisValueLabel {
                            if let date = value.as(Date.self) {
                                Text(Self.axis.string(from: date))
                                    .utilityFont(9)
                                    .foregroundColor(.kInkMuted)
                            }
                        }
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { value in
                        AxisGridLine().foregroundStyle(Color.kHairline)
                        AxisValueLabel {
                            if let number = value.as(Double.self) {
                                Text(format(number))
                                    .utilityFont(9)
                                    .foregroundColor(.kInkMuted)
                            }
                        }
                    }
                }
                .frame(height: 200)
            }
        }
    }

    /// Padded so the line never sits flush against the frame, and so a goal
    /// line just outside the data range still appears.
    private var yDomain: ClosedRange<Double> {
        let values = points.map(\.value) + [goalValue].compactMap { $0 }
        guard let low = values.min(), let high = values.max() else { return 0...1 }
        let pad = max((high - low) * 0.15, 1)
        return (low - pad)...(high + pad)
    }

    private var history: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("History")
            ForEach(measurements) { entry in
                CardSurface(padding: 14) {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(Self.stamp.string(from: entry.takenAt))
                                .utilityFont(10)
                                .foregroundColor(.kInkMuted)
                            Text(summary(entry))
                                .bodyFont(14)
                                .foregroundColor(.kInk)
                            if let notes = entry.notes, !notes.isEmpty {
                                Text(notes)
                                    .utilityFont(10)
                                    .foregroundColor(.kInkMuted)
                            }
                        }
                        Spacer(minLength: 8)
                        Button {
                            pendingDelete = entry
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 13))
                                .foregroundColor(.kInkMuted.opacity(0.6))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func summary(_ entry: Measurement) -> String {
        let parts = MeasurementField.allCases.compactMap { option -> String? in
            guard let value = option.value(in: entry) else { return nil }
            return "\(option.label) \(format(value))\(option.unit == "%" ? "%" : " \(option.unit)")"
        }
        return parts.isEmpty ? "—" : parts.joined(separator: "  ·  ")
    }

    private func rangeLabel(_ days: Int) -> String {
        days >= 365 ? "1 yr" : "\(days) d"
    }

    private func format(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
    }

    // MARK: Actions

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            measurements = try await api.fetchMeasurements(days: rangeDays)
            errorText = nil
            // A field can vanish when the range shrinks past its only reading.
            if !availableFields.contains(field) { field = .weight }
        } catch {
            errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func delete(_ entry: Measurement) async {
        pendingDelete = nil
        do {
            try await api.deleteMeasurement(id: entry.id)
            await load()
        } catch {
            errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
            Haptics.failed()
        }
    }

    private static let stamp: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE d MMM"
        return formatter
    }()

    private static let axis: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM"
        return formatter
    }()
}

struct TrendPoint: Identifiable {
    let id: String
    let date: Date
    let value: Double
}

// MARK: - Logging a measurement

@MainActor
struct LogMeasurementView: View {
    /// Prefilled from the last entry so an unchanged waist doesn't have to be
    /// re-typed every time — weight is deliberately left blank, since that's
    /// the number actually being taken.
    let latest: Measurement?
    var onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var values: [MeasurementField: String] = [:]
    @State private var notes = ""
    @State private var isSaving = false
    @State private var errorText: String?

    private let api = APIClient.shared

    private var canSave: Bool {
        !isSaving && MeasurementField.allCases.contains { parse(values[$0]) != nil }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Anything left blank is skipped — you don't have to fill it all in.")
                        .bodyFont(14)
                        .foregroundColor(.kInkMuted)

                    CardSurface {
                        VStack(spacing: 8) {
                            ForEach(MeasurementField.allCases) { option in
                                FieldRow(label: option.label, unit: option.unit) {
                                    TextField("—", text: binding(for: option))
                                        .keyboardType(.decimalPad)
                                        .kFieldStyle(alignment: .trailing)
                                }
                            }
                        }
                    }

                    TextField("Notes (optional)", text: $notes, axis: .vertical)
                        .lineLimit(2...4)
                        .kFieldStyle()

                    if let error = errorText {
                        Text(error)
                            .bodyFont(14)
                            .foregroundColor(.kEmber)
                    }

                    Button(action: { save() }) {
                        HStack(spacing: 8) {
                            if isSaving { ProgressView().tint(Color.bone) }
                            Text(isSaving ? "Saving" : "Save")
                        }
                    }
                    .buttonStyle(KPrimaryButtonStyle(enabled: canSave))
                    .disabled(!canSave)

                    Spacer(minLength: 24)
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
            }
            .screenBackground()
            .navigationTitle("New measurement")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .onAppear(perform: prefill)
    }

    private func binding(for option: MeasurementField) -> Binding<String> {
        Binding(
            get: { values[option] ?? "" },
            set: { values[option] = $0 }
        )
    }

    private func prefill() {
        guard let latest = latest, values.isEmpty else { return }
        for option in MeasurementField.allCases where option != .weight {
            if let value = option.value(in: latest) {
                values[option] = value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
            }
        }
    }

    private func parse(_ text: String?) -> Double? {
        guard let text = text?.replacingOccurrences(of: ",", with: "."), !text.isEmpty else { return nil }
        guard let value = Double(text), value > 0 else { return nil }
        return value
    }

    private func save() {
        guard canSave else { return }
        isSaving = true
        errorText = nil

        // Imperial in, metric out — the only place this screen converts.
        func metric(_ option: MeasurementField) -> Double? {
            guard let imperial = parse(values[option]) else { return nil }
            return option.metric(from: imperial)
        }

        let payload = MeasurementPayload(
            weightKg: metric(.weight),
            bodyFatPct: metric(.bodyFat),
            waistCm: metric(.waist),
            chestCm: metric(.chest),
            hipsCm: metric(.hips),
            armCm: metric(.arm),
            thighCm: metric(.thigh),
            neckCm: metric(.neck),
            notes: notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : notes
        )

        Task { @MainActor in
            do {
                _ = try await api.logMeasurement(payload)
                Haptics.logged()
                isSaving = false
                onSaved()
                dismiss()
            } catch {
                isSaving = false
                errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
                Haptics.failed()
            }
        }
    }
}

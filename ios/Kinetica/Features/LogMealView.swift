//  LogMealView.swift
//  One input, three ways out.
//
//  Mirrors the web app's unified log page: the same text box live-filters foods
//  you've saved before *and* submits to the AI pipeline, with a blank row as
//  the always-available escape hatch. The bet is that correcting an estimate
//  should be cheaper than getting the estimate right, so everything the coach
//  returns lands as editable rows rather than a fixed total.

import SwiftUI

@MainActor
struct LogMealView: View {
    let date: Date
    var onLogged: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var query = ""
    @State private var mealType = MealType.forNow()
    @State private var mealName = ""
    @State private var items: [MealItem] = []
    @State private var matches: [SavedFood] = []
    @State private var recents: [SavedFood] = []
    @State private var stageLabel: String?
    @State private var isAnalyzing = false
    @State private var isSaving = false
    @State private var errorText: String?
    @State private var usedCoach = false
    @State private var searchTask: Task<Void, Never>?
    @FocusState private var queryFocused: Bool

    private let api = APIClient.shared

    private var totals: MacroTotals { MacroTotals.sum(items) }

    private var canSave: Bool { !items.isEmpty && !isSaving }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    smartInput
                    mealTypeChips

                    if let error = errorText {
                        Text(error)
                            .bodyFont(14)
                            .foregroundColor(.kEmber)
                    }

                    if !items.isEmpty {
                        stagedItems
                    }

                    suggestions

                    Spacer(minLength: 24)
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
            }
            .screenBackground()
            .navigationTitle(dateTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Log") { save() }
                        .disabled(!canSave)
                        .foregroundColor(canSave ? .kAccent : .kInkMuted)
                }
            }
            .safeAreaInset(edge: .bottom) {
                if !items.isEmpty { totalsBar }
            }
        }
        .navigationViewStyle(.stack)
        .task { await loadRecents() }
    }

    private var dateTitle: String {
        Calendar.current.isDateInToday(date) ? "Log food" : "Log — \(APIClient.dayString(date))"
    }

    // MARK: Input

    private var smartInput: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                TextField("What did you eat?", text: $query)
                    .kFieldStyle()
                    .focused($queryFocused)
                    .submitLabel(.search)
                    .onSubmit { analyze() }
                    .onChange(of: query) { next in scheduleSearch(next) }

                Button(action: { analyze() }) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(Color.bone)
                        .frame(width: 46, height: 46)
                        .background(Color.kAccent.opacity(query.trimmingCharacters(in: .whitespaces).isEmpty ? 0.35 : 1))
                        .cornerRadius(12)
                }
                .disabled(query.trimmingCharacters(in: .whitespaces).isEmpty || isAnalyzing)
            }

            if isAnalyzing {
                HStack(spacing: 8) {
                    ProgressView().scaleEffect(0.7)
                    Text(stageLabel ?? "Thinking")
                        .utilityFont(11)
                        .foregroundColor(.kInkMuted)
                }
            } else {
                Text("Type to find a saved food, or tap ✦ to have the coach work it out.")
                    .utilityFont(11)
                    .foregroundColor(.kInkMuted)
            }
        }
    }

    private var mealTypeChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(MealType.allCases) { type in
                    Chip(title: type.label, selected: type == mealType) { mealType = type }
                }
            }
            .padding(.vertical, 2)
        }
    }

    // MARK: Staged items

    private var stagedItems: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "This meal") {
                Button("Add row") { items.append(MealItem(name: "")) }
                    .utilityFont(11)
                    .foregroundColor(.kAccent)
            }

            TextField("Meal name", text: $mealName)
                .kFieldStyle()

            ForEach(items.indices, id: \.self) { index in
                // Removal is keyed on the row's own id rather than the index it
                // happened to render at — indices go stale the moment one row
                // above it is deleted.
                let rowID = items[index].localID
                ItemRowEditor(item: $items[index]) {
                    items.removeAll { $0.localID == rowID }
                }
            }
        }
    }

    private var totalsBar: some View {
        let total = totals
        return HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(total.calories)")
                    .displayFont(26, .semibold)
                    .foregroundColor(.kInk)
                Text(total.macroLine)
                    .utilityFont(10)
                    .foregroundColor(.kInkMuted)
            }
            Spacer()
            Button(action: { save() }) {
                HStack(spacing: 8) {
                    if isSaving { ProgressView().tint(Color.bone) }
                    Text(isSaving ? "Logging" : "Log it")
                }
            }
            .buttonStyle(KPrimaryButtonStyle(enabled: canSave))
            .disabled(!canSave)
            .frame(width: 150)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
    }

    // MARK: Suggestions

    @ViewBuilder
    private var suggestions: some View {
        let list = query.trimmingCharacters(in: .whitespaces).isEmpty ? recents : matches
        let heading = query.trimmingCharacters(in: .whitespaces).isEmpty ? "Recent foods" : "Your foods"

        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(heading)
                ForEach(list) { food in
                    Button {
                        add(food)
                    } label: {
                        CardSurface(padding: 12) {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(food.name)
                                        .bodyFont(15, weight: .medium)
                                        .foregroundColor(.kInk)
                                        .multilineTextAlignment(.leading)
                                    Text(food.servingDescription.isEmpty ? "1 serving" : food.servingDescription)
                                        .utilityFont(10)
                                        .foregroundColor(.kInkMuted)
                                }
                                Spacer(minLength: 8)
                                Text("\(food.calories)")
                                    .displayFont(18, .semibold)
                                    .foregroundColor(.kInk)
                                Image(systemName: "plus.circle.fill")
                                    .font(.system(size: 18))
                                    .foregroundColor(.kAccent)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        } else if items.isEmpty && !isAnalyzing {
            VStack(alignment: .leading, spacing: 10) {
                EmptyNote(query.isEmpty
                    ? "Nothing saved yet. Describe a meal above and the coach will break it down."
                    : "No saved food matches that. Tap ✦ to estimate it.")
                Button("Start a blank entry") {
                    items.append(MealItem(name: query.isEmpty ? "" : query))
                    if mealName.isEmpty { mealName = query }
                    query = ""
                }
                .buttonStyle(KQuietButtonStyle())
            }
        }
    }

    // MARK: Actions

    private func scheduleSearch(_ text: String) {
        searchTask?.cancel()
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else {
            matches = []
            return
        }
        searchTask = Task { @MainActor in
            // Enough of a pause that typing a sentence doesn't fire a request
            // per keystroke over Tailscale.
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            if let found = try? await api.savedFoods(matching: trimmed, limit: 12) {
                guard !Task.isCancelled else { return }
                matches = found
            }
        }
    }

    @MainActor
    private func loadRecents() async {
        if let found = try? await api.savedFoods(matching: "", limit: 8) {
            recents = found
        }
    }

    private func add(_ food: SavedFood) {
        items.append(food.asMealItem)
        if mealName.isEmpty { mealName = food.name }
        query = ""
        matches = []
        queryFocused = false
        Haptics.logged()
    }

    private func analyze() {
        let description = query.trimmingCharacters(in: .whitespaces)
        guard !description.isEmpty, !isAnalyzing else { return }
        queryFocused = false
        isAnalyzing = true
        errorText = nil
        stageLabel = nil

        Task { @MainActor in
            // `defer` bodies don't inherit an explicitly-annotated Task
            // closure's actor isolation on Swift 5.5, so the flag is
            // cleared on each path instead.
            do {
                let estimate = try await api.analyze(description: description) { label in
                    stageLabel = label
                }
                let newRows = estimate.editableItems
                items.append(contentsOf: newRows)
                if mealName.isEmpty { mealName = estimate.name }
                usedCoach = true
                query = ""
                matches = []
                Haptics.logged()
            } catch {
                errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
                Haptics.failed()
            }
            isAnalyzing = false
        }
    }

    private func save() {
        guard canSave else { return }
        isSaving = true
        errorText = nil

        let name = mealName.trimmingCharacters(in: .whitespaces).isEmpty
            ? (items.first?.name.isEmpty == false ? items[0].name : "Meal")
            : mealName.trimmingCharacters(in: .whitespaces)

        let payload = MealPayload(
            name: name,
            mealType: mealType.rawValue,
            notes: nil,
            date: APIClient.dayString(date),
            items: items.map { row in
                var copy = row
                if copy.name.trimmingCharacters(in: .whitespaces).isEmpty { copy.name = name }
                return copy
            },
            // Only coach-derived meals get auto-saved to My Foods. Blank rows
            // and re-logged saved foods would just create duplicates.
            source: usedCoach ? "ai" : nil,
            servingDescription: usedCoach ? items.first?.servingLabel : nil,
            brand: nil
        )

        Task { @MainActor in
            // `defer` bodies don't inherit an explicitly-annotated Task
            // closure's actor isolation on Swift 5.5, so the flag is
            // cleared on each path instead.
            do {
                _ = try await api.logMeal(payload)
                Haptics.logged()
                isSaving = false
                onLogged()
                dismiss()
            } catch {
                isSaving = false
                errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
                Haptics.failed()
            }
        }
    }
}

// MARK: - Item row

/// One editable component of a meal. Changing the serving amount rescales from
/// the stored baseline; hand-editing a macro re-pins that baseline, so the two
/// controls never fight each other.
@MainActor
struct ItemRowEditor: View {
    @Binding var item: MealItem
    var onDelete: () -> Void

    @State private var expanded = false
    @State private var amountText = ""
    @State private var caloriesText = ""
    @State private var proteinText = ""
    @State private var carbsText = ""
    @State private var fatText = ""

    var body: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 10) {
                    TextField("Item", text: $item.name)
                        .bodyFont(15, weight: .medium)
                        .foregroundColor(.kInk)
                    Spacer(minLength: 4)
                    Text("\(item.calories)")
                        .displayFont(20, .semibold)
                        .foregroundColor(.kInk)
                    Button(action: onDelete) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 17))
                            .foregroundColor(.kInkMuted.opacity(0.5))
                    }
                    .buttonStyle(.plain)
                }

                HStack(spacing: 10) {
                    Button {
                        step(-1)
                    } label: {
                        stepperGlyph("minus")
                    }
                    .buttonStyle(.plain)

                    TextField("1", text: $amountText)
                        .keyboardType(.decimalPad)
                        .kFieldStyle(alignment: .center)
                        .frame(width: 74)
                        .onChange(of: amountText) { next in
                            guard let value = Double(next.replacingOccurrences(of: ",", with: ".")), value > 0 else { return }
                            // The equality guard is what stops this bouncing:
                            // rescaling rewrites the macro fields, whose own
                            // onChange writes back here.
                            guard abs(value - item.servingAmount) > 0.0001 else { return }
                            item.setServingAmount(value)
                            syncMacroFields()
                        }

                    Button {
                        step(1)
                    } label: {
                        stepperGlyph("plus")
                    }
                    .buttonStyle(.plain)

                    Text(item.servingUnit.isEmpty ? "serving" : item.servingUnit)
                        .utilityFont(11)
                        .foregroundColor(.kInkMuted)

                    Spacer()

                    Button {
                        // Closing the macro editor is what re-pins the serving
                        // baseline, so the user's corrected numbers become the
                        // reference the ± buttons scale from.
                        if expanded { item.recalibrate() }
                        withAnimation { expanded.toggle() }
                    } label: {
                        Text(expanded ? "Done" : "Macros")
                            .utilityFont(11)
                            .foregroundColor(.kAccent)
                    }
                    .buttonStyle(.plain)
                }

                if expanded {
                    HStack(spacing: 8) {
                        macroField("KCAL", $caloriesText)
                        macroField("P", $proteinText)
                        macroField("C", $carbsText)
                        macroField("F", $fatText)
                    }
                    Text("Editing a macro re-bases the serving maths on your numbers.")
                        .utilityFont(10)
                        .foregroundColor(.kInkMuted)
                } else {
                    Text("P \(fmt(item.proteinG))   C \(fmt(item.carbsG))   F \(fmt(item.fatG))")
                        .utilityFont(11)
                        .foregroundColor(.kInkMuted)
                }
            }
        }
        .onAppear { syncAllFields() }
    }

    private func stepperGlyph(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(.kInk)
            .frame(width: 34, height: 34)
            .background(Circle().strokeBorder(Color.kHairline, lineWidth: 1))
    }

    private func macroField(_ label: String, _ binding: Binding<String>) -> some View {
        VStack(spacing: 4) {
            Text(label)
                .utilityFont(9)
                .foregroundColor(.kInkMuted)
            TextField("0", text: binding)
                .keyboardType(.decimalPad)
                .kFieldStyle(alignment: .center)
                .onChange(of: binding.wrappedValue) { _ in applyMacros() }
        }
    }

    private func step(_ direction: Double) {
        let next = max(0.25, item.servingAmount + direction * 0.5)
        item.setServingAmount(next)
        syncAllFields()
        Haptics.logged()
    }

    private func syncAllFields() {
        amountText = trimNumber(item.servingAmount)
        syncMacroFields()
    }

    private func syncMacroFields() {
        caloriesText = String(item.calories)
        proteinText = trimNumber(item.proteinG)
        carbsText = trimNumber(item.carbsG)
        fatText = trimNumber(item.fatG)
    }

    /// Writes the typed macros straight through to the item — no re-basing
    /// here, so a keystroke never disturbs the serving maths mid-edit.
    private func applyMacros() {
        guard expanded else { return }
        item.calories = Int(parse(caloriesText).rounded())
        item.proteinG = parse(proteinText)
        item.carbsG = parse(carbsText)
        item.fatG = parse(fatText)
    }

    private func parse(_ text: String) -> Double {
        Double(text.replacingOccurrences(of: ",", with: ".")) ?? 0
    }

    private func trimNumber(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
    }

    private func fmt(_ value: Double) -> String {
        "\(Int(value.rounded()))g"
    }
}

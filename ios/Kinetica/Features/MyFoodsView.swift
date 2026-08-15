//  MyFoodsView.swift
//  The saved-food library.
//
//  These values sit at the TOP of the nutrition pipeline's data precedence —
//  above USDA, above web labels — because they're numbers the user has
//  confirmed by hand. That makes this screen quietly the highest-leverage one
//  in the app: correcting a wrong macro here improves every future estimate
//  that touches the same food.

import SwiftUI

@MainActor
struct MyFoodsView: View {
    @State private var foods: [SavedFood] = []
    @State private var query = ""
    @State private var isLoading = false
    @State private var errorText: String?
    @State private var editing: SavedFood?
    @State private var pendingDelete: SavedFood?
    @State private var mergeKeepers: [String: String] = [:]
    @State private var mergingGroup: String?

    private let api = APIClient.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let error = errorText {
                    ServerTrouble(message: error) { Task { await load() } }
                }

                if !duplicateGroups.isEmpty && query.isEmpty {
                    duplicatesSection
                }

                if filtered.isEmpty && !isLoading {
                    EmptyNote(query.isEmpty
                        ? "Nothing saved yet. Foods you log through the coach get saved here automatically."
                        : "No saved food matches “\(query)”.")
                } else {
                    SectionHeader(title: "\(filtered.count) food\(filtered.count == 1 ? "" : "s")") {
                        if isLoading { ProgressView().scaleEffect(0.6) }
                    }
                    ForEach(filtered) { food in
                        Button { editing = food } label: { row(food) }
                            .buttonStyle(.plain)
                    }
                }

                Spacer(minLength: 32)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
        .searchable(text: $query, prompt: "Search your foods")
        .refreshable { await load() }
        .screenBackground()
        .navigationTitle("My Foods")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(item: $editing) { food in
            EditFoodView(food: food, allFoods: foods) { Task { await load() } }
        }
        .alert("Delete this food?", isPresented: Binding(
            get: { pendingDelete != nil },
            set: { if !$0 { pendingDelete = nil } }
        ), presenting: pendingDelete) { food in
            Button("Cancel", role: .cancel) { pendingDelete = nil }
            Button("Delete", role: .destructive) { Task { await delete(food) } }
        } message: { _ in
            Text("Meals you've already logged keep their numbers — only the saved shortcut goes.")
        }
    }

    // MARK: Data shaping

    private var filtered: [SavedFood] {
        let term = query.trimmingCharacters(in: .whitespaces).lowercased()
        let list = term.isEmpty
            ? foods
            : foods.filter { $0.name.lowercased().contains(term) || ($0.brand ?? "").lowercased().contains(term) }
        return list.sorted { $0.useCount > $1.useCount }
    }

    /// Mirrors `normalizeName` in lib/food-name.ts — the server groups
    /// duplicates on the normalized name alone, since the DB's
    /// (profileId, name, servingDescription) constraint happily allows
    /// "Chicken 100g" and "chicken 6oz" to coexist.
    private func normalized(_ name: String) -> String {
        name.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .lowercased()
    }

    private var duplicateGroups: [[SavedFood]] {
        Dictionary(grouping: foods) { normalized($0.name) }
            .values
            .filter { $0.count > 1 }
            .sorted { ($0.first?.name ?? "") < ($1.first?.name ?? "") }
    }

    // MARK: Views

    private var duplicatesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Possible duplicates")
            Text("Same food saved more than once. Merging keeps one, relinks past meals to it, and adds up the use counts.")
                .utilityFont(10)
                .foregroundColor(.kInkMuted)

            ForEach(duplicateGroups, id: \.self.first!.id) { group in
                let key = normalized(group[0].name)
                let keeper = mergeKeepers[key] ?? mostUsed(group).id
                CardSurface {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(group[0].name)
                            .bodyFont(15, weight: .medium)
                            .foregroundColor(.kInk)

                        ForEach(group) { food in
                            Button {
                                mergeKeepers[key] = food.id
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: keeper == food.id ? "largecircle.fill.circle" : "circle")
                                        .foregroundColor(keeper == food.id ? .kAccent : .kInkMuted)
                                        .font(.system(size: 15))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(food.servingDescription.isEmpty ? "1 serving" : food.servingDescription)
                                            .utilityFont(11)
                                            .foregroundColor(.kInk)
                                        Text("\(food.calories) kcal  ·  used \(food.useCount)×")
                                            .utilityFont(10)
                                            .foregroundColor(.kInkMuted)
                                    }
                                    Spacer()
                                }
                            }
                            .buttonStyle(.plain)
                        }

                        Button {
                            Task { await merge(group: group, keep: keeper) }
                        } label: {
                            HStack(spacing: 8) {
                                if mergingGroup == key { ProgressView().scaleEffect(0.7) }
                                Text("Merge \(group.count - 1) into this")
                            }
                        }
                        .buttonStyle(KQuietButtonStyle())
                        .disabled(mergingGroup != nil)
                    }
                }
            }
        }
    }

    private func mostUsed(_ group: [SavedFood]) -> SavedFood {
        group.max(by: { $0.useCount < $1.useCount }) ?? group[0]
    }

    private func row(_ food: SavedFood) -> some View {
        CardSurface(padding: 14) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(food.name)
                        .bodyFont(15, weight: .medium)
                        .foregroundColor(.kInk)
                        .multilineTextAlignment(.leading)
                    Text(subtitle(food))
                        .utilityFont(10)
                        .foregroundColor(.kInkMuted)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(food.calories)")
                        .displayFont(18, .semibold)
                        .foregroundColor(.kInk)
                    Text("used \(food.useCount)×")
                        .utilityFont(9)
                        .foregroundColor(.kInkMuted)
                }
                Button {
                    pendingDelete = food
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 12))
                        .foregroundColor(.kInkMuted.opacity(0.55))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func subtitle(_ food: SavedFood) -> String {
        var parts: [String] = []
        if let brand = food.brand, !brand.isEmpty { parts.append(brand) }
        parts.append(food.servingDescription.isEmpty ? "1 serving" : food.servingDescription)
        parts.append("P \(Int(food.proteinG.rounded())) C \(Int(food.carbsG.rounded())) F \(Int(food.fatG.rounded()))")
        return parts.joined(separator: "  ·  ")
    }

    // MARK: Actions

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            // The whole library, not a search slice — duplicate detection has to
            // see every row to find pairs.
            foods = try await api.savedFoods(matching: "", limit: 200)
            errorText = nil
        } catch {
            errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func delete(_ food: SavedFood) async {
        pendingDelete = nil
        do {
            try await api.deleteSavedFood(id: food.id)
            await load()
        } catch {
            errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
            Haptics.failed()
        }
    }

    private func merge(group: [SavedFood], keep: String) async {
        let key = normalized(group[0].name)
        mergingGroup = key
        defer { mergingGroup = nil }
        do {
            try await api.mergeSavedFoods(keep: keep, merge: group.map(\.id).filter { $0 != keep })
            Haptics.logged()
            await load()
        } catch {
            errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
            Haptics.failed()
        }
    }
}

// MARK: - Editing

@MainActor
struct EditFoodView: View {
    let food: SavedFood
    /// Needed to name the conflicting food when a rename collides.
    let allFoods: [SavedFood]
    var onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var brand: String
    @State private var servingDescription: String
    @State private var servingAmount: String
    @State private var servingUnit: String
    @State private var servingGrams: String
    @State private var calories: String
    @State private var protein: String
    @State private var carbs: String
    @State private var fat: String
    @State private var isSaving = false
    @State private var errorText: String?
    @State private var conflictId: String?

    private let api = APIClient.shared

    init(food: SavedFood, allFoods: [SavedFood], onSaved: @escaping () -> Void) {
        self.food = food
        self.allFoods = allFoods
        self.onSaved = onSaved
        _name = State(initialValue: food.name)
        _brand = State(initialValue: food.brand ?? "")
        _servingDescription = State(initialValue: food.servingDescription)
        _servingAmount = State(initialValue: EditFoodView.trim(food.servingAmount))
        _servingUnit = State(initialValue: food.servingUnit)
        _servingGrams = State(initialValue: food.servingGrams.map(EditFoodView.trim) ?? "")
        _calories = State(initialValue: String(food.calories))
        _protein = State(initialValue: EditFoodView.trim(food.proteinG))
        _carbs = State(initialValue: EditFoodView.trim(food.carbsG))
        _fat = State(initialValue: EditFoodView.trim(food.fatG))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("These numbers outrank the food database when the coach estimates a meal, so correcting them here fixes every future estimate too.")
                        .bodyFont(13)
                        .foregroundColor(.kInkMuted)

                    CardSurface {
                        VStack(spacing: 8) {
                            FieldRow(label: "Name") {
                                TextField("Name", text: $name).kFieldStyle()
                            }
                            FieldRow(label: "Brand") {
                                TextField("Optional", text: $brand).kFieldStyle()
                            }
                            FieldRow(label: "Serving") {
                                TextField("1 cup", text: $servingDescription).kFieldStyle()
                            }
                            FieldRow(label: "Amount") {
                                TextField("1", text: $servingAmount)
                                    .keyboardType(.decimalPad)
                                    .kFieldStyle(alignment: .trailing)
                            }
                            FieldRow(label: "Unit") {
                                TextField("cup", text: $servingUnit).kFieldStyle()
                            }
                            FieldRow(label: "Grams", unit: "g") {
                                TextField("—", text: $servingGrams)
                                    .keyboardType(.decimalPad)
                                    .kFieldStyle(alignment: .trailing)
                            }
                        }
                    }

                    CardSurface {
                        VStack(spacing: 8) {
                            FieldRow(label: "Calories", unit: "kcal") {
                                TextField("0", text: $calories)
                                    .keyboardType(.numberPad)
                                    .kFieldStyle(alignment: .trailing)
                            }
                            FieldRow(label: "Protein", unit: "g") {
                                TextField("0", text: $protein)
                                    .keyboardType(.decimalPad)
                                    .kFieldStyle(alignment: .trailing)
                            }
                            FieldRow(label: "Carbs", unit: "g") {
                                TextField("0", text: $carbs)
                                    .keyboardType(.decimalPad)
                                    .kFieldStyle(alignment: .trailing)
                            }
                            FieldRow(label: "Fat", unit: "g") {
                                TextField("0", text: $fat)
                                    .keyboardType(.decimalPad)
                                    .kFieldStyle(alignment: .trailing)
                            }
                        }
                    }

                    if let error = errorText {
                        Text(error)
                            .bodyFont(14)
                            .foregroundColor(.kEmber)
                    }

                    // A rename that collides isn't a dead end — the server hands
                    // back the offending row's id so the two can be merged.
                    if let conflictId = conflictId {
                        Button {
                            Task { await mergeInto(conflictId) }
                        } label: {
                            Text("Merge into “\(conflictName(conflictId))” instead")
                        }
                        .buttonStyle(KQuietButtonStyle())
                    }

                    Button(action: { save() }) {
                        HStack(spacing: 8) {
                            if isSaving { ProgressView().tint(Color.bone) }
                            Text(isSaving ? "Saving" : "Save changes")
                        }
                    }
                    .buttonStyle(KPrimaryButtonStyle(enabled: !isSaving && !name.trimmingCharacters(in: .whitespaces).isEmpty))
                    .disabled(isSaving || name.trimmingCharacters(in: .whitespaces).isEmpty)

                    Spacer(minLength: 24)
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
            }
            .screenBackground()
            .navigationTitle("Edit food")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func conflictName(_ id: String) -> String {
        allFoods.first { $0.id == id }?.name ?? name
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, !isSaving else { return }
        isSaving = true
        errorText = nil
        conflictId = nil

        let patch = SavedFoodPatch(
            id: food.id,
            name: trimmed,
            brand: brand.trimmingCharacters(in: .whitespaces).isEmpty ? nil : brand,
            servingDescription: servingDescription.trimmingCharacters(in: .whitespaces),
            servingAmount: parse(servingAmount) ?? 1,
            servingUnit: servingUnit.trimmingCharacters(in: .whitespaces),
            servingGrams: parse(servingGrams),
            calories: Int(parse(calories) ?? 0),
            proteinG: parse(protein) ?? 0,
            carbsG: parse(carbs) ?? 0,
            fatG: parse(fat) ?? 0
        )

        Task { @MainActor in
            do {
                _ = try await api.updateSavedFood(patch)
                Haptics.logged()
                isSaving = false
                onSaved()
                dismiss()
            } catch SavedFoodError.nameTaken(let id) {
                isSaving = false
                errorText = "You already have a food saved under that name."
                conflictId = id
                Haptics.failed()
            } catch {
                isSaving = false
                errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
                Haptics.failed()
            }
        }
    }

    private func mergeInto(_ keepId: String) async {
        do {
            try await api.mergeSavedFoods(keep: keepId, merge: [food.id])
            Haptics.logged()
            onSaved()
            dismiss()
        } catch {
            errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
            Haptics.failed()
        }
    }

    private func parse(_ text: String) -> Double? {
        let cleaned = text.replacingOccurrences(of: ",", with: ".")
        guard !cleaned.isEmpty, let value = Double(cleaned) else { return nil }
        return value
    }

    private static func trim(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
    }
}

//  MealDetailView.swift
//  Correcting a logged meal.
//
//  Items use the server's replace-all semantics: totals are recomputed from the
//  rows on save, so what's on screen is exactly what gets stored. Editing here
//  is a correction, not a new food event — the server deliberately doesn't
//  re-save anything to My Foods from this path.

import SwiftUI

@MainActor
struct MealDetailView: View {
    let meal: Meal
    var onChanged: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var mealType: MealType
    @State private var items: [MealItem]
    @State private var isSaving = false
    @State private var isDeleting = false
    @State private var confirmingDelete = false
    @State private var errorText: String?

    private let api = APIClient.shared

    init(meal: Meal, onChanged: @escaping () -> Void) {
        self.meal = meal
        self.onChanged = onChanged
        _name = State(initialValue: meal.name)
        _mealType = State(initialValue: MealType(rawValue: meal.mealType) ?? .other)
        // Meals logged before per-item breakdown existed (or logged blank) have
        // no rows — surface their totals as a single editable row so the same
        // editor works for both shapes.
        let existing = meal.items ?? []
        _items = State(initialValue: existing.isEmpty
            ? [MealItem(
                name: meal.name,
                calories: meal.calories,
                proteinG: meal.proteinG,
                carbsG: meal.carbsG,
                fatG: meal.fatG
              )]
            : existing)
    }

    private var totals: MacroTotals { MacroTotals.sum(items) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                TextField("Meal name", text: $name)
                    .kFieldStyle()

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(MealType.allCases) { type in
                            Chip(title: type.label, selected: type == mealType) { mealType = type }
                        }
                    }
                    .padding(.vertical, 2)
                }

                if let error = errorText {
                    Text(error)
                        .bodyFont(14)
                        .foregroundColor(.kEmber)
                }

                SectionHeader(title: "Items") {
                    Button("Add row") { items.append(MealItem(name: "")) }
                        .utilityFont(11)
                        .foregroundColor(.kAccent)
                }

                ForEach(items.indices, id: \.self) { index in
                    let rowID = items[index].localID
                    ItemRowEditor(item: $items[index]) {
                        items.removeAll { $0.localID == rowID }
                    }
                }

                Button(action: { save() }) {
                    HStack(spacing: 8) {
                        if isSaving { ProgressView().tint(Color.bone) }
                        Text(isSaving ? "Saving" : "Save changes")
                    }
                }
                .buttonStyle(KPrimaryButtonStyle(enabled: !isSaving && !items.isEmpty))
                .disabled(isSaving || items.isEmpty)
                .padding(.top, 4)

                deleteButton

                Spacer(minLength: 32)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
        .screenBackground()
        .navigationTitle("Edit meal")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var header: some View {
        let total = totals
        return VStack(alignment: .leading, spacing: 6) {
            Eyebrow(Self.stampFormatter.string(from: meal.loggedAt))
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(total.calories)")
                    .displayFont(44, .semibold)
                    .foregroundColor(.kInk)
                Text("kcal")
                    .utilityFont(12)
                    .foregroundColor(.kInkMuted)
            }
            Text(total.macroLine)
                .utilityFont(11)
                .foregroundColor(.kInkMuted)
        }
        .padding(.top, 6)
    }

    private var deleteButton: some View {
        Group {
            if confirmingDelete {
                HStack(spacing: 10) {
                    Button("Cancel") { confirmingDelete = false }
                        .buttonStyle(KQuietButtonStyle())
                    Button(isDeleting ? "Deleting" : "Delete meal") { delete() }
                        .bodyFont(15, weight: .semibold)
                        .foregroundColor(Color.bone)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.kEmber)
                        .cornerRadius(14)
                        .disabled(isDeleting)
                }
            } else {
                // Always visible, never hover-only — there is no hover on a
                // phone, which is exactly how this got missed on the web.
                Button("Delete meal") { confirmingDelete = true }
                    .bodyFont(14)
                    .foregroundColor(.kEmber)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
        }
    }

    private func save() {
        guard !isSaving else { return }
        isSaving = true
        errorText = nil

        let finalName = name.trimmingCharacters(in: .whitespaces).isEmpty ? meal.name : name.trimmingCharacters(in: .whitespaces)
        let payload = MealPatchPayload(
            id: meal.id,
            name: finalName,
            mealType: mealType.rawValue,
            notes: meal.notes,
            date: nil,
            items: items.map { row in
                var copy = row
                if copy.name.trimmingCharacters(in: .whitespaces).isEmpty { copy.name = finalName }
                return copy
            }
        )

        Task { @MainActor in
            // `defer` bodies don't inherit an explicitly-annotated Task
            // closure's actor isolation on Swift 5.5, so the flag is
            // cleared on each path instead.
            do {
                _ = try await api.updateMeal(payload)
                Haptics.logged()
                isSaving = false
                onChanged()
                dismiss()
            } catch {
                isSaving = false
                errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
                Haptics.failed()
            }
        }
    }

    private func delete() {
        guard !isDeleting else { return }
        isDeleting = true
        Task { @MainActor in
            do {
                try await api.deleteMeal(id: meal.id)
                isDeleting = false
                onChanged()
                dismiss()
            } catch {
                isDeleting = false
                errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
                Haptics.failed()
            }
        }
    }

    private static let stampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE d MMM · HH:mm"
        return formatter
    }()
}

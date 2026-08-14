//  ProfileView.swift
//  Body data, targets, and the two settings a sideloaded build needs to expose:
//  where the server is, and how to sign out of it.
//
//  Units are imperial throughout, matching what the server stores.

import SwiftUI

@MainActor
struct ProfileView: View {
    @EnvironmentObject private var state: AppState

    @State private var displayName = ""
    @State private var age = ""
    @State private var gender = "male"
    @State private var heightIn = ""
    @State private var weightLbs = ""
    @State private var goalWeightLbs = ""
    @State private var bmrOverride = ""
    @State private var activity = "moderate"
    @State private var isSaving = false
    @State private var savedFlash = false
    @State private var errorText: String?
    @State private var serverURL = AppConfig.baseURLString
    @State private var confirmingSignOut = false

    private let api = APIClient.shared
    private let activities = ["sedentary", "light", "moderate", "active", "athlete"]
    private let genders = ["male", "female", "other"]

    private var profile: Profile? { state.profile }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    stats
                    targets
                    basics
                    server
                    signOut
                    Spacer(minLength: 32)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }
            .screenBackground()
            .navigationTitle("You")
            .navigationBarTitleDisplayMode(.inline)
        }
        .navigationViewStyle(.stack)
        .onAppear { fillFromProfile() }
        .onChange(of: state.profile?.id) { _ in fillFromProfile() }
    }

    // MARK: Stats

    private var stats: some View {
        let streak = profile?.streakDays ?? 0
        let level = profile?.level ?? 1
        let xp = profile?.xpPoints ?? 0
        let next = profile?.xpForNextLevel ?? 500
        let progress = next > 0 ? Double(xp) / Double(next) : 0

        return HStack(spacing: 20) {
            ChalkRing(progress: progress, lineWidth: 10) {
                VStack(spacing: 0) {
                    Text("\(level)")
                        .displayFont(26, .semibold)
                        .foregroundColor(.kInk)
                    Text("level")
                        .utilityFont(9)
                        .foregroundColor(.kInkMuted)
                }
            }
            .frame(width: 96, height: 96)

            VStack(alignment: .leading, spacing: 10) {
                Text(profile?.displayName ?? "—")
                    .displayFont(24, .medium)
                    .foregroundColor(.kInk)
                Text("\(xp) / \(next) xp")
                    .utilityFont(11)
                    .foregroundColor(.kInkMuted)
                Text("\(streak) day streak")
                    .utilityFont(11)
                    .foregroundColor(.kInkMuted)
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 8)
    }

    // MARK: Targets

    private var targets: some View {
        CardSurface {
            VStack(alignment: .leading, spacing: 14) {
                SectionHeader("Daily targets")
                HStack(spacing: 22) {
                    Figure(value: "\(profile?.calorieGoal ?? 0)", caption: "calories", unit: "kcal")
                    Figure(value: "\(profile?.proteinGoal ?? 0)", caption: "protein", unit: "g")
                    if let bmr = profile?.bmr {
                        Figure(value: "\(bmr)", caption: "bmr", unit: "kcal", tint: .kInkMuted)
                    }
                }
                if let min = profile?.calorieTargetMin, let max = profile?.calorieTargetMax {
                    Text("Range \(min)–\(max) kcal")
                        .utilityFont(10)
                        .foregroundColor(.kInkMuted)
                }
                Text("Targets recalculate from your body data unless you've set them by hand in the web app.")
                    .utilityFont(10)
                    .foregroundColor(.kInkMuted)
            }
        }
    }

    // MARK: Basics

    private var basics: some View {
        CardSurface {
            VStack(alignment: .leading, spacing: 14) {
                SectionHeader("Body data")

                labelled("Name") {
                    TextField("Name", text: $displayName).kFieldStyle()
                }

                HStack(spacing: 10) {
                    labelled("Age") {
                        TextField("0", text: $age)
                            .keyboardType(.numberPad)
                            .kFieldStyle(alignment: .trailing)
                    }
                    labelled("Height (in)") {
                        TextField("0", text: $heightIn)
                            .keyboardType(.decimalPad)
                            .kFieldStyle(alignment: .trailing)
                    }
                }

                HStack(spacing: 10) {
                    labelled("Weight (lb)") {
                        TextField("0", text: $weightLbs)
                            .keyboardType(.decimalPad)
                            .kFieldStyle(alignment: .trailing)
                    }
                    labelled("Goal (lb)") {
                        TextField("0", text: $goalWeightLbs)
                            .keyboardType(.decimalPad)
                            .kFieldStyle(alignment: .trailing)
                    }
                }

                labelled("Sex") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(genders, id: \.self) { value in
                                Chip(title: value.capitalized, selected: gender == value) { gender = value }
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }

                labelled("Activity") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(activities, id: \.self) { value in
                                Chip(title: value.capitalized, selected: activity == value) { activity = value }
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }

                labelled("BMR override (kcal)") {
                    TextField("Auto", text: $bmrOverride)
                        .keyboardType(.numberPad)
                        .kFieldStyle(alignment: .trailing)
                }
                Text("Leave blank to use Mifflin-St Jeor from the numbers above.")
                    .utilityFont(10)
                    .foregroundColor(.kInkMuted)

                if let error = errorText {
                    Text(error)
                        .bodyFont(14)
                        .foregroundColor(.kEmber)
                }

                Button(action: { save() }) {
                    HStack(spacing: 8) {
                        if isSaving { ProgressView().tint(Color.bone) }
                        Text(savedFlash ? "Saved" : (isSaving ? "Saving" : "Save"))
                    }
                }
                .buttonStyle(KPrimaryButtonStyle(enabled: !isSaving))
                .disabled(isSaving)
            }
        }
    }

    private func labelled<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Eyebrow(title)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Server

    private var server: some View {
        CardSurface {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader("Server")
                TextField("https://host:port", text: $serverURL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .disableAutocorrection(true)
                    .kFieldStyle()
                    .onChange(of: serverURL) { next in AppConfig.baseURLString = next }
                Text("Needs Tailscale connected and the PC awake. Changing this signs you out on the next request.")
                    .utilityFont(10)
                    .foregroundColor(.kInkMuted)
            }
        }
    }

    private var signOut: some View {
        Group {
            if confirmingSignOut {
                HStack(spacing: 10) {
                    Button("Cancel") { confirmingSignOut = false }
                        .buttonStyle(KQuietButtonStyle())
                    Button("Sign out") {
                        Task { await state.signOut() }
                    }
                    .bodyFont(15, weight: .semibold)
                    .foregroundColor(Color.bone)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.kEmber)
                    .cornerRadius(14)
                }
            } else {
                Button("Sign out") { confirmingSignOut = true }
                    .buttonStyle(KQuietButtonStyle())
            }
        }
    }

    // MARK: Data

    private func fillFromProfile() {
        guard let profile = profile else { return }
        displayName = profile.displayName
        age = profile.age.map { String($0) } ?? ""
        gender = profile.gender ?? "male"
        heightIn = profile.heightIn.map { trim($0) } ?? ""
        weightLbs = profile.weightLbs.map { trim($0) } ?? ""
        goalWeightLbs = profile.goalWeightLbs.map { trim($0) } ?? ""
        bmrOverride = profile.bmrOverride.map { String($0) } ?? ""
        activity = profile.activityLevel
    }

    private func save() {
        guard !isSaving else { return }
        let name = displayName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else {
            errorText = "A display name is required."
            return
        }
        isSaving = true
        errorText = nil

        let basics = ProfileBasics(
            displayName: .value(name),
            // A blank number field means "I didn't fill this in", not "wipe it"
            // — so those keys are omitted rather than nulled.
            age: .optional(Int(age)),
            gender: .value(gender),
            heightIn: .optional(Double(heightIn)),
            weightLbs: .optional(Double(weightLbs)),
            // These two are the exceptions: clearing the box is a real
            // intention, and the server handles null correctly for both.
            goalWeightLbs: goalWeightLbs.isEmpty ? .clear : .optional(Double(goalWeightLbs)),
            bmrOverride: bmrOverride.isEmpty ? .clear : .optional(Int(bmrOverride)),
            activityLevel: .value(activity)
        )

        Task { @MainActor in
            // `defer` bodies don't inherit an explicitly-annotated Task
            // closure's actor isolation on Swift 5.5, so the flag is
            // cleared on each path instead.
            do {
                _ = try await api.updateBasics(basics)
                await state.loadProfile()
                Haptics.logged()
                isSaving = false
                savedFlash = true
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                savedFlash = false
            } catch {
                isSaving = false
                errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
                Haptics.failed()
            }
        }
    }

    private func trim(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
    }
}

//  JournalView.swift
//  Wins log and how-it-went. The coach's reply is generated after the entry is
//  already saved, so a local model that's asleep costs a reply, never the note.

import SwiftUI
import UIKit

@MainActor
struct JournalView: View {
    @EnvironmentObject private var state: AppState

    @State private var entries: [JournalEntry] = []
    @State private var isLoading = false
    @State private var errorText: String?
    @State private var showingCompose = false

    private let api = APIClient.shared

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let error = errorText {
                        ServerTrouble(message: error) { Task { await load() } }
                    }

                    if entries.isEmpty && !isLoading {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Nothing written down yet")
                                .displayFont(24, .medium)
                                .foregroundColor(.kInk)
                            Text("How a session felt, what you noticed, what went right. The coach reads these — it's the part of your training the numbers don't capture.")
                                .bodyFont(15)
                                .foregroundColor(.kInkMuted)
                            Button("Write the first one") { showingCompose = true }
                                .buttonStyle(KPrimaryButtonStyle())
                                .padding(.top, 4)
                        }
                        .padding(.top, 20)
                    }

                    ForEach(entries) { entry in
                        JournalCard(entry: entry)
                    }

                    Spacer(minLength: 28)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }
            .screenBackground()
            .navigationTitle("Journal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingCompose = true
                    } label: {
                        Image(systemName: "square.and.pencil")
                            .foregroundColor(.kAccent)
                    }
                }
            }
        }
        .navigationViewStyle(.stack)
        .task { await load() }
        .sheet(isPresented: $showingCompose) {
            NavigationView {
                JournalComposeView { _ in
                    Task {
                        await load()
                        await state.refreshAfterLog()
                    }
                }
            }
            .navigationViewStyle(.stack)
        }
    }

    @MainActor
    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            entries = try await api.fetchJournal()
            errorText = nil
        } catch {
            errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

// MARK: - Card

@MainActor
struct JournalCard: View {
    let entry: JournalEntry

    var body: some View {
        CardSurface {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Eyebrow(Self.stampFormatter.string(from: entry.loggedAt))
                    if entry.context != "general" {
                        Text(entry.context)
                            .utilityFont(10)
                            .foregroundColor(.kInkMuted)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(Capsule().strokeBorder(Color.kHairline, lineWidth: 1))
                    }
                    Spacer()
                    // A win is the one thing on this card that earns `ember`.
                    if entry.isWin {
                        Label("win", systemImage: "flame.fill")
                            .utilityFont(10)
                            .foregroundColor(.kEmber)
                    }
                    Text(Mood.glyph(entry.mood))
                        .font(.system(size: 15))
                }

                Text(entry.content)
                    .bodyFont(15)
                    .foregroundColor(.kInk)
                    .fixedSize(horizontal: false, vertical: true)

                if let reply = entry.coachReply, !reply.isEmpty {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "quote.opening")
                            .font(.system(size: 11))
                            .foregroundColor(.kAccent)
                        Text(reply)
                            .bodyFont(14)
                            .foregroundColor(.kInk.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.ultraThinMaterial)
                    .cornerRadius(12)
                }
            }
        }
    }

    private static let stampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE d MMM · HH:mm"
        return formatter
    }()
}

enum Mood {
    static let labels = ["Rough", "Low", "Fine", "Good", "Great"]

    static func glyph(_ value: Int) -> String {
        switch value {
        case 1: return "😖"
        case 2: return "😕"
        case 3: return "😐"
        case 4: return "🙂"
        default: return "😄"
        }
    }
}

// MARK: - Compose

@MainActor
struct JournalComposeView: View {
    var onSaved: (JournalEntry) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var content = ""
    @State private var mood = 3
    @State private var context = "general"
    @State private var isWin = false
    @State private var isSaving = false
    @State private var errorText: String?
    @FocusState private var editorFocused: Bool

    private let api = APIClient.shared
    private let contexts = ["general", "weigh-in", "meal", "sleep"]

    private var canSave: Bool {
        !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSaving
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                ZStack(alignment: .topLeading) {
                    if content.isEmpty {
                        Text("How did it go?")
                            .bodyFont()
                            .foregroundColor(.kInkMuted)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 20)
                    }
                    // iOS 15 has no multi-line TextField, so this is a
                    // TextEditor with its own placeholder behind it.
                    TextEditor(text: $content)
                        .bodyFont()
                        .foregroundColor(.kInk)
                        .frame(minHeight: 150)
                        .padding(10)
                        .focused($editorFocused)
                        .onAppear {
                            UITextView.appearance().backgroundColor = .clear
                        }
                }
                .background(Color.kSurface)
                .cornerRadius(16)

                VStack(alignment: .leading, spacing: 8) {
                    Eyebrow("Mood")
                    HStack(spacing: 8) {
                        ForEach(1...5, id: \.self) { value in
                            Button {
                                mood = value
                            } label: {
                                VStack(spacing: 4) {
                                    Text(Mood.glyph(value))
                                        .font(.system(size: 20))
                                    Text(Mood.labels[value - 1])
                                        .utilityFont(9)
                                        .foregroundColor(mood == value ? .kInk : .kInkMuted)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(
                                    RoundedRectangle(cornerRadius: 12)
                                        .strokeBorder(mood == value ? Color.kAccent : Color.kHairline, lineWidth: mood == value ? 2 : 1)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Eyebrow("About")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(contexts, id: \.self) { value in
                                Chip(title: value.capitalized, selected: context == value) { context = value }
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }

                Toggle(isOn: $isWin) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Mark as a win")
                            .bodyFont(15, weight: .medium)
                            .foregroundColor(.kInk)
                        Text("The coach pulls recent wins into its context.")
                            .utilityFont(10)
                            .foregroundColor(.kInkMuted)
                    }
                }
                .tint(.kEmber)

                if let error = errorText {
                    Text(error)
                        .bodyFont(14)
                        .foregroundColor(.kEmber)
                }

                Button(action: { save() }) {
                    HStack(spacing: 8) {
                        if isSaving { ProgressView().tint(Color.bone) }
                        Text(isSaving ? "Saving" : "Save entry")
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
        .navigationTitle("New entry")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
    }

    private func save() {
        guard canSave else { return }
        editorFocused = false
        isSaving = true
        errorText = nil

        let payload = JournalPayload(
            content: content.trimmingCharacters(in: .whitespacesAndNewlines),
            mood: mood,
            // Energy is a second 1–5 scale in the web app; left out here rather
            // than doubling the chip rows on a phone screen.
            energy: nil,
            context: context,
            isWin: isWin
        )

        Task { @MainActor in
            do {
                let entry = try await api.logJournal(payload)
                Haptics.logged()
                onSaved(entry)
                isSaving = false
                dismiss()
                // The reply is a nice-to-have that can take a local model tens
                // of seconds; it's kicked off detached so dismissing the sheet
                // isn't blocked on it. The list picks it up on next load.
                Task.detached {
                    _ = try? await APIClient.shared.fetchCoachReply(entryId: entry.id)
                }
            } catch {
                isSaving = false
                errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
                Haptics.failed()
            }
        }
    }
}

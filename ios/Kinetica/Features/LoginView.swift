//  LoginView.swift
//  Sign-in against Better Auth, plus the server address — because a sideloaded
//  build is expensive to re-sign, the URL has to be changeable from inside the
//  app rather than baked in at compile time.

import SwiftUI

/// File-scope so it can't inherit the view's `@MainActor` isolation, which
/// would collide with the nonisolated `Hashable` that `@FocusState` needs.
private enum LoginField {
    case email, password, server
}

@MainActor
struct LoginView: View {
    @EnvironmentObject private var state: AppState

    @State private var email = ""
    @State private var password = ""
    @State private var serverURL = AppConfig.baseURLString
    @State private var showingServerField = false
    @FocusState private var focused: LoginField?

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty && !state.isSigningIn
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header

                VStack(spacing: 12) {
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                        .textContentType(.emailAddress)
                        .kFieldStyle()
                        .focused($focused, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focused = .password }

                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .kFieldStyle()
                        .focused($focused, equals: .password)
                        .submitLabel(.go)
                        .onSubmit { submit() }
                }
                .padding(.top, 28)

                if let error = state.signInError {
                    Text(error)
                        .bodyFont(14)
                        .foregroundColor(.kEmber)
                        .padding(.top, 12)
                }

                Button(action: { submit() }) {
                    HStack(spacing: 8) {
                        if state.isSigningIn {
                            ProgressView().tint(Color.bone)
                        }
                        Text(state.isSigningIn ? "Signing in" : "Sign in")
                    }
                }
                .buttonStyle(KPrimaryButtonStyle(enabled: canSubmit))
                .disabled(!canSubmit)
                .padding(.top, 20)

                serverSection
                    .padding(.top, 28)

                Spacer(minLength: 40)
            }
            .padding(.horizontal, 24)
            .padding(.top, 60)
        }
        .screenBackground()
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 14) {
                ChalkRing(progress: 0.66, lineWidth: 8)
                    .frame(width: 52, height: 52)
                VStack(alignment: .leading, spacing: 2) {
                    Eyebrow("Iron & chalk")
                    Text("Kinetica")
                        .displayFont(34, .semibold)
                        .foregroundColor(.kInk)
                }
            }
            Text("Sign in with the same account you use in the browser.")
                .bodyFont(15)
                .foregroundColor(.kInkMuted)
        }
    }

    private var serverSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation { showingServerField.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: showingServerField ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                    Text("Server")
                        .utilityFont(11)
                }
                .foregroundColor(.kInkMuted)
            }
            .buttonStyle(.plain)

            if showingServerField {
                TextField("https://host:port", text: $serverURL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .disableAutocorrection(true)
                    .kFieldStyle()
                    .focused($focused, equals: .server)
                    .onChange(of: serverURL) { _, next in
                        AppConfig.baseURLString = next
                    }
                Text("Needs Tailscale connected on this phone, and the PC awake with the server running.")
                    .utilityFont(11)
                    .foregroundColor(.kInkMuted)
            } else {
                Text(AppConfig.baseURLString)
                    .utilityFont(11)
                    .foregroundColor(.kInkMuted)
            }
        }
    }

    private func submit() {
        guard canSubmit else { return }
        focused = nil
        Task {
            await state.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
        }
    }
}

//  Components.swift
//  Shared furniture for the Iron & Chalk language.
//
//  Cards are allowed for logs and coaching copy; photo moments are meant to
//  escape the card grid entirely, so there is deliberately no "photo card"
//  component here.

import SwiftUI

// MARK: - Surfaces

/// Elevated surface — bone in the light, slate at night. 16pt corners:
/// rounded, but never pill-shaped.
struct CardSurface<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.kSurface)
            .cornerRadius(16)
    }
}

/// Page chrome: the chalk-fog background, edge to edge.
struct ScreenBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color.kBackground.ignoresSafeArea())
    }
}

extension View {
    func screenBackground() -> some View { modifier(ScreenBackground()) }
}

// MARK: - Text furniture

/// The small mono line above a heading — "WEEK 12", "THU 14 AUG".
struct Eyebrow: View {
    let text: String
    var tint: Color = .kInkMuted

    init(_ text: String, tint: Color = .kInkMuted) {
        self.text = text
        self.tint = tint
    }

    var body: some View {
        Text(text.uppercased())
            .utilityFont(11)
            .foregroundColor(tint)
    }
}

struct SectionHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .displayFont(KType.Size.displaySmall, .medium)
                .foregroundColor(.kInk)
            Spacer(minLength: 12)
            trailing()
        }
    }
}

extension SectionHeader where Trailing == EmptyView {
    init(_ title: String) {
        self.init(title: title, trailing: { EmptyView() })
    }
}

/// A labelled figure — Fraunces number over a mono caption. The app's default
/// way of showing any single quantity.
struct Figure: View {
    let value: String
    let caption: String
    var unit: String? = nil
    var tint: Color = .kInk
    var size: CGFloat = KType.Size.displaySmall

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value)
                    .displayFont(size, .semibold)
                    .foregroundColor(tint)
                if let unit = unit {
                    Text(unit)
                        .utilityFont(11)
                        .foregroundColor(.kInkMuted)
                }
            }
            Text(caption.uppercased())
                .utilityFont(10)
                .foregroundColor(.kInkMuted)
        }
    }
}

// MARK: - Macros

/// A thin horizontal track. Used for macros, where three rings would be noise —
/// the ring is reserved for the day's headline number.
struct MacroBar: View {
    let label: String
    let value: Double
    let target: Double
    var unit: String = "g"
    var tint: Color = .kAccent

    private var fraction: Double {
        guard target > 0 else { return 0 }
        return min(value / target, 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(label.uppercased())
                    .utilityFont(10)
                    .foregroundColor(.kInkMuted)
                Spacer()
                Text("\(Int(value.rounded()))\(unit) / \(Int(target.rounded()))\(unit)")
                    .utilityFont(10)
                    .foregroundColor(.kInkMuted)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.kHairline)
                    Capsule()
                        .fill(tint)
                        .frame(width: max(geo.size.width * CGFloat(fraction), fraction > 0 ? 4 : 0))
                }
            }
            .frame(height: 6)
        }
    }
}

// MARK: - Controls

/// Primary CTA — ochre, the only fully-filled button in the app.
struct KPrimaryButtonStyle: ButtonStyle {
    var enabled: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .bodyFont(16, weight: .semibold)
            .foregroundColor(Color.bone)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.kAccent.opacity(enabled ? 1 : 0.4))
            .cornerRadius(14)
            .opacity(configuration.isPressed ? 0.82 : 1)
    }
}

/// Secondary action — outlined, sits on either surface.
struct KQuietButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .bodyFont(15, weight: .medium)
            .foregroundColor(.kInk)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(Color.kHairline, lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

/// Selectable chip — meal types, journal contexts, mood.
struct Chip: View {
    let title: String
    let selected: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .bodyFont(14, weight: selected ? .semibold : .regular)
                .foregroundColor(selected ? Color.bone : .kInk)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    Group {
                        if selected {
                            Capsule().fill(Color.kAccent)
                        } else {
                            Capsule().strokeBorder(Color.kHairline, lineWidth: 1)
                        }
                    }
                )
        }
        .buttonStyle(.plain)
    }
}

/// Field chrome as a modifier rather than a wrapper view, so `.focused`,
/// `.onSubmit` and `.textContentType` can be attached directly to the real
/// `TextField` — those don't reliably cross a container boundary.
struct KFieldStyle: ViewModifier {
    var alignment: TextAlignment = .leading

    func body(content: Content) -> some View {
        content
            .bodyFont()
            .multilineTextAlignment(alignment)
            .foregroundColor(.kInk)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color.kSurface)
            .cornerRadius(12)
    }
}

extension View {
    func kFieldStyle(alignment: TextAlignment = .leading) -> some View {
        modifier(KFieldStyle(alignment: alignment))
    }
}

/// Wraps subviews onto as many lines as they need.
///
/// SwiftUI still has no built-in flow layout, and the usual stand-in — a
/// horizontal `ScrollView` — hides options off the right edge with nothing to
/// indicate they're there. That's what made the activity picker awkward.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > maxWidth {
                x = 0
                y += lineHeight + lineSpacing
                lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: maxWidth == .infinity ? max(x - spacing, 0) : maxWidth, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var lineHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += lineHeight + lineSpacing
                lineHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

/// A settings-style row: label on the left, value on the right, unit after it.
///
/// The alternative — a caption stacked above a full-width, right-aligned field —
/// puts the two halves of one fact at opposite corners of the screen and gives
/// the eye nothing to track along. Fixed label column so the values line up
/// into a scannable edge.
struct FieldRow<Content: View>: View {
    let label: String
    var unit: String? = nil
    @ViewBuilder var field: () -> Content

    var body: some View {
        HStack(spacing: 10) {
            Text(label.uppercased())
                .utilityFont(10)
                .foregroundColor(.kInkMuted)
                .frame(width: 84, alignment: .leading)
            field()
            if let unit = unit {
                Text(unit)
                    .utilityFont(10)
                    .foregroundColor(.kInkMuted)
                    .frame(width: 20, alignment: .leading)
            }
        }
    }
}

/// Empty-state copy. Kept quiet — an empty day isn't a failure state.
struct EmptyNote: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .bodyFont(15)
            .foregroundColor(.kInkMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
    }
}

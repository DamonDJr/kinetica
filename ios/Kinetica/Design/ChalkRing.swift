//  ChalkRing.swift
//  The signature element.
//
//  Not a generic circular progress bar: the fill carries a procedural chalk
//  grain so it reads as chalk dust building up on iron. This is the one place
//  in the app worth spending visual budget on, so it is deliberately limited
//  to three jobs — daily streak, daily calorie/volume goal, and PR proximity.
//  Don't reach for it anywhere else.

import SwiftUI
import UIKit

// MARK: - Grain

/// A tiled, cached noise texture. Generated once per process — regenerating it
/// per frame would be the most expensive thing in the app for no visible gain,
/// since chalk dust doesn't shimmer.
enum ChalkGrain {
    static let texture: UIImage = make(side: 96)

    private static func make(side: Int) -> UIImage {
        let bytesPerPixel = 4
        let count = side * side * bytesPerPixel
        var pixels = [UInt8](repeating: 0, count: count)

        // Chalk dust is light on iron, so the flecks skew white; a minority of
        // dark specks keep it from looking like a uniform haze.
        var generator = SystemRandomNumberGenerator()
        for i in stride(from: 0, to: count, by: bytesPerPixel) {
            let isLight = Int.random(in: 0..<10, using: &generator) < 7
            let value: UInt8 = isLight ? 255 : 0
            // Premultiplied alpha: the colour channels must already be scaled.
            let alpha = UInt8(Int.random(in: 0...26, using: &generator))
            let premultiplied = UInt8((Int(value) * Int(alpha)) / 255)
            pixels[i] = premultiplied
            pixels[i + 1] = premultiplied
            pixels[i + 2] = premultiplied
            pixels[i + 3] = alpha
        }

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
        let image: CGImage? = pixels.withUnsafeMutableBytes { buffer in
            guard let context = CGContext(
                data: buffer.baseAddress,
                width: side,
                height: side,
                bitsPerComponent: 8,
                bytesPerRow: side * bytesPerPixel,
                space: colorSpace,
                bitmapInfo: info.rawValue
            ) else { return nil }
            // makeImage copies, so the CGImage outlives this buffer.
            return context.makeImage()
        }
        guard let cgImage = image else { return UIImage() }
        return UIImage(cgImage: cgImage)
    }
}

// MARK: - Arc

/// A single stroked arc, inset so the stroke sits fully inside its frame.
private struct RingArc: Shape {
    var progress: Double
    var lineWidth: CGFloat

    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let radius = (min(rect.width, rect.height) - lineWidth) / 2
        var path = Path()
        guard radius > 0 else { return path }
        path.addArc(
            center: CGPoint(x: rect.midX, y: rect.midY),
            radius: radius,
            startAngle: .degrees(-90),
            endAngle: .degrees(-90 + 360 * min(max(progress, 0), 1)),
            clockwise: false
        )
        return path
    }
}

// MARK: - Ring

struct ChalkRing<Label: View>: View {
    /// 0...1. Values above 1 are clamped for the arc but callers are free to
    /// colour the label differently when a goal is exceeded.
    var progress: Double
    var lineWidth: CGFloat = 14
    var tint: Color = .kAccent
    /// Set false for rings that update live (e.g. as the user types a serving),
    /// where the 0.6s chalking-up animation would feel laggy rather than earned.
    var animateOnAppear: Bool = true
    @ViewBuilder var label: () -> Label

    @State private var shown: Double = 0

    private var clamped: Double { min(max(progress, 0), 1) }

    private var stroke: StrokeStyle {
        StrokeStyle(lineWidth: lineWidth, lineCap: .round)
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.kHairline, style: StrokeStyle(lineWidth: lineWidth))
                .padding(lineWidth / 2)

            RingArc(progress: shown, lineWidth: lineWidth)
                .stroke(tint, style: stroke)

            // The grain rides on top of the fill, clipped to exactly the same
            // arc, so it appears only where "chalk" has been laid down.
            Image(uiImage: ChalkGrain.texture)
                .resizable(resizingMode: .tile)
                .opacity(0.5)
                .mask(RingArc(progress: shown, lineWidth: lineWidth).stroke(Color.black, style: stroke))
                .allowsHitTesting(false)

            label()
        }
        .onAppear {
            if animateOnAppear {
                withAnimation(.easeOut(duration: 0.6)) { shown = clamped }
            } else {
                shown = clamped
            }
        }
        .onChange(of: clamped) { _, next in
            withAnimation(.easeOut(duration: animateOnAppear ? 0.6 : 0.2)) { shown = next }
        }
    }
}

extension ChalkRing where Label == EmptyView {
    init(progress: Double, lineWidth: CGFloat = 14, tint: Color = .kAccent, animateOnAppear: Bool = true) {
        self.init(
            progress: progress,
            lineWidth: lineWidth,
            tint: tint,
            animateOnAppear: animateOnAppear,
            label: { EmptyView() }
        )
    }
}

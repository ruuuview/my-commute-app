import ActivityKit
import SwiftUI
import WidgetKit

// ============================================================
// MyCommuteLiveActivityAttributes
// ------------------------------------------------------------
// ActivityKit attributes + content state for the My Commute
// Live Activity (Dynamic Island + Lock Screen).
//
// ARCHITECTURE RULE: this module READS from the Tier 2 cache
// only. The RN layer (Tier2CacheManager) is the single writer.
// The bridge module mirrors a slim JSON of that cache into the
// App Group container; the widget reads THAT mirror. No cache
// data is owned or duplicated here.
// ============================================================

public struct Arrival: Codable, Hashable {
  public let destinationName: String
  public let timeToStationSeconds: Int
  public let isHero: Bool
}

public struct MyCommuteLiveActivityAttributes: ActivityAttributes {
  // Static for the life of the activity.
  public var stationId: String
  public var lineId: String
  public var lineName: String

  // Mutable content state.
  public struct ContentState: Codable, Hashable {
    public var branchKnown: Bool
    public var arrivals: [Arrival]
    public var statusText: String
    public var isDisrupted: Bool
    // "ok" | "no-signal" | "meltdown"
    public var signalState: String

    public init(
      branchKnown: Bool,
      arrivals: [Arrival],
      statusText: String,
      isDisrupted: Bool,
      signalState: String
    ) {
      self.branchKnown = branchKnown
      self.arrivals = arrivals
      self.statusText = statusText
      self.isDisrupted = isDisrupted
      self.signalState = signalState
    }
  }

  public init(stationId: String, lineId: String, lineName: String) {
    self.stationId = stationId
    self.lineId = lineId
    self.lineName = lineName
  }
}

// ============================================================
// Line color token — mirrors frontend tokens.ts LINE_COLORS.
// 11 tube lines + Elizabeth + Overground. No emojis.
// ============================================================

enum LineColor {
  static func color(for lineId: String) -> Color {
    switch lineId.lowercased() {
    case "bakerloo":        return Color(hex: 0xB36305)
    case "central":         return Color(hex: 0xE32017)
    case "circle":          return Color(hex: 0xFFD329)
    case "district":        return Color(hex: 0x00782A)
    case "elizabeth":       return Color(hex: 0x6950A1)
    case "hammersmith":     return Color(hex: 0xF3A9BB)
    case "jubilee":         return Color(hex: 0xA1A5A9)
    case "metropolitan":    return Color(hex: 0x9B0056)
    case "northern":        return Color(hex: 0x000000)
    case "piccadilly":      return Color(hex: 0x0019A8)
    case "victoria":        return Color(hex: 0x0098D4)
    case "waterlooandcity": return Color(hex: 0x95CDBA)
    case "overground":      return Color(hex: 0xEE7C0E)
    default:                return Color(hex: 0x888888)
    }
  }
}

extension Color {
  init(hex: UInt32) {
    let r = Double((hex >> 16) & 0xFF) / 255.0
    let g = Double((hex >> 8) & 0xFF) / 255.0
    let b = Double(hex & 0xFF) / 255.0
    self.init(.sRGB, red: r, green: g, blue: b, opacity: 1.0)
  }
}

// ============================================================
// Confidence softening: under ~5 min = full; over = softened "~".
// ============================================================

private let SOFTEN_THRESHOLD_SECONDS = 5 * 60

func displayText(for arrival: Arrival, isHero: Bool) -> (minutes: Int, softened: Bool) {
  let minutes = max(0, Int((arrival.timeToStationSeconds + 30) / 60)) // round to nearest minute
  let softened = !isHero && arrival.timeToStationSeconds > SOFTEN_THRESHOLD_SECONDS
  return (minutes, softened)
}

// ============================================================
// System font stack. Space Grotesk is NOT a system font; to use
// it, drop SpaceGrotesk-Bold.ttf into the widget target and
// register it in Info.plist (Fonts provided by application),
// then swap `.system(.body, design: .default)` for
// `.custom("SpaceGrotesk-Bold", size: 15, relativeTo: .body)`.
// ============================================================

extension Font {
  static let mcBody = Font.system(.body, design: .default)
  static let mcHeadline = Font.system(.headline, design: .default)
  static let mcTitle = Font.system(.title3, design: .default)
}

// ============================================================
// Shared subviews
// ============================================================

private struct AccentBar: View {
  let lineId: String
  var body: some View {
    Rectangle()
      .fill(LineColor.color(for: lineId))
      .frame(width: 4)
  }
}

/// A single arrival row used in both Compact-minimal and Expanded lists.
private struct ArrivalRow: View {
  let arrival: Arrival
  let branchKnown: Bool
  let lineId: String

  private var destination: String {
    // Branch unknown: collapse to line name (e.g. "Northern").
    if !branchKnown {
      return lineName(for: lineId)
    }
    return arrival.destinationName.isEmpty ? lineName(for: lineId) : arrival.destinationName
  }

  private func lineName(for id: String) -> String {
    // Map canonical id -> display "Northern" etc. for the branch-unknown fallback.
    let map: [String: String] = [
      "bakerloo": "Bakerloo", "central": "Central", "circle": "Circle",
      "district": "District", "elizabeth": "Elizabeth", "hammersmith": "Hammersmith",
      "jubilee": "Jubilee", "metropolitan": "Metropolitan", "northern": "Northern",
      "piccadilly": "Piccadilly", "victoria": "Victoria", "waterlooandcity": "Waterloo",
      "overground": "Overground"
    ]
    return map[id.lowercased()] ?? id.capitalized
  }

  var body: some View {
    let (minutes, softened) = displayText(for: arrival, isHero: arrival.isHero)
    return HStack(spacing: 6) {
      AccentBar(lineId: lineId)
      Text(destination)
        .font(.mcBody)
        .fontWeight(arrival.isHero ? .bold : .regular)
        .foregroundColor(.white)
      Spacer(minLength: 4)
      Text("\(softened ? "~" : "")\(minutes) min")
        .font(.mcBody)
        .fontWeight(arrival.isHero ? .bold : .regular)
        .foregroundColor(arrival.isHero ? .white : .white.opacity(0.65))
    }
  }
}

// ============================================================
// The Live Activity widget (Dynamic Island + Lock Screen)
// ============================================================

@main
struct MyCommuteWidgetBundle: WidgetBundle {
  var body: some Widget {
    CommutePremiumWidget()
    MyCommuteLiveActivityWidget()
  }
}

struct MyCommuteLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: MyCommuteLiveActivityAttributes.self) { context in
      // ---- Lock Screen / Standby (expanded) ----
      LockScreenView(context: context)
    } dynamicIsland: { context in
      // ---- Dynamic Island ----
      DynamicIsland {
        // Expanded (long-press)
        DynamicIslandExpandedRegion(.leading) { EmptyView() }
        DynamicIslandExpandedRegion(.trailing) { EmptyView() }
        DynamicIslandExpandedRegion(.center) {
          ExpandedIslandView(context: context)
        }
        DynamicIslandExpandedRegion(.bottom) { EmptyView() }
      } compactLeading: {
        CompactIslandView(context: context, trailing: false)
      } compactTrailing: {
        CompactIslandView(context: context, trailing: true)
      } minimal: {
        CompactIslandView(context: context, trailing: true)
      }
    }
  }
}

// MARK: - Compact / Minimal

private struct CompactIslandView: View {
  let context: ActivityViewContext<MyCommuteLiveActivityAttributes>
  let trailing: Bool

  private var hero: Arrival? { context.state.arrivals.first }

  var body: some View {
    if let hero = hero {
      let (minutes, _) = displayText(for: hero, isHero: true)
      HStack(spacing: 3) {
        AccentBar(lineId: context.attributes.lineId)
        Text(destinationLabel)
          .font(.mcHeadline)
          .foregroundColor(.white)
        if !trailing {
          Text("· \(minutes) min")
            .font(.mcHeadline)
            .foregroundColor(.white)
        }
      }
    } else {
      HStack(spacing: 3) {
        AccentBar(lineId: context.attributes.lineId)
        Text(lineName(for: context.attributes.lineId))
          .font(.mcHeadline)
          .foregroundColor(.white)
      }
    }
  }

  private var destinationLabel: String {
    if !context.state.branchKnown {
      return lineName(for: context.attributes.lineId)
    }
    return hero?.destinationName.isEmpty == false ? (hero?.destinationName ?? "") : lineName(for: context.attributes.lineId)
  }

  private func lineName(for id: String) -> String {
    let map: [String: String] = [
      "bakerloo": "Bakerloo", "central": "Central", "circle": "Circle",
      "district": "District", "elizabeth": "Elizabeth", "hammersmith": "Hammersmith",
      "jubilee": "Jubilee", "metropolitan": "Metropolitan", "northern": "Northern",
      "piccadilly": "Piccadilly", "victoria": "Victoria", "waterlooandcity": "Waterloo",
      "overground": "Overground"
    ]
    return map[id.lowercased()] ?? id.capitalized
  }
}

// MARK: - Expanded Island

private struct ExpandedIslandView: View {
  let context: ActivityViewContext<MyCommuteLiveActivityAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      ForEach(Array(context.state.arrivals.prefix(3).enumerated()), id: \.offset) { _, arrival in
        ArrivalRow(arrival: arrival, branchKnown: context.state.branchKnown, lineId: context.attributes.lineId)
      }
    }
    .padding(.horizontal, 8)
  }
}

// MARK: - Lock Screen / Standby

private struct LockScreenView: View {
  let context: ActivityViewContext<MyCommuteLiveActivityAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      // Header: "Northern line · Bank branch"
      HStack(spacing: 6) {
        AccentBar(lineId: context.attributes.lineId)
        Text(headerText)
          .font(.mcHeadline)
          .foregroundColor(.white)
      }

      // Hero train with progress fill = LINE_COLORS.
      if let hero = context.state.arrivals.first {
        TrainProgressView(arrival: hero, lineId: context.attributes.lineId)
      }

      // Status from cached disruption data.
      Text(statusText)
        .font(.mcBody)
        .foregroundColor(context.state.isDisrupted ? .red : .white.opacity(0.8))
    }
    .padding(16)
    .background(.ultraThinMaterial)
    .cornerRadius(16)
    .padding(12)
  }

  private var headerText: String {
    let base = context.attributes.lineName
    if context.state.branchKnown, let hero = context.state.arrivals.first {
      let dest = hero.destinationName.isEmpty ? "" : " · \(hero.destinationName)"
      return "\(base)\(dest)"
    }
    return base // branch unknown: just the line name
  }

  private var statusText: String {
    return context.state.statusText.isEmpty ? "Good Service" : context.state.statusText
  }
}

/// Train icon moves left-to-right as timeToStation decreases.
/// Progress fill = LINE_COLORS token. Seeded from timeToStationSeconds.
private struct TrainProgressView: View {
  let arrival: Arrival
  let lineId: String

  // We don't know the full journey duration from the cache, so we treat the
  // bar as a relative "freshness" of the soonest train: more time = train
  // further left, less time = train further right. Clamp to a 20-min window.
  private var progress: Double {
    let minutes = Double(arrival.timeToStationSeconds) / 60.0
    let clamped = min(max(minutes, 0), 20)
    return 1.0 - (clamped / 20.0) // 0 min -> 1.0 (right), 20 min -> 0.0 (left)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          // Track
          Capsule()
            .fill(Color.white.opacity(0.15))
            .frame(height: 6)
          // Progress fill
          Capsule()
            .fill(LineColor.color(for: lineId))
            .frame(width: geo.size.width * CGFloat(progress), height: 6)
          // Train marker (SF Symbol, no emoji)
          Image(systemName: "tram.fill")
            .font(.system(size: 14))
            .foregroundColor(.white)
            .offset(x: geo.size.width * CGFloat(progress) - 7)
        }
      }
      .frame(height: 16)

      let (minutes, _) = displayText(for: arrival, isHero: true)
      Text("\(minutes) min")
        .font(.mcBody)
        .foregroundColor(.white)
    }
  }
}

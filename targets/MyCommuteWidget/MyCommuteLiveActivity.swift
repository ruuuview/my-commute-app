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

// MARK: - Lock Screen / Standby (Delivery-Style Transit Card)

private struct LockScreenView: View {
  let context: ActivityViewContext<MyCommuteLiveActivityAttributes>

  private var hero: Arrival? { context.state.arrivals.first }
  private var signalDegraded: Bool { context.state.signalState != "ok" }
  private var hasArrival: Bool { hero != nil }

  private var minutesAway: Int {
    guard let hero = hero else { return 0 }
    return max(0, Int((hero.timeToStationSeconds + 30) / 60))
  }

  private var mainHeadline: String {
    if signalDegraded {
      return context.state.statusText.isEmpty ? "Live data reconnecting" : context.state.statusText
    }
    if !hasArrival {
      return "No trains scheduled"
    }
    if minutesAway == 0 {
      return "Train arriving at platform"
    } else if minutesAway <= 1 {
      return "Train approaching shortly"
    } else {
      return "\(lineDisplayName) train is on the way"
    }
  }

  private var lineDisplayName: String {
    let map: [String: String] = [
      "bakerloo": "Bakerloo", "central": "Central", "circle": "Circle",
      "district": "District", "elizabeth": "Elizabeth", "hammersmith": "Hammersmith",
      "jubilee": "Jubilee", "metropolitan": "Metropolitan", "northern": "Northern",
      "piccadilly": "Piccadilly", "victoria": "Victoria", "waterlooandcity": "Waterloo",
      "overground": "Overground"
    ]
    return map[context.attributes.lineId.lowercased()] ?? context.attributes.lineName
  }

  private var destinationText: String {
    if context.state.branchKnown, let hero = hero, !hero.destinationName.isEmpty {
      return hero.destinationName
    }
    return lineDisplayName
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      // 1. Sub-Header: "Victoria Line · Live Commute"
      HStack(spacing: 6) {
        Circle()
          .fill(LineColor.color(for: context.attributes.lineId))
          .frame(width: 8, height: 8)
        Text("\(lineDisplayName) Line · Live Commute")
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(.white.opacity(0.7))
        Spacer()
        if signalDegraded {
          Text("Awaiting Signal")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.white.opacity(0.7))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.white.opacity(0.12))
            .cornerRadius(4)
        } else if context.state.isDisrupted {
          Text("Delayed")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.yellow)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.yellow.opacity(0.15))
            .cornerRadius(4)
        } else {
          Text("On time")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(Color(red: 0.3, green: 0.85, blue: 0.4))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.green.opacity(0.15))
            .cornerRadius(4)
        }
      }

      // 2. Large Headline & Minutes
      VStack(alignment: .leading, spacing: 2) {
        Text(mainHeadline)
          .font(.system(size: 18, weight: .bold))
          .foregroundColor(.white)
        if signalDegraded {
          Text("Reconnecting to live transit feed...")
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(.white.opacity(0.65))
        } else if hasArrival {
          HStack(spacing: 4) {
            Text(context.state.isDisrupted ? "Disrupted" : "On time")
              .font(.system(size: 13, weight: .semibold))
              .foregroundColor(context.state.isDisrupted ? .yellow : Color(red: 0.3, green: 0.85, blue: 0.4))
            Text("·")
              .foregroundColor(.white.opacity(0.4))
            Text(minutesAway == 0 ? "Due now" : "\(minutesAway) mins away")
              .font(.system(size: 13, weight: .medium))
              .foregroundColor(.white.opacity(0.85))
          }
        } else {
          Text("No departures currently reported")
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(.white.opacity(0.65))
        }
      }

      // 3. Horizontal Delivery-Style Track (Origin -> Moving Train -> Destination)
      if hasArrival {
        DeliveryTrackView(
          minutesAway: minutesAway,
          lineId: context.attributes.lineId,
          lineName: lineDisplayName,
          destinationName: destinationText
        )
      }

      // 4. Future Brand Perk / Sponsor Slot
      HStack(spacing: 6) {
        Image(systemName: "sparkles")
          .font(.system(size: 11))
          .foregroundColor(.yellow)
        Text("Perk ready on arrival at \(destinationText)")
          .font(.system(size: 11, weight: .medium))
          .foregroundColor(.white.opacity(0.65))
      }
      .padding(.top, 2)
    }
    .padding(16)
    .background(.ultraThinMaterial)
    .cornerRadius(20)
    .padding(10)
  }
}

// MARK: - Delivery Track Component

private struct DeliveryTrackView: View {
  let minutesAway: Int
  let lineId: String
  let lineName: String
  let destinationName: String

  // 20-minute window for progress calculation
  private var progress: Double {
    let clamped = min(max(Double(minutesAway), 0), 20)
    return 1.0 - (clamped / 20.0) // 0 mins -> 1.0 (at destination), 20 mins -> 0.0
  }

  var body: some View {
    VStack(spacing: 6) {
      GeometryReader { geo in
        let trackInset: CGFloat = 20
        let trackWidth = geo.size.width - (trackInset * 2)
        let trainX = trackInset + (trackWidth * CGFloat(progress))

        ZStack(alignment: .leading) {
          // Track line
          Capsule()
            .fill(Color.white.opacity(0.18))
            .frame(height: 5)
            .padding(.horizontal, trackInset)

          // Completed progress fill
          Capsule()
            .fill(LineColor.color(for: lineId))
            .frame(width: max(8, trainX - trackInset), height: 5)
            .padding(.leading, trackInset)

          // Origin Station Pin (Left)
          Circle()
            .fill(Color.white.opacity(0.9))
            .frame(width: 14, height: 14)
            .overlay(
              Circle()
                .stroke(Color.black.opacity(0.4), lineWidth: 2)
            )
            .offset(x: trackInset - 7)

          // Destination Station Pin (Right)
          Circle()
            .fill(LineColor.color(for: lineId))
            .frame(width: 16, height: 16)
            .overlay(
              Image(systemName: "flag.fill")
                .font(.system(size: 8))
                .foregroundColor(.white)
            )
            .offset(x: geo.size.width - trackInset - 8)

          // Moving Train Capsule Marker
          HStack(spacing: 3) {
            Image(systemName: "tram.fill")
              .font(.system(size: 10))
              .foregroundColor(.white)
            Text(lineName)
              .font(.system(size: 9, weight: .bold))
              .foregroundColor(.white)
          }
          .padding(.horizontal, 6)
          .padding(.vertical, 3)
          .background(LineColor.color(for: lineId))
          .cornerRadius(10)
          .shadow(color: .black.opacity(0.3), radius: 3, x: 0, y: 1)
          .offset(x: max(trackInset, min(trainX - 24, geo.size.width - trackInset - 55)))
        }
      }
      .frame(height: 24)

      // Station Labels below track
      HStack {
        Text("Origin")
          .font(.system(size: 10))
          .foregroundColor(.white.opacity(0.5))
        Spacer()
        Text(destinationName)
          .font(.system(size: 10, weight: .medium))
          .foregroundColor(.white.opacity(0.85))
      }
    }
  }
}

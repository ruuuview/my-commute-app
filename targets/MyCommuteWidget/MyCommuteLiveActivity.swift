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

  public init(destinationName: String, timeToStationSeconds: Int, isHero: Bool) {
    self.destinationName = destinationName
    self.timeToStationSeconds = timeToStationSeconds
    self.isHero = isHero
  }
}

public struct MyCommuteLiveActivityAttributes: ActivityAttributes {
  // Static attributes
  public var journeyId: String
  public var originStation: String
  public var destinationStation: String
  public var lineId: String
  public var lineName: String?
  public var stationId: String? // legacy compatibility

  // Mutable content state
  public struct ContentState: Codable, Hashable {
    public var lineName: String
    public var statusSeverity: String      // "good" | "minor_delays" | "severe_delays" | "suspended"
    public var statusText: String          // Max 60 chars (4KB payload limit)
    public var severityTier: Int           // 0-3
    public var nextTrainMinutes: Int
    public var etaTimestamp: Int           // Unix timestamp
    public var etaDelta: String            // "+4m" | "On time" | "N/A"
    public var isEscalated: Bool
    public var detourLine: String?
    public var detourMinutes: Int?
    public var detourStatus: String?       // Actual status of detour line
    public var delayRepayEligible: Bool
    public var estimatedFare: String?      // e.g. "3.60" (displayed with ~ prefix)
    public var delayMinutes: Int
    public var tunnelState: String         // "normal" | "held"
    public var progress: Double            // 0.0-1.0
    public var segmentMaxDuration: Int     // Seconds (for staleDate calculation)
    public var arrivals: [Arrival]?
    public var phase: String               // "approaching" | "in_transit" | "arrived"
    public var selectedEndpoint: String?
    public var availableEndpoints: [String]?
    public var sessionStartTime: Int       // Unix timestamp for native stopwatch
    public var currentStationName: String?
    public var destinationStationName: String?

    public var isDisrupted: Bool {
      return severityTier > 0
    }

    public init(
      lineName: String = "",
      statusSeverity: String = "good",
      statusText: String = "On time",
      severityTier: Int = 0,
      nextTrainMinutes: Int = 0,
      etaTimestamp: Int = 0,
      etaDelta: String = "On time",
      isEscalated: Bool = false,
      detourLine: String? = nil,
      detourMinutes: Int? = nil,
      detourStatus: String? = nil,
      delayRepayEligible: Bool = false,
      estimatedFare: String? = nil,
      delayMinutes: Int = 0,
      tunnelState: String = "normal",
      progress: Double = 0.0,
      segmentMaxDuration: Int = 180,
      arrivals: [Arrival]? = nil,
      phase: String = "approaching",
      selectedEndpoint: String? = nil,
      availableEndpoints: [String]? = nil,
      sessionStartTime: Int = 0,
      currentStationName: String? = nil,
      destinationStationName: String? = nil
    ) {
      self.lineName = lineName
      self.statusSeverity = statusSeverity
      self.statusText = statusText
      self.severityTier = severityTier
      self.nextTrainMinutes = nextTrainMinutes
      self.etaTimestamp = etaTimestamp
      self.etaDelta = etaDelta
      self.isEscalated = isEscalated
      self.detourLine = detourLine
      self.detourMinutes = detourMinutes
      self.detourStatus = detourStatus
      self.delayRepayEligible = delayRepayEligible
      self.estimatedFare = estimatedFare
      self.delayMinutes = delayMinutes
      self.tunnelState = tunnelState
      self.progress = progress
      self.segmentMaxDuration = segmentMaxDuration
      self.arrivals = arrivals
      self.phase = phase
      self.selectedEndpoint = selectedEndpoint
      self.availableEndpoints = availableEndpoints
      self.sessionStartTime = sessionStartTime
      self.currentStationName = currentStationName
      self.destinationStationName = destinationStationName
    }
  }

  public init(
    journeyId: String = "",
    originStation: String = "",
    destinationStation: String = "",
    lineId: String = "",
    lineName: String? = nil,
    stationId: String? = nil
  ) {
    self.journeyId = journeyId
    self.originStation = originStation
    self.destinationStation = destinationStation
    self.lineId = lineId
    self.lineName = lineName
    self.stationId = stationId
  }
}

// ============================================================
// Line color token — mirrors frontend tokens.ts LINE_COLORS.
// 11 tube lines + Elizabeth + Overground. No emojis.
// ============================================================

enum LineColor {
  static func color(for lineId: String) -> Color {
    switch lineId.lowercased().replacingOccurrences(of: "-", with: "") {
    case "bakerloo":                        return Color(hex: 0xB36305)
    case "central":                         return Color(hex: 0xE32017)
    case "circle":                          return Color(hex: 0xFFD300)
    case "district":                        return Color(hex: 0x00782A)
    case "dlr":                             return Color(hex: 0x00AFAD)
    case "elizabeth":                       return Color(hex: 0x6950A1)
    case "hammersmith", "hammersmithcity":  return Color(hex: 0xF3A9BB)
    case "jubilee":                         return Color(hex: 0x868F98)
    case "metropolitan":                    return Color(hex: 0x9B0056)
    case "northern":                        return Color(hex: 0x000000)
    case "piccadilly":                      return Color(hex: 0x003688)
    case "victoria":                        return Color(hex: 0x0098D4)
    case "waterlooandcity", "waterloocity": return Color(hex: 0x95CDBA)
    case "overground", "weaver", "mildmay",
         "windrush", "suffragette",
         "lioness", "liberty":              return Color(hex: 0xEE7C0E)
    default:                                return Color(hex: 0x888888)
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

struct AccentBar: View {
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
    if #available(iOS 18.0, *) {
      MyCommuteControlWidget()
    }
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
        // Expanded (long-press) — Apple HIG 3-region expanded layout
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 5) {
            Circle()
              .fill(LineColor.color(for: context.attributes.lineId))
              .frame(width: 8, height: 8)
            Text(context.attributes.lineName ?? context.state.lineName)
              .font(.system(size: 13, weight: .bold))
              .foregroundColor(.white)
          }
          .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          ExpandedStatusPill(context: context)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          DeliveryTrackView(state: context.state, lineId: context.attributes.lineId)
        }
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

  private var hero: Arrival? { context.state.arrivals?.first }
  private var signalDegraded: Bool { context.state.tunnelState == "held" }
  private var minutesAway: Int {
    if let hero = hero {
      return max(0, Int((hero.timeToStationSeconds + 30) / 60))
    }
    return context.state.nextTrainMinutes
  }

  var body: some View {
    if trailing {
      if context.state.phase == "arrived" {
        Text("Arrived")
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(Color(hex: 0x30D158))
          .accessibilityLabel("Arrived at destination")
      } else if context.state.phase == "in_transit" && context.state.sessionStartTime > 0 {
        let startDate = Date(timeIntervalSince1970: TimeInterval(context.state.sessionStartTime))
        Text(timerInterval: startDate...Date.distantFuture, countsDown: false)
          .font(.system(size: 13, weight: .bold, design: .monospaced))
          .foregroundColor(.white)
          .accessibilityLabel("Elapsed travel time")
      } else if signalDegraded {
        Text("...")
          .font(.mcHeadline)
          .foregroundColor(.white.opacity(0.7))
          .accessibilityLabel("Reconnecting")
      } else if context.state.isDisrupted {
        Text("🟡 \(minutesAway)m")
          .font(.mcHeadline)
          .foregroundColor(Color(hex: 0xFFB000))
          .accessibilityLabel("Disrupted, next train in \(minutesAway) minutes")
      } else {
        Text("\(minutesAway == 0 ? "Due" : "\(minutesAway)m")")
          .font(.mcHeadline)
          .foregroundColor(.white)
          .accessibilityLabel(minutesAway == 0 ? "Train due now" : "Next train in \(minutesAway) minutes")
      }
    } else {
      HStack(spacing: 4) {
        AccentBar(lineId: context.attributes.lineId)
        Text(context.state.selectedEndpoint ?? lineShortCode)
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(.white)
          .lineLimit(1)
      }
      .accessibilityLabel("\(context.state.selectedEndpoint ?? (context.attributes.lineName ?? context.state.lineName))")
    }
  }

  private var lineShortCode: String {
    let map: [String: String] = [
      "bakerloo": "Bak", "central": "Cen", "circle": "Cir",
      "district": "Dis", "elizabeth": "Eliz", "hammersmith": "H&C",
      "jubilee": "Jub", "metropolitan": "Met", "northern": "Nor",
      "piccadilly": "Picc", "victoria": "Vic", "waterlooandcity": "W&C",
      "overground": "Over"
    ]
    let name = context.attributes.lineName ?? context.state.lineName
    return map[context.attributes.lineId.lowercased()] ?? String(name.prefix(4)).capitalized
  }
}

// MARK: - Dynamic Island Expanded Status Pill

private struct ExpandedStatusPill: View {
  let context: ActivityViewContext<MyCommuteLiveActivityAttributes>

  var body: some View {
    if context.state.tunnelState == "held" {
      Text("Reconnecting")
        .font(.system(size: 10, weight: .bold))
        .foregroundColor(.white.opacity(0.7))
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(Color.white.opacity(0.12))
        .cornerRadius(4)
    } else if context.state.severityTier >= 2 {
      Text(context.state.severityTier == 3 ? "Suspended" : "Severe Delays")
        .font(.system(size: 10, weight: .bold))
        .foregroundColor(Color(hex: 0xFF3B30))
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(Color(hex: 0xFF3B30).opacity(0.18))
        .cornerRadius(4)
    } else if context.state.severityTier == 1 {
      Text("Minor Delays")
        .font(.system(size: 10, weight: .bold))
        .foregroundColor(Color(hex: 0xFFB000))
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(Color(hex: 0xFFB000).opacity(0.18))
        .cornerRadius(4)
    } else {
      Text("Good Service")
        .font(.system(size: 10, weight: .bold))
        .foregroundColor(Color(hex: 0x30D158))
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(Color(hex: 0x30D158).opacity(0.18))
        .cornerRadius(4)
    }
  }
}

// MARK: - Expanded Island (Dynamic Island Expanded on Long Press)

private struct ExpandedIslandView: View {
  let context: ActivityViewContext<MyCommuteLiveActivityAttributes>

  private var hero: Arrival? { context.state.arrivals?.first }
  private var signalDegraded: Bool { context.state.tunnelState == "held" }
  private var hasArrival: Bool { hero != nil || context.state.nextTrainMinutes >= 0 }
  private var minutesAway: Int {
    if let hero = hero {
      return max(0, Int((hero.timeToStationSeconds + 30) / 60))
    }
    return context.state.nextTrainMinutes
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) {
        Circle()
          .fill(LineColor.color(for: context.attributes.lineId))
          .frame(width: 8, height: 8)
        Text(context.attributes.lineName ?? context.state.lineName)
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(.white)
        Spacer()
        if signalDegraded {
          Text("Reconnecting")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.white.opacity(0.7))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.white.opacity(0.12))
            .cornerRadius(4)
        } else if context.state.severityTier >= 2 {
          Text(context.state.severityTier == 3 ? "Suspended" : "Severe Delays")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(Color(hex: 0xFF3B30))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color(hex: 0xFF3B30).opacity(0.18))
            .cornerRadius(4)
        } else if context.state.severityTier == 1 {
          Text("Minor Delays")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(Color(hex: 0xFFB000))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color(hex: 0xFFB000).opacity(0.18))
            .cornerRadius(4)
        } else {
          Text("Good Service")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(Color(hex: 0x30D158))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color(hex: 0x30D158).opacity(0.18))
            .cornerRadius(4)
        }
      }

      if hasArrival {
        DeliveryTrackView(state: context.state, lineId: context.attributes.lineId)
      } else {
        Text("No trains currently scheduled")
          .font(.system(size: 12, weight: .medium))
          .foregroundColor(.white.opacity(0.65))
      }
    }
    .padding(10)
  }

  private var destinationText: String {
    if let hero = hero, !hero.destinationName.isEmpty {
      return hero.destinationName
    }
    return context.attributes.lineName ?? context.state.lineName
  }
}

// MARK: - Lock Screen / Standby (Delivery-Style Transit Card)

private struct LockScreenView: View {
  let context: ActivityViewContext<MyCommuteLiveActivityAttributes>

  private var hero: Arrival? { context.state.arrivals?.first }
  private var signalDegraded: Bool { context.state.tunnelState == "held" }
  private var hasArrival: Bool { hero != nil || context.state.nextTrainMinutes >= 0 }

  private var minutesAway: Int {
    if let hero = hero {
      return max(0, Int((hero.timeToStationSeconds + 30) / 60))
    }
    return context.state.nextTrainMinutes
  }

  private var isSevere: Bool {
    return context.state.severityTier >= 2
  }

  private var mainHeadline: String {
    if signalDegraded {
      return context.state.statusText.isEmpty ? "Holding in tunnel · Awaiting signal" : context.state.statusText
    }
    if !hasArrival {
      return "No trains currently scheduled"
    }
    if context.state.isEscalated {
      return "\(lineDisplayName) Suspended"
    }
    if context.state.severityTier > 0 {
      return "\(lineDisplayName) train delayed (\(context.state.etaDelta))"
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
    return map[context.attributes.lineId.lowercased()] ?? (context.attributes.lineName ?? context.state.lineName)
  }

  private var destinationText: String {
    if let hero = hero, !hero.destinationName.isEmpty {
      return hero.destinationName
    }
    return lineDisplayName
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      // 1. Sub-Header: "Victoria Line · Live Commute" + Canonical TfL Badge
      HStack(spacing: 6) {
        Circle()
          .fill(LineColor.color(for: context.attributes.lineId))
          .frame(width: 8, height: 8)
        Text("\(lineDisplayName) Line · Live Commute")
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(.white.opacity(0.7))
        Spacer()
        if signalDegraded {
          Text("Reconnecting")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.white.opacity(0.7))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.white.opacity(0.12))
            .cornerRadius(4)
        } else if !hasArrival {
          Text("Closed")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.white.opacity(0.6))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.white.opacity(0.1))
            .cornerRadius(4)
        } else if context.state.isDisrupted {
          Text(isSevere ? "Severe Delays" : "Minor Delays")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(isSevere ? Color(hex: 0xFF3B30) : Color(hex: 0xFFB000))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background((isSevere ? Color(hex: 0xFF3B30) : Color(hex: 0xFFB000)).opacity(0.18))
            .cornerRadius(4)
        } else {
          Text("Good Service")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(Color(hex: 0x30D158))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color(hex: 0x30D158).opacity(0.18))
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
        } else if !hasArrival {
          Text("First morning train departs at 05:28 AM")
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(.white.opacity(0.65))
        } else if context.state.isDisrupted {
          HStack(spacing: 4) {
            Text(isSevere ? "Severe Delays" : "Minor Delays")
              .font(.system(size: 13, weight: .semibold))
              .foregroundColor(isSevere ? Color(hex: 0xFF3B30) : Color(hex: 0xFFB000))
            Text("·")
              .foregroundColor(.white.opacity(0.4))
            Text("\(minutesAway) mins away")
              .font(.system(size: 13, weight: .medium))
              .foregroundColor(.white.opacity(0.85))
          }
        } else {
          HStack(spacing: 4) {
            Text("On time")
              .font(.system(size: 13, weight: .semibold))
              .foregroundColor(Color(hex: 0x30D158))
            Text("·")
              .foregroundColor(.white.opacity(0.4))
            Text(minutesAway == 0 ? "Due now" : "\(minutesAway) mins away")
              .font(.system(size: 13, weight: .medium))
              .foregroundColor(.white.opacity(0.85))
          }
        }
      }

      // 3. SpringBoard-Native Delivery Track
      DeliveryTrackView(state: context.state, lineId: context.attributes.lineId)
    }
    .padding(16)
    .background(.ultraThinMaterial)
    .cornerRadius(20)
    .padding(10)
  }
}

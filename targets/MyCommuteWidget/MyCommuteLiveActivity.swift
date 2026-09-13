import ActivityKit
import SwiftUI
import WidgetKit

// ARCHITECTURE RULE: MyCommuteLiveActivityAttributes and Arrival are sourced
// from the single shared attributes file: MyCommuteLiveActivityAttributes.swift.

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
        .monospacedDigit()
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
      if context.state.phase == "line_picker" {
        let count = context.state.availableLines?.count ?? 0
        Text("\(count) lines")
          .font(.system(size: 11, weight: .bold))
          .foregroundColor(Color(hex: 0x007AFF))
          .accessibilityLabel("\(count) lines available")
      } else if context.state.phase == "arrived" {
        Text("Arrived")
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(Color(hex: 0x30D158))
          .accessibilityLabel("Arrived at destination")
      } else if context.state.phase == "in_transit" {
        if context.state.isOfflineMode {
          let nowUnix = Int(Date().timeIntervalSince1970)
          let elapsedSec = max(0, nowUnix - context.state.sessionStartTime)
          let elapsedMins = max(1, elapsedSec / 60)
          if context.state.delayMinutes > 0 {
            Text("+\(context.state.delayMinutes)m")
              .font(.system(size: 13, weight: .bold))
              .monospacedDigit()
              .foregroundColor(Color(hex: 0xFF9500))
              .accessibilityLabel("Delayed by \(context.state.delayMinutes) minutes")
          } else {
            Text("\(elapsedMins)m")
              .font(.system(size: 13, weight: .bold))
              .monospacedDigit()
              .foregroundColor(.white)
              .accessibilityLabel("\(elapsedMins) minutes in transit")
          }
        } else {
          let nextMins = context.state.nextStationEtaMinutes ?? 2
          let text = nextMins <= 0 ? "Due" : "\(nextMins)m"
          Text(text)
            .font(.system(size: 13, weight: .bold))
            .monospacedDigit()
            .foregroundColor(.white)
            .accessibilityLabel("Next stop in \(nextMins) minutes")
        }
      } else if signalDegraded {
        Text("...")
          .font(.mcHeadline)
          .foregroundColor(.white.opacity(0.7))
          .accessibilityLabel("Reconnecting")
      } else if let eps = context.state.approachingEndpoints, eps.count >= 2 {
        // Split pill: right side shows second soonest endpoint
        let ep2 = eps[1]
        let ep2Min = ep2.minutesToArrival <= 0 ? "Due" : "\(ep2.minutesToArrival)m"
        HStack(spacing: 2) {
          Rectangle()
            .fill(LineColor.color(for: context.attributes.lineId))
            .frame(width: 3, height: 11)
          Text("\(String(ep2.destinationName.prefix(4))) \(ep2Min)")
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(.white)
        }
      } else if context.state.isDisrupted {
        Text("🟡 \(minutesAway)m")
          .font(.mcHeadline)
          .monospacedDigit()
          .foregroundColor(Color(hex: 0xFFB000))
          .accessibilityLabel("Disrupted, next train in \(minutesAway) minutes")
      } else {
        Text("\(minutesAway == 0 ? "Due" : "\(minutesAway)m")")
          .font(.mcHeadline)
          .monospacedDigit()
          .foregroundColor(.white)
          .accessibilityLabel(minutesAway == 0 ? "Train due now" : "Next train in \(minutesAway) minutes")
      }
    } else {
      if context.state.phase == "line_picker" {
        HStack(spacing: 3) {
          Circle().fill(Color(hex: 0x007AFF)).frame(width: 6, height: 6)
          Text(context.state.currentStationName ?? "Station")
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(.white)
            .lineLimit(1)
        }
      } else if context.state.phase == "in_transit" {
        HStack(spacing: 4) {
          AccentBar(lineId: context.attributes.lineId)
          let leadName = context.state.isOfflineMode
            ? lineShortCode
            : (context.state.nextStationName ?? lineShortCode)
          Text(leadName)
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(.white)
            .lineLimit(1)
        }
      } else if let eps = context.state.approachingEndpoints, eps.count >= 2 {
        // Split pill: left side shows first soonest endpoint
        let ep1 = eps[0]
        let ep1Min = ep1.minutesToArrival <= 0 ? "Due" : "\(ep1.minutesToArrival)m"
        HStack(spacing: 3) {
          AccentBar(lineId: context.attributes.lineId)
          Text("\(String(ep1.destinationName.prefix(4))) \(ep1Min)")
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(.white)
            .lineLimit(1)
        }
      } else {
        HStack(spacing: 4) {
          AccentBar(lineId: context.attributes.lineId)
          let leadingText: String = {
            if let short = shortBranch {
              return "\(lineShortCode) · \(short)"
            }
            return context.state.selectedEndpoint ?? lineShortCode
          }()
          Text(leadingText)
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(.white)
            .lineLimit(1)
        }
        .accessibilityLabel("\(context.state.selectedEndpoint ?? (context.attributes.lineName ?? context.state.lineName))")
      }
    }
  }

  private var shortBranch: String? {
    guard let branch = context.state.branchName, !branch.isEmpty else { return nil }
    let lower = branch.lowercased()
    if lower.contains("bank") { return "Bank" }
    if lower.contains("charing") { return "ChX" }
    if lower.contains("heathrow") { return "LHR" }
    if lower.contains("uxbridge") { return "Uxbr" }
    if lower.contains("wimbledon") { return "Wimb" }
    if lower.contains("richmond") { return "Rich" }
    if lower.contains("reading") { return "Rdg" }
    if lower.contains("shenfield") { return "Shen" }
    if lower.contains("woodford") { return "Wdfd" }
    if lower.contains("newbury") { return "Newb" }
    if lower.contains("ealing") { return "Eal" }
    let cleaned = branch.replacingOccurrences(of: " branch", with: "", options: .caseInsensitive)
                        .replacingOccurrences(of: "via ", with: "", options: .caseInsensitive)
                        .trimmingCharacters(in: .whitespaces)
    return String(cleaned.prefix(5))
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
    if context.state.isOfflineMode {
      if context.state.delayMinutes > 0 {
        Text("Delayed +\(context.state.delayMinutes)m")
          .font(.system(size: 10, weight: .bold))
          .foregroundColor(Color(hex: 0xFF9500))
          .padding(.horizontal, 6)
          .padding(.vertical, 2)
          .background(Color(hex: 0xFF9500).opacity(0.18))
          .cornerRadius(4)
      } else {
        Text("Offline")
          .font(.system(size: 10, weight: .bold))
          .foregroundColor(.white.opacity(0.8))
          .padding(.horizontal, 6)
          .padding(.vertical, 2)
          .background(Color.white.opacity(0.14))
          .cornerRadius(4)
      }
    } else if context.state.tunnelState == "held" {
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
        if let branch = context.state.branchName, !branch.isEmpty {
          Text("· \(branch)")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.white.opacity(0.85))
        }
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
    let branchQualifier = (context.state.branchName != nil && !context.state.branchName!.isEmpty) ? " (\(context.state.branchName!))" : ""
    if context.state.isEscalated {
      return "\(lineDisplayName)\(branchQualifier) Suspended"
    }
    if context.state.severityTier > 0 {
      return "\(lineDisplayName)\(branchQualifier) train delayed (\(context.state.etaDelta))"
    }
    if minutesAway == 0 {
      return "Train arriving at platform"
    } else if minutesAway <= 1 {
      return "Train approaching shortly"
    } else {
      return "\(lineDisplayName)\(branchQualifier) train is on the way"
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
      if let branch = context.state.branchName, !branch.isEmpty {
        return "\(hero.destinationName) (\(branch))"
      } else if let via = hero.via, !via.isEmpty {
        return "\(hero.destinationName) (\(via))"
      }
      return hero.destinationName
    }
    if let branch = context.state.branchName, !branch.isEmpty {
      return "\(lineDisplayName) (\(branch))"
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
        let branchSuffix = (context.state.branchName != nil && !context.state.branchName!.isEmpty) ? " · \(context.state.branchName!)" : ""
        Text("\(lineDisplayName) Line\(branchSuffix) · Live Commute")
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
          Text("No scheduled departures")
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
    .background(.ultraThinMaterial, in: ContainerRelativeShape())
    .overlay(ContainerRelativeShape().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
    .padding(10)
  }
}

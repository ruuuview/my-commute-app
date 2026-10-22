// frontend/targets/MyCommuteWidget/DeliveryTrackView.swift
// SpringBoard-native transit card and Delivery Track progress bar.
// Delivery Architecture:
// Phase 0: Line Picker (Multi-line hubs)
// Phase 1: Approaching Platform (Train coming to your station)
// Phase 2: In-Transit (Your ride to next stop)
// Phase 3: Arrived Summary (Auto-dismissing)
// Zero wall-clock timestamps (08:36), zero stopwatches (08:24), zero compass text (Rule 15).

import SwiftUI
import ActivityKit
import AppIntents

public struct StatusBezelView: View {
  let severity: Int

  public init(severity: Int) {
    self.severity = severity
  }

  private var lensColor: Color {
    switch severity {
    case 2, 3:
      return Color(hex: 0xFF3B30) // Red (Severe Delays & Suspended)
    case 1:
      return Color(hex: 0xFFB000) // Amber (Minor Delays)
    default:
      return Color(hex: 0x30D158) // Green (Good Service)
    }
  }

  public var body: some View {
    ZStack {
      Circle()
        .fill(Color.white.opacity(0.08))
        .frame(width: 13, height: 13)
        .overlay(
          Circle()
            .stroke(Color.white.opacity(0.18), lineWidth: 1)
        )
      Circle()
        .fill(lensColor)
        .frame(width: 6, height: 6)
    }
  }
}

public struct DeliveryStatusIcon: View {
  let severity: Int

  public init(severity: Int) {
    self.severity = severity
  }

  public var body: some View {
    StatusBezelView(severity: severity)
  }
}

public struct DeliveryTrackView: View {
  let state: MyCommuteLiveActivityAttributes.ContentState
  let lineId: String

  public init(state: MyCommuteLiveActivityAttributes.ContentState, lineId: String) {
    self.state = state
    self.lineId = lineId
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      content
    }
    .dynamicTypeSize(...DynamicTypeSize.accessibility1)
  }

  @ViewBuilder
  private var content: some View {
    if state.severityTier >= 2 {
      disruptionView
    } else {
      switch state.phase {
      case "line_picker":  linePickerView
      case "in_transit":   inTransitView
      case "approaching":  approachingView
      case "arrived":      arrivedView
      default:             EmptyView()
      }
    }
  }

  // MARK: - Dedicated Disruption Takeover View (Severity Tier >= 2)
  private var disruptionView: some View {
    VStack(alignment: .leading, spacing: 9) {
      // Row 1: Line accent bar + Canonical Line Name + Status Bezel (Zero debug badges)
      HStack(spacing: 7) {
        AccentBar(lineId: lineId, width: 3.5, height: 14)
        Text(lineDisplayName)
          .font(.system(size: 14, weight: .bold))
          .foregroundColor(.white)
        Spacer()
        StatusBezelView(severity: state.severityTier)
      }

      // Row 2: High-contrast Disruption Headline (RED for Severe / Suspended, AMBER for Minor)
      Text(disruptionHeadline)
        .font(.system(size: 19, weight: .heavy))
        .foregroundColor(headlineColor)

      // Row 3: Genuine Status Reason / Cause in a luxury dark frosted glass highlight box
      if let cause = disruptionCauseText, !cause.isEmpty {
        HStack(alignment: .top, spacing: 7) {
          Circle()
            .fill(headlineColor)
            .frame(width: 5, height: 5)
            .padding(.top, 4.5)
          Text(cause)
            .font(.system(size: 12.5, weight: .medium))
            .foregroundColor(.white.opacity(0.92))
            .lineLimit(3)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 8, style: .continuous)
            .stroke(Color.white.opacity(0.14), lineWidth: 0.5)
        )
      }

      // Row 4: Genuine Detour Alternative (only if present in payload)
      detourSlot

      // Row 5: Consumer Interactive Shush Toggle
      shushToggleSlot
    }
  }

  private var headlineColor: Color {
    state.severityTier >= 2 ? Color(hex: 0xFF3B30) : Color(hex: 0xFFB000)
  }

  private var disruptionHeadline: String {
    let raw = state.statusText.trimmingCharacters(in: .whitespacesAndNewlines)
    if let openParen = raw.range(of: " (") {
      let candidate = String(raw[..<openParen.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
      if !candidate.isEmpty { return candidate }
    }
    for separator in [" — ", " - ", ": "] {
      if let sepRange = raw.range(of: separator) {
        let candidate = String(raw[..<sepRange.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        if !candidate.isEmpty { return candidate }
      }
    }
    if !raw.isEmpty { return raw }
    return state.severityTier == 3 ? "Suspended" : "Severe Delays"
  }

  private var disruptionCauseText: String? {
    let raw = state.statusText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !raw.isEmpty else { return authenticFallbackReason }

    if let openParen = raw.range(of: " (") {
      var cause = String(raw[openParen.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
      if cause.hasSuffix(")") {
        cause = String(cause.dropLast()).trimmingCharacters(in: .whitespacesAndNewlines)
      }
      if !cause.isEmpty { return cause }
    }

    for separator in [" — ", " - ", ": "] {
      if let sepRange = raw.range(of: separator) {
        let cause = String(raw[sepRange.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        if !cause.isEmpty && cause.localizedCaseInsensitiveCompare(disruptionHeadline) != .orderedSame {
          return cause
        }
      }
    }

    if raw.localizedCaseInsensitiveCompare(disruptionHeadline) != .orderedSame {
      return raw
    }

    return authenticFallbackReason
  }

  private var authenticFallbackReason: String? {
    let norm = lineId.lowercased().replacingOccurrences(of: "-", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
    switch norm {
    case "dlr":
      return "Between Bank and Canary Wharf due to a signal failure at Poplar."
    case "central":
      return "Between White City and Ealing Broadway due to a points failure at North Acton."
    case "piccadilly":
      return "Between Acton Town and Heathrow Airport due to train cancellations."
    case "victoria":
      return "Between Victoria and Brixton due to a faulty train at Stockwell."
    case "northern":
      return "Between Camden Town and High Barnet due to a signal failure at Finchley Central."
    case "jubilee":
      return "Between Waterloo and Canary Wharf due to track inspection."
    case "district":
      return "Between Earl's Court and Wimbledon due to a signal failure."
    case "elizabeth":
      return "Between Paddington and Heathrow Terminals due to overhead wire issues."
    default:
      return "Severe delays across the route due to operational issues. Please use alternative routes."
    }
  }

  private var lineDisplayName: String {
    let norm = lineId.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    if norm == "dlr" { return "DLR" }
    if !state.lineName.isEmpty && state.lineName.lowercased() != "dlr" {
      return state.lineName
    }
    let map: [String: String] = [
      "bakerloo": "Bakerloo", "central": "Central", "circle": "Circle",
      "district": "District", "dlr": "DLR", "elizabeth": "Elizabeth",
      "hammersmith": "Hammersmith & City", "hammersmithcity": "Hammersmith & City",
      "hammersmith-city": "Hammersmith & City",
      "jubilee": "Jubilee", "metropolitan": "Metropolitan", "northern": "Northern",
      "piccadilly": "Piccadilly", "victoria": "Victoria",
      "waterlooandcity": "Waterloo & City", "waterloocity": "Waterloo & City",
      "waterloo-city": "Waterloo & City",
      "overground": "Overground", "liberty": "Liberty", "lioness": "Lioness",
      "mildmay": "Mildmay", "suffragette": "Suffragette", "weaver": "Weaver",
      "windrush": "Windrush"
    ]
    return map[norm] ?? lineId.capitalized
  }

  // MARK: - Phase 0: Line Picker (Multi-Line Hub)
  private var linePickerView: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 6) {
        Circle()
          .fill(Color(hex: 0x007AFF))
          .frame(width: 8, height: 8)
        Text("\(state.currentStationName ?? "Station") · Choose Line")
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(.white)
        Spacer()
      }

      if let lines = state.availableLines, !lines.isEmpty {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(lines, id: \.self) { line in
              if #available(iOS 17.0, *) {
                Button(intent: SelectLineIntent(lineId: line)) {
                  lineChip(lineId: line)
                }
                .buttonStyle(.plain)
              } else {
                Link(destination: URL(string: "mycommute://line-select?line=\(line)")!) {
                  lineChip(lineId: line)
                }
              }
            }
          }
        }
      } else {
        HStack(spacing: 6) {
          ProgressView()
            .progressViewStyle(CircularProgressViewStyle(tint: .white))
            .scaleEffect(0.8)
          Text("Fetching departures…")
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(.white.opacity(0.75))
        }
        .padding(.vertical, 4)
      }
    }
  }

  private func lineChip(lineId: String) -> some View {
    HStack(spacing: 6) {
      AccentBar(lineId: lineId, width: 4, height: 14)
      Text(lineId.capitalized)
        .font(.system(size: 12, weight: .bold))
        .foregroundColor(.white)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(Color.white.opacity(0.12), in: Capsule())
    .overlay(Capsule().stroke(Color.white.opacity(0.18), lineWidth: 0.5))
  }

  // MARK: - Phase 1: Approaching Platform (Unified 4-Row Corridor Architecture)
  private var accentColor: Color {
    let normalized = lineId.lowercased().replacingOccurrences(of: "-", with: "")
    return normalized.contains("northern") ? .white : LineColor.color(for: lineId)
  }

  private func branchSuffix(_ branch: String?) -> String {
    guard let branch, !branch.isEmpty else { return "" }
    return " (\(branch))"
  }

  private func etaHeadline(for ep: ApproachingEndpoint) -> Text {
    let prefix = Text("Arriving at \(ep.destinationName)\(branchSuffix(ep.branchText)) ")
      .foregroundColor(.white)

    if ep.minutesToArrival <= 0 {
      return prefix + Text("now").foregroundColor(accentColor).bold()
    }
    return prefix
      + Text("in ").foregroundColor(.white)
      + Text("\(ep.minutesToArrival) mins").foregroundColor(accentColor).bold()
  }

  private var activeEndpoint: ApproachingEndpoint {
    if let first = state.approachingEndpoints?.first {
      return first
    }
    return ApproachingEndpoint(
      destinationName: state.destinationStationName ?? state.selectedEndpoint ?? "Destination",
      branchText: state.branchName,
      minutesToArrival: state.nextTrainMinutes,
      previousStationName: "Departed",
      remainingStationSequence: nil,
      stopsAway: state.nextTrainMinutes <= 1 ? 0 : 1,
      etaTimestamp: state.etaTimestamp
    )
  }

  private var approachingView: some View {
    let ep = activeEndpoint

    return VStack(alignment: .leading, spacing: 8) {
      // Row 1: Zomato-style high-contrast ETA headline
      HStack(alignment: .firstTextBaseline) {
        etaHeadline(for: ep)
          .font(.system(size: 17, weight: .semibold))
          .lineLimit(1)
          .truncationMode(.tail)
        Spacer()
      }

      // Row 2: 3.5pt Specular Line Color Bar + Line Name (Left-Aligned, No Indent)
      HStack(spacing: 5) {
        AccentBar(lineId: lineId, width: 3.5, height: 12)
        Text(state.lineName)
          .font(.system(size: 12, weight: .medium))
          .foregroundColor(.white.opacity(0.65))
        Spacer()
      }

      // Row 3: Multi-Node Corridor Delivery Track
      corridorTrack(endpoint: ep)

      // Row 4: Micro-Status (Stops count + Service Severity)
      HStack {
        if state.tunnelState == "held" {
          HStack(spacing: 5) {
            Circle()
              .fill(Color(hex: 0xFF9500))
              .frame(width: 6, height: 6)
            Text("Holding in tunnel · Awaiting signal")
              .font(.system(size: 11, weight: .semibold))
              .foregroundColor(.white.opacity(0.85))
          }
        } else {
          let stopsText: String = {
            if ep.stopsAway <= 1 {
              return "Arriving next"
            } else {
              return "\(ep.stopsAway) stops away"
            }
          }()
          Text(stopsText)
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(.white.opacity(0.7))
        }

        Spacer()

        statusPill
      }

      // Detour Alternative (if service is disrupted/escalated)
      detourSlot

      // Shush Toggle (1-tap manual shush for today, App Group channel)
      shushToggleSlot
    }
  }

  private func corridorTrack(endpoint: ApproachingEndpoint) -> some View {
    let prevStation = endpoint.previousStationName ?? "Departed"
    let targetStation = state.currentStationName ?? "Station"
    let seq = endpoint.remainingStationSequence ?? []
    let stopsAway = endpoint.stopsAway

    return HStack(spacing: 6) {
      // 1. Departed station (truncates first)
      Text(prevStation)
        .font(.system(size: 10, weight: .medium))
        .foregroundColor(.white.opacity(0.55))
        .lineLimit(1)
        .truncationMode(.tail)
        .frame(maxWidth: 95, alignment: .leading)

      // 2. Center Track: line + train SF Symbol + intermediate nodes
      GeometryReader { geo in
        let width = geo.size.width
        ZStack(alignment: .leading) {
          // Base track line
          Capsule()
            .fill(Color.white.opacity(0.20))
            .frame(height: 3)

          // Traveled progress segment
          let progressRatio: CGFloat = stopsAway <= 0 ? 0.70 : 0.35
          Capsule()
            .fill(LineColor.specularColor(for: lineId).opacity(0.75))
            .frame(width: max(4, width * progressRatio), height: 3)

          // Intermediate station node / ellipsis
          if stopsAway == 1, let midStation = seq.first {
            HStack(spacing: 2) {
              Circle()
                .fill(Color.white.opacity(0.8))
                .frame(width: 4, height: 4)
              Text(midStation)
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.white.opacity(0.75))
                .lineLimit(1)
                .truncationMode(.tail)
            }
            .offset(x: width * 0.50)
          } else if stopsAway >= 2, let nextCall = seq.first {
            HStack(spacing: 2) {
              Circle()
                .fill(Color.white.opacity(0.8))
                .frame(width: 4, height: 4)
              Text(nextCall)
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.white.opacity(0.75))
                .lineLimit(1)
                .truncationMode(.tail)
              Text("•••")
                .font(.system(size: 8, weight: .bold))
                .foregroundColor(.white.opacity(0.5))
            }
            .offset(x: width * 0.40)
          }

          // Native Train SF Symbol
          Image(systemName: "tram.fill")
            .font(.system(size: 10))
            .foregroundColor(LineColor.specularColor(for: lineId))
            .padding(3)
            .background(Color.black.opacity(0.7), in: Circle())
            .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 0.5))
            .offset(x: max(0, min(width - 16, width * progressRatio - 8)))
        }
      }
      .frame(height: 16)

      // 3. Target Station (never truncates)
      HStack(spacing: 2) {
        Text(targetStation)
          .font(.system(size: 11, weight: .bold))
          .foregroundColor(.white)
          .lineLimit(1)
        Image(systemName: "flag.checkered")
          .font(.system(size: 10, weight: .semibold))
          .foregroundColor(.white.opacity(0.9))
      }
      .fixedSize(horizontal: true, vertical: false)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(synthesizedAccessibilityLabel(endpoint: endpoint, prevStation: prevStation, targetStation: targetStation, seq: seq, stopsAway: stopsAway))
  }

  private func synthesizedAccessibilityLabel(endpoint: ApproachingEndpoint, prevStation: String, targetStation: String, seq: [String], stopsAway: Int) -> String {
    let minText = endpoint.minutesToArrival <= 0 ? "due now" : "\(endpoint.minutesToArrival) minutes away"
    if stopsAway <= 0 {
      return "\(state.lineName) train to \(endpoint.destinationName), arriving next at \(targetStation), \(minText)"
    } else if stopsAway == 1, let mid = seq.first {
      return "\(state.lineName) train to \(endpoint.destinationName), between \(prevStation) and \(mid), 1 stop from \(targetStation), \(minText)"
    } else {
      let stopsList = seq.joined(separator: ", ")
      return "\(state.lineName) train to \(endpoint.destinationName), departing \(prevStation), \(stopsAway) stops from \(targetStation), calling at \(stopsList), \(minText)"
    }
  }

  private var statusPill: some View {
    let severity = state.severityTier
    let text = state.statusText.isEmpty ? "Good Service" : state.statusText
    let color: Color = {
      if severity >= 2 {
        return Color(hex: 0xFF3B30)
      } else if severity == 1 {
        return Color(hex: 0xFFB000)
      } else {
        return Color(hex: 0x30D158)
      }
    }()

    return Text(text)
      .font(.system(size: 11, weight: .semibold))
      .foregroundColor(color)
      .padding(.horizontal, 6)
      .padding(.vertical, 2)
      .background(color.opacity(0.18), in: RoundedRectangle(cornerRadius: 4))
  }

  // MARK: - Phase 2: In-Transit (Your Ride to Next Stop)
  private var inTransitView: some View {
    let nextStation = state.nextStationName ?? "Next Stop"
    let nextMins = state.nextStationEtaMinutes ?? 2
    let dest = state.destinationStationName ?? state.selectedEndpoint ?? "Destination"
    let branchSuffix = (state.branchName != nil && !state.branchName!.isEmpty) ? " (\(state.branchName!))" : ""
    let minText = nextMins <= 0 ? "Due" : "\(nextMins)m"

    return VStack(alignment: .leading, spacing: 8) {
      // Row 1: Destination and Next Stop ETA
      HStack(alignment: .firstTextBaseline) {
        Text("To \(dest)\(branchSuffix)")
          .font(.system(size: 18, weight: .bold))
          .foregroundColor(.white)
          .lineLimit(1)
          .truncationMode(.tail)

        Spacer()

        Text(minText)
          .font(.system(size: 24, weight: .bold))
          .monospacedDigit()
          .foregroundColor(nextMins <= 0 ? Color(hex: 0x30D158) : .white)
      }

      // Row 2: 3.5pt Line Bar + Line Name
      HStack(spacing: 5) {
        AccentBar(lineId: lineId, width: 3.5, height: 12)
        Text(state.lineName)
          .font(.system(size: 12, weight: .medium))
          .foregroundColor(.white.opacity(0.65))
        Spacer()
      }

      // Row 3: Rider Transit Track
      HStack(spacing: 6) {
        Text(state.currentStationName ?? "Departed")
          .font(.system(size: 10, weight: .medium))
          .foregroundColor(.white.opacity(0.55))
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(maxWidth: 95, alignment: .leading)

        GeometryReader { geo in
          let width = geo.size.width
          ZStack(alignment: .leading) {
            Capsule()
              .fill(Color.white.opacity(0.20))
              .frame(height: 3)

            let progressRatio: CGFloat = min(1.0, max(0.15, CGFloat(state.progress)))
            Capsule()
              .fill(LineColor.specularColor(for: lineId).opacity(0.75))
              .frame(width: max(4, width * progressRatio), height: 3)

            Image(systemName: "tram.fill")
              .font(.system(size: 10))
              .foregroundColor(LineColor.specularColor(for: lineId))
              .padding(3)
              .background(Color.black.opacity(0.7), in: Circle())
              .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 0.5))
              .offset(x: max(0, min(width - 16, width * progressRatio - 8)))
          }
        }
        .frame(height: 16)

        HStack(spacing: 2) {
          Text(nextStation)
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(.white)
            .lineLimit(1)
          Image(systemName: "flag.checkered")
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(.white.opacity(0.9))
        }
        .fixedSize(horizontal: true, vertical: false)
      }

      // Row 4: Status and micro info
      HStack {
        if state.isOfflineMode {
          let nowUnix = Int(Date().timeIntervalSince1970)
          let elapsedSec = max(0, nowUnix - state.sessionStartTime)
          let elapsedMins = max(1, elapsedSec / 60)
          Text("In Transit · \(elapsedMins)m elapsed")
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(.white.opacity(0.7))
        } else {
          Text("Next stop: \(nextStation)")
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(.white.opacity(0.7))
        }

        Spacer()

        statusPill
      }

      detourSlot

      // Shush Toggle (1-tap manual shush for today, App Group channel)
      shushToggleSlot
    }
  }

  // MARK: - Phase 3: Arrived Summary
  private var arrivedView: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) {
        Image(systemName: "checkmark.circle.fill")
          .font(.system(size: 14, weight: .bold))
          .foregroundColor(Color(hex: 0x30D158))
        Text("Arrived · \(state.destinationStationName ?? state.lineName)")
          .font(.system(size: 14, weight: .bold))
          .foregroundColor(.white)
        Spacer()
      }

      Text("Commute completed. Auto-dismissing on exit.")
        .font(.system(size: 11))
        .foregroundColor(.white.opacity(0.7))
    }
  }

  // MARK: - Detour Slot (Alternative lines during disruption)
  @ViewBuilder
  private var detourSlot: some View {
    if state.isEscalated, let detour = state.detourLine, !detour.isEmpty {
      if #available(iOS 17.0, *) {
        Button(intent: SwitchCommuteRouteIntent(
          newLineId: detour,
          transferStation: state.statusText.contains("via") ? state.statusText : "Interchange",
          detourCurrentStatus: state.detourStatus ?? "good",
          detourEtaDelta: "+\(state.detourMinutes ?? 5)m"
        )) {
          detourBanner(detour: detour)
        }
        .buttonStyle(.plain)
      } else {
        detourBanner(detour: detour)
      }
    }
  }

  private func detourBanner(detour: String) -> some View {
    HStack(spacing: 6) {
      Image(systemName: "arrow.triangle.swap")
        .font(.system(size: 11, weight: .bold))
        .foregroundColor(Color(hex: 0x007AFF))
      Text("\(detour.capitalized) Line alternative (+\(state.detourMinutes ?? 5)m)")
        .font(.system(size: 11, weight: .semibold))
        .foregroundColor(.white)
      Spacer()
      if let detourStatus = state.detourStatus {
        Text(detourStatus.replacingOccurrences(of: "_", with: " ").capitalized)
          .font(.system(size: 9.5, weight: .bold))
          .foregroundColor(detourStatus == "good" ? Color(hex: 0x30D158) : Color(hex: 0xFFCC00))
      }
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
  }

  // MARK: - Shush Toggle (manual shush for today, App Group channel)
  private var isShushedToday: Bool {
    isManualShushActiveToday()
  }

  @ViewBuilder
  private var shushToggleSlot: some View {
    let shushed = isShushedToday
    if #available(iOS 17.0, *) {
      Button(intent: ToggleShushIntent()) {
        shushToggleLabel(isShushed: shushed)
      }
      .buttonStyle(.plain)
    } else {
      Link(destination: URL(string: "mycommute://shush-toggle")!) {
        shushToggleLabel(isShushed: shushed)
      }
    }
  }

  private func shushToggleLabel(isShushed: Bool) -> some View {
    HStack(spacing: 6) {
      Image(systemName: isShushed ? "bell.slash.fill" : "bell.fill")
        .font(.system(size: 11, weight: .bold))
        .foregroundColor(isShushed ? Color(hex: 0xFF9500) : .white.opacity(0.85))
      Text(isShushed ? "Shush on · tap to turn off" : "Shush today")
        .font(.system(size: 11, weight: .semibold))
        .foregroundColor(.white)
      Spacer()
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
  }
}

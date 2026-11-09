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
  let attributes: MyCommuteLiveActivityAttributes
  let state: MyCommuteLiveActivityAttributes.ContentState
  let lineId: String

  public init(attributes: MyCommuteLiveActivityAttributes, state: MyCommuteLiveActivityAttributes.ContentState, lineId: String? = nil) {
    self.attributes = attributes
    self.state = state
    self.lineId = lineId ?? attributes.lineId
  }

  public init(state: MyCommuteLiveActivityAttributes.ContentState, lineId: String) {
    self.attributes = MyCommuteLiveActivityAttributes(lineId: lineId)
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
    let isShushCard = attributes.cardKind == "shush" || (attributes.cardKind == nil && attributes.originStation.isEmpty && attributes.destinationStation.isEmpty)
    if isShushCard {
      disruptionView
    } else {
      // Journey Card: NEVER hijack the view! Train track stays visible during delays.
      switch state.phase {
      case "line_picker": linePickerView
      case "in_transit":  inTransitView
      case "approaching": approachingView
      case "arrived":     arrivedView
      default:            EmptyView()
      }
    }
  }

  private var rerouteURL: URL? {
    URL(string: "mycommute://reroute?line=\(lineId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? lineId)")
  }

  // MARK: - Dedicated Disruption Takeover View (Severity Tier >= 2)
  // Single-column natural hierarchy: line identity on top, status icon
  // paired directly with disruption headline, unsevered cause, and a single
  // Reroute action capsule at the bottom right.
  private var disruptionView: some View {
    VStack(alignment: .leading, spacing: 8) {
      // Row 1: Line accent bar + canonical line name
      HStack(spacing: 7) {
        AccentBar(lineId: lineId, width: 3.5, height: 14)
          .accessibilityHidden(true)
        Text(lineDisplayName)
          .font(.system(size: 12, weight: .semibold))
          .foregroundColor(.white.opacity(0.85))
        Spacer()
      }

      // Row 2: Status Icon + Disruption Headline (Together)
      HStack(spacing: 8) {
        Image(systemName: disruptionStatusIcon(for: state.severityTier))
          .font(.system(size: 20, weight: .bold))
          .foregroundColor(disruptionStatusColor(for: state.severityTier))
          .accessibilityHidden(true)

        Text(disruptionHeadline)
          .font(.system(size: 24, weight: .bold, design: .rounded))
          .foregroundColor(headlineColor)
          .lineLimit(1)
          .minimumScaleFactor(0.75)
          .fixedSize(horizontal: false, vertical: true)
      }

      // Row 3: Real TfL cause only — reason field first, zero fake fallback filler.
      if let cause = resolvedDisruptionCause {
        Text(cause)
          .font(.system(size: 12.5, weight: .medium))
          .foregroundColor(.white.opacity(0.92))
          .lineLimit(3)
          .fixedSize(horizontal: false, vertical: true)
      }

      // Row 4: Single Reroute action at bottom right
      if let url = rerouteURL, !lineId.isEmpty {
        HStack {
          Spacer()
          Link(destination: url) {
            Text("Reroute")
              .font(.system(size: 12, weight: .bold))
              .foregroundColor(.white)
              .padding(.horizontal, 12)
              .padding(.vertical, 6)
              .background(Color.white.opacity(0.18))
              .clipShape(Capsule())
          }
          .accessibilityLabel("Reroute \(lineDisplayName)")
        }
      }
    }
  }

  private var resolvedDisruptionCause: String? {
    if let reason = state.reason, let cleaned = cleanDisruptionReason(reason) {
      return cleaned
    }
    if let raw = state.statusText.trimmingCharacters(in: .whitespacesAndNewlines) as String?,
       let cleaned = cleanDisruptionReason(raw) {
      return cleaned
    }
    return nil
  }

  // Widget StatusIcon parity (CommuteWidget.swift:639): minor = amber clock,
  // severe = red warning triangle, suspended = red X mark.
  func disruptionStatusIcon(for tier: Int) -> String {
    tier == 1 ? "clock.fill"
      : tier == 2 ? "exclamationmark.triangle.fill"
      : "xmark"
  }

  func disruptionStatusColor(for tier: Int) -> Color {
    tier == 1 ? Color(hex: 0xFFB000)
      : tier == 0 ? Color(hex: 0xFFB000)
      : Color(hex: 0xFF3B30)
  }

  private var headlineColor: Color {
    state.severityTier >= 2 ? Color(hex: 0xFF3B30) : Color(hex: 0xFFB000)
  }

  private var disruptionHeadline: String {
    let rawSeverity = state.statusSeverity.trimmingCharacters(in: .whitespacesAndNewlines)
    if !rawSeverity.isEmpty && rawSeverity.lowercased() != "good" && rawSeverity.lowercased() != "normal" {
      if rawSeverity == "severe_delays" { return "Severe Delays" }
      if rawSeverity == "minor_delays" { return "Minor Delays" }
      if rawSeverity == "part_suspended" { return "Part Suspended" }
      if rawSeverity == "suspended" { return "Suspended" }
      return rawSeverity
    }
    let raw = state.statusText.trimmingCharacters(in: .whitespacesAndNewlines)
    for separator in [" — ", " - ", ": ", " ("] {
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
    guard !raw.isEmpty else { return nil }

    let headline = disruptionHeadline
    if raw.localizedCaseInsensitiveContains(headline) {
      if let range = raw.range(of: headline, options: .caseInsensitive) {
        var remainder = String(raw[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        remainder = remainder.trimmingCharacters(in: CharacterSet(charactersIn: " -—:()"))
        if !remainder.isEmpty {
          return remainder
        }
      }
    }

    if raw.localizedCaseInsensitiveCompare(headline) != .orderedSame {
      return raw
    }

    // Zero fake fallback: if there is no distinct cause text, return nil
    return nil
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
    let mins = ep.minutesToArrival
    let etaCountdown = mins <= 0 ? "Due" : "\(mins) mins"

    return VStack(alignment: .leading, spacing: 8) {
      // Row 1: Destination on left, non-truncating ETA countdown on right (Guaranteed-fit)
      HStack(alignment: .firstTextBaseline) {
        Text("\(ep.destinationName)\(branchSuffix(ep.branchText))")
          .font(.system(size: 17, weight: .semibold))
          .foregroundColor(.white)
          .lineLimit(1)
          .truncationMode(.tail)

        Spacer(minLength: 8)

        Text(etaCountdown)
          .font(.system(size: 17, weight: .bold))
          .foregroundColor(accentColor)
          .fixedSize(horizontal: true, vertical: false)
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

  @ViewBuilder
  private var statusPill: some View {
    if state.severityTier >= 1 {
      let severity = state.severityTier
      let text = disruptionHeadline
      let color: Color = severity >= 2 ? Color(hex: 0xFF3B30) : Color(hex: 0xFFB000)
      Text(text)
        .font(.system(size: 11, weight: .semibold))
        .lineLimit(1)
        .fixedSize(horizontal: true, vertical: false)
        .foregroundColor(color)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(color.opacity(0.18), in: RoundedRectangle(cornerRadius: 4))
    }
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

  // MARK: - Reroute Slot (truthful action during disruption)
  //
  // Zero-Fabrication Invariant: the previous fabricated detour guess
  // ("<Line> Line alternative (+Xm)" Text and the SwitchCommuteRouteIntent
  // button built on it) is removed — detourLine/detourMinutes were invented,
  // never verified journey-planner results. Until real detour data exists, the
  // only truthful action is deep-linking into the in-app reroute flow.
  // Property name kept as `detourSlot` so the three existing call sites
  // (disruptionView, inTransitView, approachingView) are unchanged; it now
  // renders solely on `state.isEscalated`.
  @ViewBuilder
  private var detourSlot: some View {
    if (state.severityTier >= 2 || state.isEscalated) && !lineId.isEmpty {
      Link(destination: URL(string: "mycommute://reroute?line=\(lineId)")!) {
        HStack(spacing: 6) {
          Image(systemName: "signpost.right.and.left.fill").font(.system(size: 13, weight: .semibold))
          Text("View Reroute").font(.system(size: 13, weight: .semibold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.15))
        .clipShape(Capsule())
      }
    }
  }

}

// MARK: - Deterministic Cause Cleaner (Zero-Fabrication Invariant)
/// Normalizes raw TfL disruption sentences into crisp cause phrases:
/// - Strips line prefix: "Bakerloo Line: "
/// - Strips causal lead-ins: "Severe delays reported across this line due to an " -> "Urgent track inspection"
/// - Strips leading articles ("an ", "a ", "the ")
/// - Cuts at first period; returns nil if remainder is merely a headline or empty.
public func cleanDisruptionReason(_ raw: String, max: Int = 70) -> String? {
  var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !s.isEmpty else { return nil }

  if let c = s.range(of: #"^[A-Za-z &\-]+ (line|railway|service):\s*"#, options: [.regularExpression, .caseInsensitive]) {
    s.removeSubrange(c)
  }

  for key in [" due to an ", " due to a ", " due to the ", " due to ", " because of "] {
    if let r = s.range(of: key, options: .caseInsensitive) {
      s = String(s[r.upperBound...])
      break
    }
  }

  for art in ["an ", "a ", "the "] {
    if s.lowercased().hasPrefix(art) {
      s.removeFirst(art.count)
      break
    }
  }

  if let dot = s.firstIndex(of: ".") {
    s = String(s[..<dot])
  }

  s = s.trimmingCharacters(in: .whitespacesAndNewlines)
  s = s.trimmingCharacters(in: CharacterSet(charactersIn: " -—:()"))
  guard let f = s.first else { return nil }

  let headlines = ["severe delays", "minor delays", "suspended", "part suspended", "special service", "planned closure", "good service"]
  if headlines.contains(raw.lowercased()) || headlines.contains(s.lowercased()) {
    return nil
  }

  s = f.uppercased() + s.dropFirst()
  if s.count > max, let sp = s.prefix(max).lastIndex(of: " ") {
    s = String(s[..<sp]) + "…"
  }
  return s
}

// MARK: - Dedicated Disruption Bottom View for Dynamic Island Expanded
public struct DisruptionExpandedBottomView: View {
  let state: MyCommuteLiveActivityAttributes.ContentState
  let lineId: String

  public init(state: MyCommuteLiveActivityAttributes.ContentState, lineId: String) {
    self.state = state
    self.lineId = lineId
  }

  private var headlineColor: Color {
    state.severityTier >= 2 ? Color(hex: 0xFF3B30) : Color(hex: 0xFFB000)
  }

  private var causeText: String? {
    if let reason = state.reason, let cleaned = cleanDisruptionReason(reason) {
      return cleaned
    }
    if let raw = state.statusText.trimmingCharacters(in: .whitespacesAndNewlines) as String?,
       let cleaned = cleanDisruptionReason(raw) {
      return cleaned
    }
    return nil
  }

  public var body: some View {
    HStack(alignment: .center, spacing: 10) {
      Circle()
        .fill(headlineColor)
        .frame(width: 24, height: 24)
        .overlay(
          Image(systemName: "exclamationmark.triangle.fill")
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(.white)
        )

      if let cause = causeText, !cause.isEmpty {
        Text(cause)
          .font(.system(size: 11.5, weight: .medium))
          .foregroundColor(.white.opacity(0.85))
          .lineLimit(2)
          .fixedSize(horizontal: false, vertical: true)
      }

      Spacer(minLength: 4)

      if !lineId.isEmpty {
        Link(destination: URL(string: "mycommute://reroute?line=\(lineId)")!) {
          HStack(spacing: 4) {
            Image(systemName: "arrow.triangle.swap")
              .font(.system(size: 10, weight: .bold))
            Text("Reroute")
              .font(.system(size: 11, weight: .bold))
          }
          .foregroundColor(.white)
          .padding(.horizontal, 10)
          .padding(.vertical, 6)
          .background(Color.white.opacity(0.18))
          .clipShape(Capsule())
        }
      }
    }
  }
}

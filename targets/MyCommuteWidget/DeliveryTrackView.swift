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

public struct DeliveryStatusIcon: View {
  let severity: Int

  public init(severity: Int) {
    self.severity = severity
  }

  public var body: some View {
    switch severity {
    case 3:
      Image(systemName: "xmark.octagon.fill")
        .foregroundColor(Color(hex: 0xFF3B30))
        .font(.system(size: 13, weight: .bold))
    case 2:
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundColor(Color(hex: 0xFF9500))
        .font(.system(size: 13, weight: .bold))
    case 1:
      Image(systemName: "exclamationmark.circle.fill")
        .foregroundColor(Color(hex: 0xFFCC00))
        .font(.system(size: 13, weight: .bold))
    default:
      Image(systemName: "checkmark.circle.fill")
        .foregroundColor(Color(hex: 0x30D158))
        .font(.system(size: 13, weight: .bold))
    }
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
      if state.phase == "line_picker" {
        linePickerView
      } else if state.phase == "arrived" {
        arrivedView
      } else if state.phase == "in_transit" {
        inTransitView
      } else {
        approachingView
      }
    }
    .dynamicTypeSize(...DynamicTypeSize.accessibility1)
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
      Rectangle()
        .fill(LineColor.specularColor(for: lineId))
        .frame(width: 4, height: 14)
        .cornerRadius(1)
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
  private var activeEndpoint: ApproachingEndpoint {
    if let endpoints = state.approachingEndpoints, let first = endpoints.first {
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
    let branchStr = (ep.branchText != nil && !ep.branchText!.isEmpty) ? " (\(ep.branchText!))" : ""
    let minText = ep.minutesToArrival <= 0 ? "Due" : "\(ep.minutesToArrival)m"

    return VStack(alignment: .leading, spacing: 8) {
      // Row 1: Destination Endpoint + Tabular Minutes
      HStack(alignment: .firstTextBaseline) {
        Text("\(ep.destinationName)\(branchStr)")
          .font(.system(size: 18, weight: .bold))
          .foregroundColor(.white)
          .lineLimit(1)
          .truncationMode(.tail)

        Spacer()

        Text(minText)
          .font(.system(size: 24, weight: .bold))
          .monospacedDigit()
          .foregroundColor(ep.minutesToArrival <= 0 ? Color(hex: 0x30D158) : .white)
      }

      // Row 2: 3.5pt Specular Line Color Bar + Line Name (Left-Aligned, No Indent)
      HStack(spacing: 5) {
        Rectangle()
          .fill(LineColor.specularColor(for: lineId))
          .frame(width: 3.5, height: 12)
          .cornerRadius(1)
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
            if ep.stopsAway <= 0 {
              return "Arriving next"
            } else if ep.stopsAway == 1 {
              return "1 stop away"
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
        Text("🏁")
          .font(.system(size: 10))
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

      // Row 2: 3.5pt Specular Line Bar + Line Name
      HStack(spacing: 5) {
        Rectangle()
          .fill(LineColor.specularColor(for: lineId))
          .frame(width: 3.5, height: 12)
          .cornerRadius(1)
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
          Text("🏁")
            .font(.system(size: 10))
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
}

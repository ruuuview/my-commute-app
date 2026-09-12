// frontend/targets/MyCommuteWidget/DeliveryTrackView.swift
// SpringBoard-native countdown timer and Delivery Track progress bar.
// Delivery Architecture:
// Phase 0: Line Picker (Multi-line hubs)
// Phase 1: Approaching Platform (Train coming to your station)
// Phase 2: In-Transit (Your ride to next stop)
// Phase 3: Arrived Summary (Auto-dismissing)
// Zero wall-clock timestamps (08:36), zero stopwatches (08:24), zero compass text.

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
    VStack(spacing: 10) {
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
    .padding(12)
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
        .fill(LineColor.color(for: lineId))
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

  // MARK: - Phase 1: Approaching Platform (Train Approaching You)
  private var approachingView: some View {
    VStack(spacing: 10) {
      // Header: Line Name + Station
      HStack {
        DeliveryStatusIcon(severity: state.severityTier)
        Text(state.lineName)
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(.white)
        if let stName = state.currentStationName, !stName.isEmpty {
          Text("· \(stName)")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.white.opacity(0.85))
        }
        Spacer()
        Text(state.statusText)
          .font(.system(size: 11))
          .foregroundColor(.white.opacity(0.7))
          .lineLimit(1)
      }

      // Stacked Delivery Tracks for Approaching Endpoints
      if let endpoints = state.approachingEndpoints, !endpoints.isEmpty {
        VStack(spacing: 12) {
          ForEach(endpoints.prefix(2), id: \.destinationName) { ep in
            approachingEndpointTrack(endpoint: ep)
          }
        }
      } else {
        // Fallback: Single delivery track from top arrival
        fallbackApproachingTrack
      }

      // Detour Alternative (if service is disrupted/escalated)
      detourSlot
    }
  }

  private func approachingEndpointTrack(endpoint: ApproachingEndpoint) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack {
        let branchStr = (endpoint.branchText != nil && !endpoint.branchText!.isEmpty) ? " (\(endpoint.branchText!))" : ""
        Text("To \(endpoint.destinationName)\(branchStr)")
          .font(.system(size: 12, weight: .bold))
          .foregroundColor(.white)
        Spacer()
        let minText = endpoint.minutesToArrival <= 0 ? "Due" : "\(endpoint.minutesToArrival)m"
        Text(minText)
          .font(.system(size: 13, weight: .bold))
          .monospacedDigit()
          .foregroundColor(endpoint.minutesToArrival <= 1 ? Color(hex: 0x30D158) : .white)
      }

      // Track graphic: [Origin] ─────●───── [CurrentStation] 🏁
      HStack(spacing: 4) {
        Text(endpoint.previousStationName ?? "Approaching")
          .font(.system(size: 10, weight: .medium))
          .foregroundColor(.white.opacity(0.6))
          .lineLimit(1)
        
        GeometryReader { geo in
          ZStack(alignment: .leading) {
            Capsule()
              .fill(Color.white.opacity(0.18))
              .frame(height: 4)

            // Progress position (1 stop away = 0.5, arriving now = 0.9)
            let progressRatio: CGFloat = endpoint.minutesToArrival <= 0 ? 0.95 : (endpoint.stopsAway <= 1 ? 0.65 : 0.35)
            Circle()
              .fill(LineColor.color(for: lineId))
              .frame(width: 8, height: 8)
              .offset(x: max(0, min(geo.size.width - 8, geo.size.width * progressRatio)))
          }
        }
        .frame(height: 8)

        HStack(spacing: 2) {
          Text(state.currentStationName ?? "Station")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.white.opacity(0.9))
            .lineLimit(1)
          Text("🏁")
            .font(.system(size: 9))
        }
      }
    }
    .padding(8)
    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
  }

  private var fallbackApproachingTrack: some View {
    let etaDate = state.etaTimestamp > 0
      ? Date(timeIntervalSince1970: TimeInterval(state.etaTimestamp))
      : Date().addingTimeInterval(180)
    let now = Date()

    return VStack(alignment: .leading, spacing: 6) {
      HStack {
        let dest = state.destinationStationName ?? state.selectedEndpoint ?? "Destination"
        let branchStr = (state.branchName != nil && !state.branchName!.isEmpty) ? " (\(state.branchName!))" : ""
        Text("To \(dest)\(branchStr)")
          .font(.system(size: 12, weight: .bold))
          .foregroundColor(.white)
        Spacer()
        let minText = state.nextTrainMinutes <= 0 ? "Due" : "\(state.nextTrainMinutes)m"
        Text(minText)
          .font(.system(size: 13, weight: .bold))
          .monospacedDigit()
          .foregroundColor(.white)
      }

      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule()
            .fill(Color.white.opacity(0.18))
            .frame(height: 4)

          Capsule()
            .fill(LineColor.color(for: lineId))
            .frame(width: max(8, min(geo.size.width, geo.size.width * CGFloat(state.progress))), height: 4)
        }
      }
      .frame(height: 4)

      HStack {
        Text("Approaching platform")
          .font(.system(size: 10))
          .foregroundColor(.white.opacity(0.6))
        Spacer()
        let targetDate = max(now, etaDate)
        Text(timerInterval: now...targetDate, countsDown: true)
          .font(.system(size: 12, weight: .bold))
          .monospacedDigit()
          .foregroundColor(.white)
      }
    }
  }

  // MARK: - Phase 2: In-Transit (Your Ride to Next Stop)
  private var inTransitView: some View {
    let now = Date()
    let etaSec = (state.nextStationEtaMinutes ?? 2) * 60
    let etaDate = state.nextStationEtaTimestamp != nil && state.nextStationEtaTimestamp! > 0
      ? Date(timeIntervalSince1970: TimeInterval(state.nextStationEtaTimestamp!))
      : now.addingTimeInterval(TimeInterval(etaSec))
    let isStale = state.isStaleEta ?? false

    return VStack(spacing: 10) {
      HStack {
        Rectangle()
          .fill(LineColor.color(for: lineId))
          .frame(width: 4, height: 14)
          .cornerRadius(1)
        Text("\(state.lineName) · In Transit")
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(.white)
        Spacer()
        if let dest = state.destinationStationName ?? state.selectedEndpoint {
          let branchSuffix = (state.branchName != nil && !state.branchName!.isEmpty) ? " (\(state.branchName!))" : ""
          Text("to \(dest)\(branchSuffix)")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.white.opacity(0.75))
        }
      }

      // Delivery Track: [PrevStation] ─────●───── [NextStation] 🏁
      HStack(spacing: 6) {
        Text(state.currentStationName ?? "Origin")
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(.white.opacity(0.7))
          .lineLimit(1)

        GeometryReader { geo in
          ZStack(alignment: .leading) {
            Capsule()
              .fill(Color.white.opacity(0.18))
              .frame(height: 6)

            Circle()
              .fill(LineColor.color(for: lineId))
              .frame(width: 10, height: 10)
              .offset(x: max(0, min(geo.size.width - 10, geo.size.width * 0.55)))
          }
        }
        .frame(height: 10)

        HStack(spacing: 2) {
          Text(state.nextStationName ?? "Next Stop")
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(.white)
            .lineLimit(1)
          Text("🏁")
            .font(.system(size: 10))
        }
      }
      .padding(8)
      .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

      // Next Stop Status and Native SpringBoard Countdown
      HStack {
        HStack(spacing: 4) {
          Text("Next stop ·")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.white.opacity(0.85))
          if isStale {
            Text("—")
              .font(.system(size: 13, weight: .bold))
              .foregroundColor(.white.opacity(0.6))
          } else {
            let targetDate = max(now, etaDate)
            Text(timerInterval: now...targetDate, countsDown: true)
              .font(.system(size: 14, weight: .bold))
              .monospacedDigit()
              .foregroundColor(.white)
          }
        }

        Spacer()

        Text(state.statusSeverity == "good" ? "On time" : state.statusText)
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(state.isDisrupted ? Color(hex: 0xFFB000) : Color(hex: 0x30D158))
      }

      detourSlot
    }
  }

  // MARK: - Phase 3: Arrived Summary
  private var arrivedView: some View {
    VStack(spacing: 8) {
      HStack(spacing: 6) {
        Image(systemName: "checkmark.circle.fill")
          .font(.system(size: 14, weight: .bold))
          .foregroundColor(Color(hex: 0x30D158))
        Text("Arrived · \(state.destinationStationName ?? state.lineName)")
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(.white)
        Spacer()
      }

      HStack {
        Text("Commute completed. Auto-dismissing on exit.")
          .font(.system(size: 11))
          .foregroundColor(.white.opacity(0.7))
        Spacer()
      }
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

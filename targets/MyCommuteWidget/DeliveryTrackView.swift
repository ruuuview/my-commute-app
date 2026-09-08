// frontend/targets/MyCommuteWidget/DeliveryTrackView.swift
// SpringBoard-native countdown timer and Delivery Track progress bar.
// No if/else branching on timer. SpringBoard ticks this natively, stops at 0:00, never negative.
// iOS dims the entire Live Activity automatically when staleDate passes.

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
      if state.phase == "arrived" {
        arrivedView
      } else if state.phase == "in_transit" {
        inTransitView
      } else {
        approachingView
      }
    }
    .padding(12)
  }

  // MARK: - Phase 1: Approaching Platform
  private var approachingView: some View {
    let etaDate = state.etaTimestamp > 0
      ? Date(timeIntervalSince1970: TimeInterval(state.etaTimestamp))
      : Date().addingTimeInterval(300)
    let now = Date()

    return VStack(spacing: 8) {
      // Line & Destination Header
      HStack {
        DeliveryStatusIcon(severity: state.severityTier)
        Text(state.lineName)
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(.white)
        Spacer()
        Text(state.statusText)
          .font(.system(size: 11))
          .foregroundColor(.white.opacity(0.7))
          .lineLimit(1)
      }

      // 1-Tap Endpoint Selection Pills (iOS 17+)
      if let endpoints = state.availableEndpoints, !endpoints.isEmpty {
        HStack(spacing: 6) {
          Text("Towards:")
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(.white.opacity(0.6))
          
          ForEach(endpoints, id: \.self) { endpoint in
            let isSelected = (state.selectedEndpoint == endpoint)
            if #available(iOS 17.0, *) {
              Button(intent: SwitchEndpointIntent(endpointName: endpoint, lineId: lineId)) {
                endpointPill(endpoint: endpoint, isSelected: isSelected)
              }
              .buttonStyle(.plain)
            } else {
              endpointPill(endpoint: endpoint, isSelected: isSelected)
            }
          }
          Spacer()
        }
      }

      // Delivery Track progress bar
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule()
            .fill(Color.white.opacity(0.18))
            .frame(height: 6)

          Capsule()
            .fill(LineColor.color(for: lineId))
            .frame(width: max(8, min(geo.size.width, geo.size.width * CGFloat(state.progress))), height: 6)
        }
      }
      .frame(height: 6)

      // Live Countdown to Platform
      HStack {
        let targetDate = max(now, etaDate)
        Text(timerInterval: now...targetDate, countsDown: true)
          .font(.system(size: 15, weight: .bold, design: .monospaced))
          .foregroundColor(.white)
          .contentTransition(.numericText())

        Spacer()

        if state.etaDelta != "N/A" && !state.etaDelta.isEmpty {
          Text(state.etaDelta)
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(state.isEscalated ? Color(hex: 0xFF3B30) : .white.opacity(0.8))
        }
      }

      // Detour & Delay Repay slots
      detourAndRepaySlots
    }
  }

  // MARK: - Phase 2: In-Transit (Underground Stopwatch)
  private var inTransitView: some View {
    VStack(spacing: 8) {
      HStack {
        AccentBar(lineId: lineId)
        Text("\(state.lineName) · In Transit")
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(.white)
        Spacer()
        if let dest = state.destinationStationName ?? state.selectedEndpoint {
          Text("to \(dest)")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.white.opacity(0.75))
        }
      }

      // Native Elapsed Stopwatch (zero JS wakes)
      HStack {
        let startDate = state.sessionStartTime > 0
          ? Date(timeIntervalSince1970: TimeInterval(state.sessionStartTime))
          : Date().addingTimeInterval(-180)

        HStack(spacing: 6) {
          Image(systemName: "stopwatch.fill")
            .font(.system(size: 12))
            .foregroundColor(LineColor.color(for: lineId))
          Text(timerInterval: startDate...Date.distantFuture, countsDown: false)
            .font(.system(size: 16, weight: .bold, design: .monospaced))
            .foregroundColor(.white)
        }

        Spacer()

        Text(state.statusSeverity == "good" ? "On Schedule" : state.statusText)
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(state.isDisrupted ? Color(hex: 0xFFB000) : Color(hex: 0x30D158))
      }

      detourAndRepaySlots
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

      detourAndRepaySlots
    }
  }

  // MARK: - Subviews & Helpers
  private func endpointPill(endpoint: String, isSelected: Bool) -> some View {
    Text(endpoint)
      .font(.system(size: 10, weight: isSelected ? .bold : .medium))
      .foregroundColor(isSelected ? .black : .white.opacity(0.85))
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .background(isSelected ? Color.white : Color.white.opacity(0.14))
      .cornerRadius(6)
  }

  @ViewBuilder
  private var detourAndRepaySlots: some View {
    // Detour Banner
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
        Link(destination: URL(string: "mycommute://reroute?line=\(detour)")!) {
          detourBanner(detour: detour)
        }
      }
    }

    // Delay Repay Slot
    if state.delayRepayEligible, let fare = state.estimatedFare {
      Link(destination: URL(string: "https://tfl.gov.uk/fares/refunds-and-replacements/delay-repay")!) {
        HStack(spacing: 5) {
          Image(systemName: "sterlingsign.circle.fill")
            .foregroundColor(Color(hex: 0x30D158))
            .font(.system(size: 12))
          Text("~£\(fare) potential refund · \(state.delayMinutes)m delay tracked")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.white.opacity(0.9))
        }
        .padding(.top, 2)
      }
    }
  }

  @ViewBuilder
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
    .background(Color.white.opacity(0.08))
    .cornerRadius(6)
  }
}

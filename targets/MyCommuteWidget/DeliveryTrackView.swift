// frontend/targets/MyCommuteWidget/DeliveryTrackView.swift
// SpringBoard-native countdown timer and Delivery Track progress bar.
// No if/else branching on timer. SpringBoard ticks this natively, stops at 0:00, never negative.
// iOS dims the entire Live Activity automatically when staleDate passes.

import SwiftUI
import ActivityKit
import AppIntents

public struct StatusIcon: View {
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
    let etaDate = state.etaTimestamp > 0
      ? Date(timeIntervalSince1970: TimeInterval(state.etaTimestamp))
      : Date().addingTimeInterval(300)
    let now = Date()

    VStack(spacing: 8) {
      // 1. Status line
      HStack {
        StatusIcon(severity: state.severityTier)
        Text(state.lineName)
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(.white)
        Spacer()
        Text(state.statusText)
          .font(.system(size: 11))
          .foregroundColor(.white.opacity(0.7))
          .lineLimit(1)
      }

      // 2. Delivery Track bar
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

      // 3. COUNTDOWN — Single Text view. No if/else branching.
      // SpringBoard ticks this natively. Stops at 0:00. Never negative.
      // When staleDate passes, iOS dims the entire Live Activity automatically.
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

      // 4. Detour Banner (if Tier 3 escalated) — 1-Tap Detour Hand-off (Section 14)
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

      // 5. Delay Repay slot (evaluated at push time, not render time)
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
    .padding(12)
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

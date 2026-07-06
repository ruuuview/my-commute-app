import ActivityKit
import WidgetKit
import SwiftUI

struct CommuteActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var nextTrainMinutes: Int
        var followingTrainMinutes: Int
        var lineStatus: String
    }

    var originStation: String
    var destinationStation: String
    var lineId: String
    var lineName: String
}

func colorForLine(_ lineId: String) -> Color {
    switch lineId.lowercased() {
    case "bakerloo": return Color(red: 179.0/255.0, green: 99.0/255.0, blue: 5.0/255.0)
    case "central": return Color(red: 227.0/255.0, green: 32.0/255.0, blue: 23.0/255.0)
    case "circle": return Color(red: 255.0/255.0, green: 211.0/255.0, blue: 0.0/255.0)
    case "district": return Color(red: 0.0/255.0, green: 120.0/255.0, blue: 42.0/255.0)
    case "dlr": return Color(red: 0.0/255.0, green: 175.0/255.0, blue: 173.0/255.0)
    case "elizabeth": return Color(red: 105.0/255.0, green: 80.0/255.0, blue: 161.0/255.0)
    case "hammersmith-city": return Color(red: 243.0/255.0, green: 169.0/255.0, blue: 187.0/255.0)
    case "jubilee": return Color(red: 134.0/255.0, green: 143.0/255.0, blue: 152.0/255.0)
    case "metropolitan": return Color(red: 155.0/255.0, green: 0.0/255.0, blue: 86.0/255.0)
    case "northern": return Color(red: 0.1, green: 0.1, blue: 0.1)
    case "overground", "weaver", "mildmay", "windrush", "suffragette", "lioness", "liberty": return Color(red: 238.0/255.0, green: 124.0/255.0, blue: 14.0/255.0)
    case "piccadilly": return Color(red: 0.0/255.0, green: 54.0/255.0, blue: 136.0/255.0)
    case "victoria": return Color(red: 0.0/255.0, green: 152.0/255.0, blue: 212.0/255.0)
    case "waterloo-city": return Color(red: 149.0/255.0, green: 205.0/255.0, blue: 186.0/255.0)
    default: return Color.gray
    }
}

struct CommuteLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CommuteActivityAttributes.self) { context in
            // Lock Screen / Notification Banner UI
            CommuteLiveActivityLockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: "tram.fill")
                            .foregroundColor(colorForLine(context.attributes.lineId))
                        Text(context.attributes.destinationStation)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                    }
                    .padding(.leading, 8)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing) {
                        Text("\(context.state.nextTrainMinutes) min")
                            .font(.system(.title, design: .monospaced, weight: .bold))
                            .foregroundColor(colorForLine(context.attributes.lineId))
                    }
                    .padding(.trailing, 8)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(context.state.lineStatus)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.white.opacity(0.8))
                            if context.state.followingTrainMinutes > 0 {
                                Text("Following: \(context.state.followingTrainMinutes) min")
                                    .font(.system(size: 11))
                                    .foregroundColor(.white.opacity(0.6))
                            }
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 10)
                    .padding(.bottom, 6)
                }
            } compactLeading: {
                HStack(spacing: 4) {
                    Image(systemName: "tram.fill")
                        .foregroundColor(colorForLine(context.attributes.lineId))
                    Text(context.attributes.destinationStation.prefix(6))
                        .font(.system(size: 12, weight: .semibold))
                }
            } compactTrailing: {
                Text("\(context.state.nextTrainMinutes)m")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundColor(colorForLine(context.attributes.lineId))
            } minimal: {
                Image(systemName: "tram.fill")
                    .foregroundColor(colorForLine(context.attributes.lineId))
            }
        }
    }
}

struct CommuteLiveActivityLockScreenView: View {
    let context: ActivityViewContext<CommuteActivityAttributes>
    
    var body: some View {
        HStack(spacing: 12) {
            // Accent Line indicator
            RoundedRectangle(cornerRadius: 3)
                .fill(colorForLine(context.attributes.lineId))
                .frame(width: 5, height: 48)
                
            VStack(alignment: .leading, spacing: 4) {
                Text(context.attributes.destinationStation)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                Text(context.state.lineStatus)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.6))
            }
            
            Spacer()
            
            VStack(alignment: .trailing, spacing: 4) {
                Text("\(context.state.nextTrainMinutes) min")
                    .font(.system(.title, design: .monospaced, weight: .bold))
                    .foregroundColor(.white)
                
                if context.state.followingTrainMinutes > 0 {
                    Text("Then: \(context.state.followingTrainMinutes)m")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                } else {
                    Text(context.attributes.lineName)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(Color(white: 0.1, opacity: 0.6))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
        .padding(.horizontal, 8)
    }
}

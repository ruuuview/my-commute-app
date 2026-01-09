import WidgetKit
import SwiftUI

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), lineStatus: "Central: Good Service", severity: 0)
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let entry = SimpleEntry(date: Date(), lineStatus: "Central: Severe Delays", severity: 6)
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app")
        let status = userDefaults?.string(forKey: "widget_line_status") ?? "No Data"
        let severity = userDefaults?.integer(forKey: "widget_severity") ?? 0

        let entry = SimpleEntry(date: Date(), lineStatus: status, severity: severity)
        
        // Refresh every 5 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 5, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let lineStatus: String
    let severity: Int
}

struct CommuteWidgetEntryView: View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var family
    
    // Logic: If severe (>=6), background becomes Red. Otherwise White.
    var isSevere: Bool { entry.severity >= 6 }
    var isMinor: Bool { entry.severity >= 3 && entry.severity < 6 }
    
    var backgroundColor: Color {
        if isSevere { return Color(red: 0.84, green: 0.0, blue: 0.08) } // Tube Red
        if isMinor { return Color(red: 1.0, green: 0.62, blue: 0.04) } // Warning Amber
        return Color.white // Good Service = Clean White
    }
    
    var textColor: Color {
        if isSevere { return .white }
        if isMinor { return .black }
        return .black
    }
    
    var secondaryTextColor: Color {
        if isSevere { return .white.opacity(0.8) }
        if isMinor { return .black.opacity(0.7) }
        return .gray
    }
    
    var statusDotColor: Color {
        if isSevere { return .white } // White dot on Red background
        if isMinor { return .black }
        return Color(red: 0.0, green: 0.5, blue: 0.0) // Green dot on White background
    }
    
    var lineName: String {
        let parts = entry.lineStatus.split(separator: ":", maxSplits: 1)
        return parts.first.map(String.init) ?? "My Commute"
    }
    
    var statusText: String {
        let parts = entry.lineStatus.split(separator: ":", maxSplits: 1)
        return parts.count > 1 ? String(parts[1]).trimmingCharacters(in: .whitespaces) : entry.lineStatus
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // HEADER
            HStack {
                Text("MY COMMUTE")
                    .font(.system(size: 9, weight: .heavy))
                    .foregroundColor(secondaryTextColor)
                    .tracking(1.0)
                Spacer()
                // Status Indicator
                Circle()
                    .fill(statusDotColor)
                    .frame(width: 8, height: 8)
                    .shadow(color: .black.opacity(0.1), radius: 2)
            }
            .padding(.bottom, 8)
            
            Spacer()
            
            // HERO CONTENT
            // Huge Line Name
            Text(lineName.uppercased())
                .font(.system(size: 22, weight: .black)) // Massive
                .foregroundColor(textColor)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            
            // Status Text
            Text(statusText)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(textColor)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .padding(.top, 2)
            
            Spacer()
            
            // FOOTER
            HStack {
                if isSevere {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.white)
                    Text("AVOID TRAVEL")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.white)
                } else {
                    Text("Updated:")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(secondaryTextColor)
                    Text(entry.date, style: .time)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(secondaryTextColor)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(backgroundColor)
        .containerBackground(for: .widget) {
            backgroundColor
        }
    }
}

@main
struct CommuteWidget: Widget {
    let kind: String = "CommuteWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            CommuteWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Live Status")
        .description("Bold alerts for your commute.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

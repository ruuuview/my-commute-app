import WidgetKit
import SwiftUI

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), lineStatus: "Loading...", severity: 0)
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let entry = SimpleEntry(date: Date(), lineStatus: "Central: Good Service", severity: 0)
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        // 1. READ DATA FROM APP GROUP
        let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app")
        let status = userDefaults?.string(forKey: "widget_line_status") ?? "No Data"
        let severity = userDefaults?.integer(forKey: "widget_severity") ?? 0

        let entry = SimpleEntry(date: Date(), lineStatus: status, severity: severity)
        
        // 2. REFRESH POLICY (5 mins)
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

struct CommuteWidgetEntryView : View {
    var entry: Provider.Entry

    // TRAFFIC LIGHT LOGIC
    var backgroundGradient: LinearGradient {
        let colors: [Color]
        if entry.severity >= 4 {
            colors = [Color(red: 0.89, green: 0.12, blue: 0.09), Color(red: 0.7, green: 0.1, blue: 0.08)] // RED
        } else if entry.severity == 3 {
            colors = [Color(red: 1.0, green: 0.83, blue: 0.0), Color(red: 0.9, green: 0.6, blue: 0.0)] // AMBER
        } else {
            colors = [Color(red: 0.16, green: 0.65, blue: 0.27), Color(red: 0.1, green: 0.5, blue: 0.2)] // GREEN
        }
        return LinearGradient(gradient: Gradient(colors: colors), startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    var body: some View {
        ZStack {
            backgroundGradient
            VStack(alignment: .leading) {
                Text("My Commute")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundColor(.white.opacity(0.8))
                Spacer()
                Text(entry.lineStatus)
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .multilineTextAlignment(.leading)
            }
            .padding()
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
        .configurationDisplayName("Commute Status")
        .description("View current status of your lines.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

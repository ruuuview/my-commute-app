import WidgetKit
import SwiftUI
import AppIntents

// --- 1. SHARED LOGIC ---
func calculateSeverityScore(_ status: String) -> Int {
    let lower = status.lowercased()
    if lower.contains("severe") || lower.contains("suspend") || lower.contains("closure") || lower.contains("closed") { return 2 }
    if lower.contains("minor") || lower.contains("delay") || lower.contains("busy") { return 1 }
    return 0
}

// BULLETPROOF DATA MODEL: Made values optional so Swift won't crash if a key is missing
struct CommuteLine: Codable, Identifiable {
    let id: String?
    let name: String?
    let status: String?
    let status_severity: Int?
    let severity: Int?
    let lastUpdated: TimeInterval?
}

// --- 2. INTENT ---
@available(iOS 16.0, *)
struct RefreshIntent: AppIntent {
    static var title: LocalizedStringResource = "Refresh"
    func perform() async throws -> some IntentResult {
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// --- 3. TIMELINE PROVIDER (The X-Ray Engine) ---
struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), lines: [], debugMsg: "Loading...")
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        completion(SimpleEntry(date: Date(), lines: [], debugMsg: "Snapshot"))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        var lines: [CommuteLine] = []
        var debugMsg = "No Data"
        
        // X-RAY CHECKS
        if let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") {
            if let jsonString = userDefaults.string(forKey: "myLines") {
                if let data = jsonString.data(using: .utf8) {
                    do {
                        lines = try JSONDecoder().decode([CommuteLine].self, from: data)
                        debugMsg = "Success: \(lines.count) lines"
                    } catch {
                        // THIS WILL PRINT THE EXACT REASON SWIFT IS CRASHING
                        debugMsg = "Decode Error: \(error.localizedDescription)"
                    }
                }
            } else {
                debugMsg = "RN didn't save data to App Group"
            }
        } else {
            debugMsg = "App Group Entitlement Missing"
        }
        
        let sortedLines = lines.sorted { calculateSeverityScore($0.status ?? "") > calculateSeverityScore($1.status ?? "") }
        let entry = SimpleEntry(date: Date(), lines: sortedLines, debugMsg: debugMsg)
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(900))))
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let lines: [CommuteLine]
    let debugMsg: String
}

// --- 4. THE VIEW ---
struct CommuteWidgetEntryView : View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        GeometryReader { geo in
            let firstLine = entry.lines.first
            let statusText = firstLine?.status ?? "Unknown"
            let severityScore = calculateSeverityScore(statusText)
            let baseColor = getTrafficLightColor(score: severityScore)
            
            ZStack {
                Color.black.edgesIgnoringSafeArea(.all)
                LinearGradient(gradient: Gradient(colors: [baseColor, baseColor.opacity(0.6)]), startPoint: .topLeading, endPoint: .bottomTrailing)
                    .edgesIgnoringSafeArea(.all)
                
                if family == .systemMedium {
                    HStack(spacing: 0) {
                        if let line = firstLine {
                            HeroContent(line: line)
                                .frame(width: geo.size.width * 0.50)
                        } else {
                            // PASS THE ERROR MESSAGE TO THE SCREEN
                            EmptyStateView(msg: entry.debugMsg).frame(width: geo.size.width * 0.50)
                        }
                        
                        Rectangle().fill(Color.white.opacity(0.3)).frame(width: 1).edgesIgnoringSafeArea(.vertical)
                        
                        VStack(alignment: .leading, spacing: 0) {
                            Text("OTHER LINES").font(.system(size: 8, weight: .bold)).opacity(0.7).foregroundColor(.white).padding(.leading, 10).padding(.top, 12).padding(.bottom, 4)
                            let otherLines = Array(entry.lines.dropFirst().prefix(4))
                            
                            if otherLines.isEmpty {
                                Spacer()
                                Text("No extra lines").font(.caption2).foregroundColor(.white.opacity(0.5)).frame(maxWidth: .infinity, alignment: .center)
                                Spacer()
                            } else {
                                ForEach(otherLines, id: \.id) { line in
                                    HStack(spacing: 5) {
                                        Image(systemName: "circle.fill").font(.system(size: 6)).foregroundColor(.white)
                                        Text(line.name ?? "Line").font(.system(size: 11, weight: .bold)).foregroundColor(.white).lineLimit(1)
                                        Spacer()
                                    }.padding(.horizontal, 10).padding(.vertical, 3)
                                }
                                Spacer()
                            }
                        }.frame(width: geo.size.width * 0.50)
                    }
                } else {
                    if let line = firstLine { HeroContent(line: line) } else { EmptyStateView(msg: entry.debugMsg) }
                }
            }
        }
    }
    
    func getTrafficLightColor(score: Int) -> Color {
        let isDark = colorScheme == .dark
        if score >= 2 { return isDark ? Color(red: 0.7, green: 0.15, blue: 0.15) : Color(red: 0.85, green: 0.2, blue: 0.2) }
        if score == 1 { return isDark ? Color(red: 0.85, green: 0.55, blue: 0.0) : Color(red: 1.0, green: 0.65, blue: 0.0) }
        return isDark ? Color(red: 0.18, green: 0.55, blue: 0.25) : Color(red: 0.25, green: 0.7, blue: 0.3)
    }
}

struct HeroContent: View {
    let line: CommuteLine
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("PRIORITY").font(.system(size: 10, weight: .black)).opacity(0.7).foregroundColor(.white)
            Spacer()
            Text((line.name ?? "Unknown").uppercased()).font(.system(size: 24, weight: .black)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.6)
            Text(line.status ?? "Status Unknown").font(.system(size: 14, weight: .bold)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.8).padding(.top, 4)
            Spacer()
        }.padding(14)
    }
}

// X-RAY DEBUG SCREEN
struct EmptyStateView: View {
    var msg: String
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "ladybug.fill").font(.title2).foregroundColor(.yellow)
            Text(msg).font(.system(size: 9, weight: .medium)).foregroundColor(.white).multilineTextAlignment(.center).padding(.horizontal, 4)
        }
    }
}

@main
struct CommuteWidget: Widget {
    let kind: String = "CommuteWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in CommuteWidgetEntryView(entry: entry) }
        .configurationDisplayName("My Commute")
        .description("Live status with Refresh.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
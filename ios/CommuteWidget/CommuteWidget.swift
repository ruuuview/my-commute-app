import WidgetKit
import SwiftUI
import AppIntents

// --- 1. SHARED LOGIC & UI HELPERS ---
func calculateSeverityScore(_ status: String) -> Int {
    let lower = status.lowercased()
    if lower.contains("severe") || lower.contains("suspend") || lower.contains("closure") || lower.contains("closed") { return 2 }
    if lower.contains("minor") || lower.contains("delay") || lower.contains("busy") { return 1 }
    return 0
}

func getStatusIcon(score: Int) -> String {
    if score >= 2 { return "xmark.octagon.fill" }
    if score == 1 { return "exclamationmark.triangle.fill" }
    return "checkmark.circle.fill"
}

func getTrafficLightColor(score: Int) -> Color {
    if score >= 2 { return Color(red: 0.85, green: 0.2, blue: 0.2) } // Red
    if score == 1 { return Color(red: 1.0, green: 0.65, blue: 0.0) } // Amber
    return Color(red: 0.25, green: 0.7, blue: 0.3)                   // Green
}

struct CommuteLine: Codable, Identifiable {
    let id: String?
    let name: String?
    var status: String?
    var status_severity: Int?
    let severity: Int?
    var lastUpdated: TimeInterval?
}

// --- 2. THE REFRESH BUTTON INTENT ---
@available(iOS 16.0, *)
struct RefreshIntent: AppIntent {
    static var title: LocalizedStringResource = "Refresh Commute"
    func perform() async throws -> some IntentResult {
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// --- 3. THE ENGINE (Live Native Fetch) ---
func fetchLiveTfLData(ids: String) async -> [String: String]? {
    guard let url = URL(string: "https://api.tfl.gov.uk/Line/\(ids)/Status") else { return nil }
    do {
        let (data, _) = try await URLSession.shared.data(from: url)
        if let jsonArray = try JSONSerialization.jsonObject(with: data, options: []) as? [[String: Any]] {
            var statusMap: [String: String] = [:]
            for item in jsonArray {
                if let id = item["id"] as? String,
                   let statuses = item["lineStatuses"] as? [[String: Any]],
                   let firstStatus = statuses.first,
                   let statusDesc = firstStatus["statusSeverityDescription"] as? String {
                    statusMap[id.lowercased()] = statusDesc
                }
            }
            return statusMap
        }
    } catch { }
    return nil
}

// --- 4. TIMELINE PROVIDER ---
struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry { SimpleEntry(date: Date(), lines: []) }
    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) { completion(SimpleEntry(date: Date(), lines: [])) }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        Task {
            var lines: [CommuteLine] = []
            
            if let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app"),
               let jsonString = userDefaults.string(forKey: "myLines"),
               let data = jsonString.data(using: .utf8),
               let cachedLines = try? JSONDecoder().decode([CommuteLine].self, from: data) {
                lines = cachedLines
            }
            
            let validIds = lines.compactMap { $0.id?.lowercased() }.filter { !$0.isEmpty }
            if !validIds.isEmpty {
                let idsString = validIds.joined(separator: ",")
                if let liveStatuses = await fetchLiveTfLData(ids: idsString) {
                    for i in 0..<lines.count {
                        if let id = lines[i].id?.lowercased(), let liveStatus = liveStatuses[id] {
                            lines[i].status = liveStatus
                        }
                    }
                }
            }
            
            let sortedLines = lines.sorted { calculateSeverityScore($0.status ?? "") > calculateSeverityScore($1.status ?? "") }
            
            let entry = SimpleEntry(date: Date(), lines: sortedLines)
            completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(300))))
        }
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let lines: [CommuteLine]
}

// --- 5. THE VIEW ---
struct CommuteWidgetEntryView : View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var family

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
                        // LEFT SIDE
                        if let line = firstLine {
                            HeroContent(line: line, timestamp: entry.date).frame(width: geo.size.width * 0.50)
                        } else {
                            EmptyStateView().frame(width: geo.size.width * 0.50)
                        }
                        
                        Rectangle().fill(Color.white.opacity(0.3)).frame(width: 1).edgesIgnoringSafeArea(.vertical)
                        
                        // RIGHT SIDE (OTHER LINES)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("OTHER LINES").font(.system(size: 8, weight: .bold)).opacity(0.7).foregroundColor(.white).padding(.leading, 10).padding(.top, 12).padding(.bottom, 6)
                            let otherLines = Array(entry.lines.dropFirst().prefix(4))
                            
                            if otherLines.isEmpty {
                                Spacer()
                                Text("Add lines in App").font(.caption2).foregroundColor(.white.opacity(0.5)).frame(maxWidth: .infinity, alignment: .center)
                                Spacer()
                            } else {
                                ForEach(otherLines, id: \.id) { line in
                                    HStack(spacing: 8) {
                                        let score = calculateSeverityScore(line.status ?? "")
                                        
                                        // THE HIGHLIGHTED ICON BADGE
                                        ZStack {
                                            Circle().fill(Color.white).frame(width: 18, height: 18)
                                            Image(systemName: getStatusIcon(score: score))
                                                .font(.system(size: 10, weight: .black))
                                                .foregroundColor(getTrafficLightColor(score: score))
                                        }
                                        
                                        // STACKED TEXT
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(line.name ?? "Line")
                                                .font(.system(size: 11, weight: .bold))
                                                .foregroundColor(.white)
                                                .lineLimit(1)
                                            Text(line.status ?? "Unknown")
                                                .font(.system(size: 9, weight: .medium))
                                                .foregroundColor(.white.opacity(0.9))
                                                .lineLimit(1)
                                        }
                                        Spacer()
                                    }.padding(.horizontal, 10).padding(.vertical, 4)
                                }
                                Spacer()
                            }
                        }.frame(width: geo.size.width * 0.50)
                    }
                } else {
                    if let line = firstLine { HeroContent(line: line, timestamp: entry.date) } else { EmptyStateView() }
                }
            }
        }
        .modifier(ContainerBackgroundModifier())
    }
}

struct HeroContent: View {
    let line: CommuteLine
    let timestamp: Date
    var body: some View {
        let score = calculateSeverityScore(line.status ?? "")
        VStack(alignment: .leading, spacing: 0) {
            
            // TOP ROW: PRIORITY TEXT + REFRESH BUTTON
            HStack {
                Text("PRIORITY").font(.system(size: 10, weight: .black)).opacity(0.7).foregroundColor(.white)
                Spacer()
                
                if #available(iOS 17.0, *) {
                    Button(intent: RefreshIntent()) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.white)
                            .padding(6)
                            .background(Color.white.opacity(0.25))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }
            }
            
            Spacer()
            
            Text((line.name ?? "Unknown").uppercased()).font(.system(size: 24, weight: .black)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.6).shadow(radius: 2)
            
            HStack(spacing: 6) {
                // HIGHLIGHTED ICON BADGE FOR MAIN LINE
                ZStack {
                    Circle().fill(Color.white).frame(width: 22, height: 22)
                    Image(systemName: getStatusIcon(score: score))
                        .font(.system(size: 12, weight: .black))
                        .foregroundColor(getTrafficLightColor(score: score))
                }
                
                Text(line.status ?? "Status Unknown").font(.system(size: 14, weight: .bold)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.8).shadow(radius: 1)
            }.padding(.top, 6)
            
            Spacer()
            Text("Updated: " + getTimeText(date: timestamp)).font(.system(size: 9, weight: .bold)).foregroundColor(.white.opacity(0.6))
        }.padding(14)
    }
    
    func getTimeText(date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}

struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "tram.fill").font(.title2).foregroundColor(.white.opacity(0.6))
            Text("Loading...").font(.system(size: 9, weight: .medium)).foregroundColor(.white)
        }
    }
}

struct ContainerBackgroundModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(for: .widget) { Color.clear }
        } else {
            content
        }
    }
}

@main
struct CommuteWidget: Widget {
    let kind: String = "CommuteWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in CommuteWidgetEntryView(entry: entry) }
        .configurationDisplayName("My Commute")
        .description("Live TfL status.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .disableContentMarginsIfAvailable() 
    }
}

extension WidgetConfiguration {
    func disableContentMarginsIfAvailable() -> some WidgetConfiguration {
        if #available(iOS 17.0, *) {
            return self.contentMarginsDisabled()
        } else {
            return self
        }
    }
}
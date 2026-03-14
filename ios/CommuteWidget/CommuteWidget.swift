import WidgetKit
import SwiftUI
import AppIntents

// --- 1. SHARED LOGIC (The Brain) ---
// Global function so both the Button and View agree on colors
func calculateSeverityScore(_ status: String) -> Int {
    let lower = status.lowercased()
    if lower.contains("severe") || lower.contains("suspend") || lower.contains("closure") || lower.contains("closed") {
        return 2 // Red
    }
    if lower.contains("minor") || lower.contains("delay") || lower.contains("busy") {
        return 1 // Amber
    }
    return 0 // Green
}

// Data Model
struct CommuteLine: Codable, Identifiable {
    let id: String
    let name: String
    let status: String
    let status_severity: Int
    let lastUpdated: TimeInterval? 
}

// --- 2. THE CHEAT CODE BUTTON (Interactive Intent) ---
@available(iOS 16.0, *)
struct RefreshIntent: AppIntent {
    static var title: LocalizedStringResource = "Refresh Commute"
    
    func perform() async throws -> some IntentResult {
        // A. Read Cached IDs (To know what to fetch)
        if let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app"),
           let jsonString = userDefaults.string(forKey: "myLines"),
           let data = jsonString.data(using: .utf8),
           let cachedLines = try? JSONDecoder().decode([CommuteLine].self, from: data) {
            
            let ids = cachedLines.map { $0.id }.joined(separator: ",")
            
            // B. NATIVE SWIFT FETCH (Direct to TfL)
            if let freshLines = await fetchTfLData(ids: ids) {
                // Merge fresh status with cached names
                let updatedLines = cachedLines.map { cached -> CommuteLine in
                    if let fresh = freshLines.first(where: { $0.id == cached.id }) {
                        let newScore = calculateSeverityScore(fresh.status)
                        return CommuteLine(
                            id: cached.id,
                            name: cached.name,
                            status: fresh.status,
                            status_severity: newScore, 
                            lastUpdated: Date().timeIntervalSince1970
                        )
                    }
                    return cached
                }
                
                // C. Save Updates
                if let newData = try? JSONEncoder().encode(updatedLines),
                   let newJson = String(data: newData, encoding: .utf8) {
                    userDefaults.set(newJson, forKey: "myLines")
                    userDefaults.synchronize()
                }
            }
        }
        
        // D. Reload UI
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// --- 3. SWIFT NETWORK LAYER (The Engine) ---
func fetchTfLData(ids: String) async -> [CommuteLine]? {
    guard let url = URL(string: "https://api.tfl.gov.uk/Line/\(ids)/Status") else { return nil }
    
    do {
        let (data, _) = try await URLSession.shared.data(from: url)
        if let jsonArray = try JSONSerialization.jsonObject(with: data, options: []) as? [[String: Any]] {
            var lines: [CommuteLine] = []
            for item in jsonArray {
                if let id = item["id"] as? String,
                   let statuses = item["lineStatuses"] as? [[String: Any]],
                   let firstStatus = statuses.first,
                   let statusDesc = firstStatus["statusSeverityDescription"] as? String {
                    lines.append(CommuteLine(id: id, name: "", status: statusDesc, status_severity: 0, lastUpdated: 0))
                }
            }
            return lines
        }
    } catch {
        print("Widget Network Error: \(error)")
    }
    return nil
}

// --- 4. TIMELINE PROVIDER ---
struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), lines: [], debugMsg: "")
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let entry = SimpleEntry(date: Date(), lines: [], debugMsg: "")
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        var lines: [CommuteLine] = []
        if let userDefaults = UserDefaults(suiteName: "group.com.mycommute.app") {
            let jsonString = userDefaults.string(forKey: "myLines") ?? ""
            if let data = jsonString.data(using: .utf8) {
                let decoder = JSONDecoder()
                if let decoded = try? decoder.decode([CommuteLine].self, from: data) {
                    lines = decoded
                }
            }
        }
        
        // SMART SORT: Worst lines (Red) > Minor (Amber) > Good (Green)
        let sortedLines = lines.sorted { calculateSeverityScore($0.status) > calculateSeverityScore($1.status) }
        
        let entry = SimpleEntry(date: Date(), lines: sortedLines, debugMsg: "")
        let refreshDate = Date().addingTimeInterval(900) // 15 min auto-refresh fallback
        let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
        completion(timeline)
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let lines: [CommuteLine]
    let debugMsg: String
}

// --- 5. THE VIEW (UI) ---
struct CommuteWidgetEntryView : View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        GeometryReader { geo in
            let firstLine = entry.lines.first
            let statusText = firstLine?.status ?? ""
            let severityScore = calculateSeverityScore(statusText)
            
            let rawTimestamp = firstLine?.lastUpdated ?? 0
            let lastUpdateDate = Date(timeIntervalSince1970: rawTimestamp / 1000)
            let baseColor = getTrafficLightColor(score: severityScore)
            
            ZStack {
                Color.black.edgesIgnoringSafeArea(.all)
                LinearGradient(
                    gradient: Gradient(colors: [baseColor, baseColor.opacity(0.6)]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .edgesIgnoringSafeArea(.all)
                
                if family == .systemMedium {
                    HStack(spacing: 0) {
                        // LEFT: HERO (Main Line)
                        if let line = firstLine {
                            HeroContent(line: line, lastUpdate: lastUpdateDate)
                                .frame(width: geo.size.width * 0.50)
                        } else {
                            EmptyStateView().frame(width: geo.size.width * 0.50)
                        }
                        
                        Rectangle().fill(Color.white.opacity(0.3)).frame(width: 1).edgesIgnoringSafeArea(.vertical)
                        
                        // RIGHT: COMPACT LIST (Fits 4 lines)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("OTHER LINES")
                                .font(.system(size: 8, weight: .bold))
                                .opacity(0.7)
                                .foregroundColor(.white)
                                .padding(.leading, 10).padding(.top, 12).padding(.bottom, 4)
                            
                            let otherLines = Array(entry.lines.dropFirst().prefix(4))
                            
                            if otherLines.isEmpty {
                                Spacer()
                                Text("Add lines in App")
                                    .font(.caption2)
                                    .foregroundColor(.white.opacity(0.5))
                                    .frame(maxWidth: .infinity, alignment: .center)
                                Spacer()
                            } else {
                                ForEach(otherLines) { line in
                                    HStack(spacing: 5) {
                                        let lineScore = calculateSeverityScore(line.status)
                                        Image(systemName: getStatusIcon(score: lineScore))
                                            .font(.system(size: 9, weight: .black))
                                            .foregroundColor(.white)
                                        
                                        VStack(alignment: .leading, spacing: 0) {
                                            Text(line.name)
                                                .font(.system(size: 11, weight: .bold))
                                                .foregroundColor(.white)
                                                .lineLimit(1)
                                            Text(line.status)
                                                .font(.system(size: 9, weight: .medium))
                                                .foregroundColor(.white.opacity(0.9))
                                                .lineLimit(1)
                                        }
                                        Spacer()
                                    }
                                    .padding(.horizontal, 10).padding(.vertical, 3)
                                }
                                Spacer()
                            }
                        }
                        .frame(width: geo.size.width * 0.50)
                    }
                } else {
                    if let line = firstLine { HeroContent(line: line, lastUpdate: lastUpdateDate) } else { EmptyStateView() }
                }
            }
        }
    }
    
    // --- UI HELPERS ---
    func getStatusIcon(score: Int) -> String {
        if score >= 2 { return "xmark.octagon.fill" }
        if score == 1 { return "exclamationmark.triangle.fill" }
        return "checkmark.circle.fill"
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
    let lastUpdate: Date

    var body: some View {
        let score = calculateSeverityScore(line.status)
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("PRIORITY")
                    .font(.system(size: 10, weight: .black))
                    .opacity(0.7)
                Spacer()
                
                // --- THE REFRESH BUTTON ---
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
            .padding(.bottom, 8)
            .foregroundColor(.white)
            
            Spacer()
            
            Text(line.name.uppercased())
                .font(.system(size: 24, weight: .black))
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .shadow(color: .black.opacity(0.2), radius: 2, x: 0, y: 2)
            
            HStack(spacing: 5) {
                Image(systemName: getStatusIcon(score: score))
                    .font(.system(size: 14, weight: .black))
                    .foregroundColor(.white)
                    .shadow(radius: 2)
                
                Text(line.status)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .shadow(color: .black.opacity(0.2), radius: 1, x: 1, y: 1)
            }
            .padding(.top, 4)
            
            Spacer()
            
            Text(getTimeText(date: lastUpdate))
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(.white.opacity(0.6))
        }
        .padding(14)
    }
    
    func getStatusIcon(score: Int) -> String {
        if score >= 2 { return "xmark.octagon.fill" }
        if score == 1 { return "exclamationmark.triangle.fill" }
        return "checkmark.circle.fill"
    }
    
    func getTimeText(date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return "Updated: " + formatter.string(from: date)
    }
}

struct EmptyStateView: View {
    var body: some View {
        VStack {
            Image(systemName: "exclamationmark.triangle.fill").font(.largeTitle).foregroundColor(.white.opacity(0.5))
            Text("No Line").font(.headline).bold().foregroundColor(.white)
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
        .configurationDisplayName("My Commute")
        .description("Live status with Refresh.")
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
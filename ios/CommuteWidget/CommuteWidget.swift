import WidgetKit
import SwiftUI
import AppIntents

// ============================================================
// MARK: - BRIDGE MODEL
// ============================================================
struct SavedLine: Codable {
    let id: String
    let name: String
}

// ============================================================
// MARK: - INTERNAL MODEL
// ============================================================
struct CommuteLine: Identifiable {
    let id: String
    let name: String
    let status: String
    let severity: Int 
    
    var level: SeverityLevel {
        switch severity {
        case 10...:  return .good
        case 7...9:  return .minor
        default:     return .severe // Catches 6 (Suspended) and 20 (Not Running)
        }
    }
}

enum SeverityLevel {
    case good, minor, severe
    
    var gradientColors: [Color] {
        switch self {
        case .good:   return [Color(red: 0.06, green: 0.45, blue: 0.22), Color(red: 0.03, green: 0.25, blue: 0.12)]
        case .minor:  return [Color(red: 1.00, green: 0.82, blue: 0.10), Color(red: 0.90, green: 0.65, blue: 0.00)]
        case .severe: return [Color(red: 0.56, green: 0.08, blue: 0.08), Color(red: 0.32, green: 0.04, blue: 0.04)]
        }
    }
    
    var iconColor: Color {
        switch self {
        case .good:   return Color(red: 0.13, green: 0.65, blue: 0.30)
        case .minor:  return Color(red: 0.85, green: 0.55, blue: 0.00)
        case .severe: return Color(red: 0.85, green: 0.15, blue: 0.15)
        }
    }
    
    // WCAG Contrast Fixes
    var textColor: Color {
        switch self {
        case .good, .severe: return .white
        case .minor:         return Color(red: 0.15, green: 0.10, blue: 0.00) // Near-black for yellow background
        }
    }
    
    var secondaryTextColor: Color {
        switch self {
        case .good, .severe: return .white.opacity(0.80)
        case .minor:         return Color(red: 0.25, green: 0.15, blue: 0.00).opacity(0.85)
        }
    }
    
    var dividerColor: Color {
        switch self {
        case .good, .severe: return .white.opacity(0.3)
        case .minor:         return Color.black.opacity(0.15)
        }
    }
}

// ============================================================
// MARK: - TFL API RESPONSE MODELS
// ============================================================
struct TfLLine: Decodable {
    let id: String
    let lineStatuses: [TfLStatus]
}

struct TfLStatus: Decodable {
    let statusSeverity: Int
    let statusSeverityDescription: String
}

// ============================================================
// MARK: - TIMELINE ENTRY
// ============================================================
struct CommuteEntry: TimelineEntry {
    let date: Date
    let lines: [CommuteLine]
    let debugMessage: String?
    
    // ⚠️ MAINTAINABILITY NOTE: TfL's severity scale is INVERTED.
    // 0 is "Special Service" / 6 is "Suspended" / 10 is "Good Service".
    // Therefore, using .min() correctly finds the WORST active delay.
    var worstLine: CommuteLine? {
        lines.min(by: { $0.severity < $1.severity })
    }
    
    var otherLines: [CommuteLine] {
        guard let worst = worstLine else { return [] }
        return lines.filter { $0.id != worst.id }
    }
    
    var overallLevel: SeverityLevel {
        worstLine?.level ?? .good
    }
}

// ============================================================
// MARK: - APP GROUP CONFIG & PROVIDER
// ============================================================
private let kAppGroupID = "group.com.mycommute.app"

struct CommuteProvider: TimelineProvider {
    func placeholder(in context: Context) -> CommuteEntry {
        CommuteEntry(date: Date(), lines: [], debugMessage: nil)
    }
    
    func getSnapshot(in context: Context, completion: @escaping (CommuteEntry) -> Void) {
        Task { completion(await buildEntry()) }
    }
    
    func getTimeline(in context: Context, completion: @escaping (Timeline<CommuteEntry>) -> Void) {
        Task {
            let entry = await buildEntry()
            let refresh = Calendar.current.date(byAdding: .minute, value: 5, to: Date())!
            completion(Timeline(entries: [entry], policy: .after(refresh)))
        }
    }
    
    private func buildEntry() async -> CommuteEntry {
        let savedLines: [SavedLine]
        do {
            savedLines = try readSavedLines()
        } catch {
            return CommuteEntry(date: Date(), lines: [], debugMessage: "BRIDGE ERROR:\n\(error.localizedDescription)")
        }
        
        guard !savedLines.isEmpty else {
            return CommuteEntry(date: Date(), lines: [], debugMessage: "Open the app to save your commute lines.")
        }
        
        do {
            let commuteLines = try await fetchTfLStatus(for: savedLines)
            return CommuteEntry(date: Date(), lines: commuteLines, debugMessage: nil)
        } catch {
            return CommuteEntry(date: Date(), lines: [], debugMessage: "TFL API ERROR:\n\(error.localizedDescription)")
        }
    }
    
    private func readSavedLines() throws -> [SavedLine] {
        guard let userDefaults = UserDefaults(suiteName: kAppGroupID) else { throw WidgetError.appGroupUnavailable }
        guard let jsonString = userDefaults.string(forKey: "myLines") else { throw WidgetError.fileNotFound }
        guard let data = jsonString.data(using: .utf8) else { throw WidgetError.decodingFailed("String to UTF-8 failed") }

        do {
            return try JSONDecoder().decode([SavedLine].self, from: data)
        } catch let error as DecodingError {
            switch error {
            case .keyNotFound(let key, let ctx): throw WidgetError.decodingFailed("Missing key '\(key.stringValue)' at \(ctx.codingPath)")
            case .typeMismatch(let type, let ctx): throw WidgetError.decodingFailed("Type mismatch: expected \(type) at \(ctx.codingPath)")
            case .valueNotFound(let type, let ctx): throw WidgetError.decodingFailed("Null value: expected \(type) at \(ctx.codingPath)")
            case .dataCorrupted(let ctx): throw WidgetError.decodingFailed("Corrupted JSON: \(ctx.debugDescription)")
            @unknown default: throw error
            }
        }
    }
    
    private func fetchTfLStatus(for savedLines: [SavedLine]) async throws -> [CommuteLine] {
        let ids = savedLines.map(\.id).joined(separator: ",")
        guard let url = URL(string: "https://api.tfl.gov.uk/Line/\(ids)/Status") else { throw WidgetError.invalidURL }
        
        let (data, _) = try await URLSession.shared.data(from: url)
        let response  = try JSONDecoder().decode([TfLLine].self, from: data)
        
        return response.compactMap { tflLine in
            guard let saved  = savedLines.first(where: { $0.id == tflLine.id }),
                  let status = tflLine.lineStatuses.first else { return nil }
            return CommuteLine(id: tflLine.id, name: saved.name, status: status.statusSeverityDescription, severity: status.statusSeverity)
        }
    }
}

// ============================================================
// MARK: - ERRORS & INTENTS
// ============================================================
enum WidgetError: LocalizedError {
    case appGroupUnavailable, fileNotFound, invalidURL, decodingFailed(String)
    var errorDescription: String? {
        switch self {
        case .appGroupUnavailable:     return "App Group container not found."
        case .fileNotFound:            return "Data missing.\nOpen the app first."
        case .invalidURL:              return "Could not build TfL API URL."
        case .decodingFailed(let msg): return msg
        }
    }
}

@available(iOS 16.0, *)
struct RefreshCommuteIntent: AppIntent {
    static var title: LocalizedStringResource = "Refresh Commute Status"
    func perform() async throws -> some IntentResult {
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// ============================================================
// MARK: - VIEWS
// ============================================================
struct CommutePremiumEntryView: View {
    var entry: CommuteEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        ZStack {
            LinearGradient(colors: entry.overallLevel.gradientColors, startPoint: .topLeading, endPoint: .bottomTrailing)
            Group {
                if let msg = entry.debugMessage { 
                    DebugView(message: msg, theme: entry.overallLevel) 
                } 
                else if entry.lines.isEmpty { 
                    EmptyStateView(theme: entry.overallLevel) 
                } 
                else {
                    if family == .systemSmall, let worst = entry.worstLine {
                        SmallPriorityView(line: worst, theme: entry.overallLevel, timestamp: entry.date)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        DashboardView(entry: entry, theme: entry.overallLevel)
                    }
                }
            }
        }
        .modifier(ContainerBackgroundModifier())
    }
}

// --- MEDIUM WIDGET LAYOUT ---
struct DashboardView: View {
    let entry: CommuteEntry
    let theme: SeverityLevel
    
    var body: some View {
        HStack(spacing: 0) {
            if let worst = entry.worstLine { 
                PriorityView(line: worst, theme: theme).frame(maxWidth: .infinity, maxHeight: .infinity) 
            }
            
            Rectangle()
                .fill(theme.dividerColor)
                .frame(width: 1)
                .padding(.vertical, 16)
            
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Spacer()
                    if #available(iOS 17.0, *) {
                        Button(intent: RefreshCommuteIntent()) {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(theme.secondaryTextColor)
                        }.buttonStyle(.plain)
                    }
                }.padding(.trailing, 12).padding(.top, 10)
                
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(entry.otherLines.prefix(4)) { line in LineRowView(line: line, theme: theme) }
                }.padding(.leading, 12).padding(.top, 4)
                Spacer()
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }.padding(.horizontal, 4)
    }
}

// --- MEDIUM WIDGET LEFT SIDE ---
struct PriorityView: View {
    let line: CommuteLine
    let theme: SeverityLevel
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("PRIORITY").font(.system(size: 9, weight: .bold)).tracking(1.8).foregroundColor(theme.secondaryTextColor)
            Spacer()
            StatusIcon(level: line.level, size: 36)
            Text(line.name).font(.system(size: 16, weight: .bold)).foregroundColor(theme.textColor).lineLimit(1).minimumScaleFactor(0.7).padding(.top, 2)
            Text(line.status).font(.system(size: 11, weight: .semibold)).foregroundColor(theme.secondaryTextColor).lineLimit(2).minimumScaleFactor(0.75).fixedSize(horizontal: false, vertical: true)
        }.padding(.leading, 14).padding(.vertical, 16).frame(maxHeight: .infinity, alignment: .leading)
    }
}

// --- SMALL WIDGET ---
struct SmallPriorityView: View {
    let line: CommuteLine
    let theme: SeverityLevel
    let timestamp: Date
    
    var body: some View {
        VStack(alignment: .center, spacing: 6) {
            Text("PRIORITY").font(.system(size: 9, weight: .bold)).tracking(1.8).foregroundColor(theme.secondaryTextColor)
            Spacer().frame(height: 2)
            StatusIcon(level: line.level, size: 40)
            Spacer().frame(height: 2)
            Text(line.name).font(.system(size: 16, weight: .bold)).foregroundColor(theme.textColor).lineLimit(1).minimumScaleFactor(0.7)
            Text(line.status).font(.system(size: 11, weight: .semibold)).foregroundColor(theme.secondaryTextColor).multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.75)
            
            Text(getTimeText(date: timestamp)).font(.system(size: 8, weight: .bold)).foregroundColor(theme.secondaryTextColor).padding(.top, 2)
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
    
    func getTimeText(date: Date) -> String {
        let formatter = DateFormatter(); formatter.dateFormat = "HH:mm"; return formatter.string(from: date)
    }
}

struct LineRowView: View {
    let line: CommuteLine
    let theme: SeverityLevel
    
    var body: some View {
        HStack(spacing: 8) {
            StatusIcon(level: line.level, size: 20)
            VStack(alignment: .leading, spacing: 1) {
                Text(line.name).font(.system(size: 12, weight: .bold)).foregroundColor(theme.textColor).lineLimit(1)
                Text(line.status).font(.system(size: 10, weight: .medium)).foregroundColor(theme.secondaryTextColor).lineLimit(1)
            }
        }
    }
}

struct StatusIcon: View {
    let level: SeverityLevel
    let size: CGFloat
    var iconName: String {
        switch level { case .good: return "checkmark"; case .minor: return "triangle.fill"; case .severe: return "octagon.fill" }
    }
    var body: some View {
        ZStack {
            Circle().fill(Color.white).frame(width: size, height: size)
            Image(systemName: iconName).font(.system(size: size * 0.38, weight: .black)).foregroundColor(level.iconColor)
        }
    }
}

struct DebugView: View {
    let message: String
    let theme: SeverityLevel
    
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundColor(.yellow).font(.title3)
            Text(message).font(.system(size: 9, weight: .medium, design: .monospaced)).foregroundColor(theme.textColor).multilineTextAlignment(.center).padding(.horizontal, 10)
        }
    }
}

struct EmptyStateView: View {
    let theme: SeverityLevel
    
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "tram.fill").font(.title2).foregroundColor(theme.secondaryTextColor)
            Text("Open My Commute to\nsync your saved lines").font(.system(size: 11)).foregroundColor(theme.secondaryTextColor).multilineTextAlignment(.center)
        }
    }
}

struct ContainerBackgroundModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) { content.containerBackground(for: .widget) { Color.clear } } else { content }
    }
}

@main
struct CommutePremiumWidget: Widget {
    let kind = "CommutePremiumWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CommuteProvider()) { entry in CommutePremiumEntryView(entry: entry) }
        .configurationDisplayName("My Commute")
        .description("Live TfL status, colour-coded by your worst delay.")
        .supportedFamilies([.systemSmall, .systemMedium]) 
        .disableContentMarginsIfAvailable()
    }
}

extension WidgetConfiguration {
    func disableContentMarginsIfAvailable() -> some WidgetConfiguration {
        if #available(iOS 17.0, *) { return self.contentMarginsDisabled() } else { return self }
    }
}
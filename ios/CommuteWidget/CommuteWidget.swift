
import WidgetKit
import SwiftUI
import AppIntents

// ============================================================
// MARK: - METRICS CONSTANTS
// ============================================================
struct WidgetMetrics {
    static let headerFontSize: CGFloat  = 9
    static let footerFontSize: CGFloat  = 8
    static let lineNameMedium: CGFloat  = 18
    static let lineStatusMedium: CGFloat = 12
    static let lineNameSmall: CGFloat   = 16
    static let lineStatusSmall: CGFloat = 11
    static let iconSizeMedium: CGFloat  = 42
    static let iconSizeSmall: CGFloat   = 38
    static let iconLineRow: CGFloat     = 20
    
    // 🚨 Updated to 120 seconds for Production (Phase 1.6)
    static let staleThreshold: TimeInterval = 120
}

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
        case ...2:  return .good
        case 3...5: return .minor
        case 6...9: return .severe
        default:    return .suspended
        }
    }
}

enum SeverityLevel {
    case good, minor, severe, suspended

    var gradientColors: [Color] {
        switch self {
        case .good:   return [Color(red: 0.06, green: 0.45, blue: 0.22), Color(red: 0.03, green: 0.25, blue: 0.12)]
        case .minor:  return [Color(red: 1.00, green: 0.82, blue: 0.10), Color(red: 0.90, green: 0.65, blue: 0.00)]
        case .severe: return [Color(red: 0.90, green: 0.36, blue: 0.00), Color(red: 0.70, green: 0.20, blue: 0.00)] // Orange
        case .suspended: return [Color(red: 0.56, green: 0.08, blue: 0.08), Color(red: 0.32, green: 0.04, blue: 0.04)] // Deep Red
        }
    }

    var iconColor: Color {
        switch self {
        case .good:   return Color(red: 0.13, green: 0.65, blue: 0.30)
        case .minor:  return Color(red: 0.85, green: 0.55, blue: 0.00)
        case .severe: return Color(red: 0.90, green: 0.36, blue: 0.00)
        case .suspended: return Color(red: 0.85, green: 0.15, blue: 0.15)
        }
    }

    var textColor: Color {
        switch self {
        case .good, .severe, .suspended: return .white
        case .minor:         return Color(red: 0.15, green: 0.10, blue: 0.00)
        }
    }

    var secondaryTextColor: Color {
        switch self {
        case .good, .severe, .suspended: return .white.opacity(0.80)
        case .minor:         return Color(red: 0.25, green: 0.15, blue: 0.00).opacity(0.85)
        }
    }

    var dividerColor: Color {
        switch self {
        case .good, .severe, .suspended: return .white.opacity(0.3)
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
    let fetchDate: Date
    let lines: [CommuteLine]
    let debugMessage: String?

    var isStale: Bool {
        date.timeIntervalSince(fetchDate) >= WidgetMetrics.staleThreshold
    }

    var worstLine: CommuteLine? {
        lines.min(by: { $0.severity < $1.severity })
    }

    // 🚦 Sorted so the worst delays are always at the top
    var otherLines: [CommuteLine] {
        guard let worst = worstLine else { return [] }
        return lines
            .filter { $0.id != worst.id }
            .sorted { $0.severity < $1.severity }
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
        CommuteEntry(date: Date(), fetchDate: Date(), lines: [], debugMessage: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (CommuteEntry) -> Void) {
        Task {
            let (lines, msg) = await fetchRawData()
            completion(CommuteEntry(date: Date(), fetchDate: Date(), lines: lines, debugMessage: msg))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CommuteEntry>) -> Void) {
        Task {
            let (lines, msg) = await fetchRawData()
            let now = Date()
            
            let freshEntry = CommuteEntry(date: now, fetchDate: now, lines: lines, debugMessage: msg)
            let staleTime = now.addingTimeInterval(WidgetMetrics.staleThreshold)
            let staleEntry = CommuteEntry(date: staleTime, fetchDate: now, lines: lines, debugMessage: msg)
            
            let hour = Calendar.current.component(.hour, from: now)
            let refreshMinutes: Int
            if hour < 5 || hour > 23      { refreshMinutes = 15 }
            else if hour < 7 || hour > 20 { refreshMinutes = 5  }
            else                          { refreshMinutes = 2  }
            
            let nextRefresh = Calendar.current.date(byAdding: .minute, value: refreshMinutes, to: now)!
            
            completion(Timeline(entries: [freshEntry, staleEntry], policy: .after(nextRefresh)))
        }
    }

    private func fetchRawData() async -> ([CommuteLine], String?) {
        let savedLines: [SavedLine]
        do {
            savedLines = try readSavedLines()
        } catch {
            return ([], "BRIDGE ERROR:\n\(error.localizedDescription)")
        }
        guard !savedLines.isEmpty else {
            return ([], "Open the app to save your commute lines.")
        }
        do {
            let commuteLines = try await fetchTfLStatus(for: savedLines)
            return (commuteLines, nil)
        } catch {
            return ([], "TFL API ERROR:\n\(error.localizedDescription)")
        }
    }

    private func readSavedLines() throws -> [SavedLine] {
        guard let userDefaults = UserDefaults(suiteName: kAppGroupID) else { throw WidgetError.appGroupUnavailable }
        guard let jsonString = userDefaults.string(forKey: "myLines")   else { throw WidgetError.fileNotFound }
        guard let data = jsonString.data(using: .utf8)                  else { throw WidgetError.decodingFailed("String to UTF-8 failed") }
        do {
            return try JSONDecoder().decode([SavedLine].self, from: data)
        } catch let error as DecodingError {
            switch error {
            case .keyNotFound(let key, let ctx):  throw WidgetError.decodingFailed("Missing key '\(key.stringValue)' at \(ctx.codingPath)")
            case .typeMismatch(let type, let ctx): throw WidgetError.decodingFailed("Type mismatch: expected \(type) at \(ctx.codingPath)")
            case .valueNotFound(let type, let ctx):throw WidgetError.decodingFailed("Null value: expected \(type) at \(ctx.codingPath)")
            case .dataCorrupted(let ctx):          throw WidgetError.decodingFailed("Corrupted JSON: \(ctx.debugDescription)")
            @unknown default: throw error
            }
        }
    }

    private func fetchTfLStatus(for savedLines: [SavedLine]) async throws -> [CommuteLine] {
        let ids = savedLines.map(\.id).joined(separator: ",")
        guard let url = URL(string: "https://api.tfl.gov.uk/Line/\(ids)/Status") else { throw WidgetError.invalidURL }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, _) = try await URLSession.shared.data(for: request)
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
// MARK: - HELPERS
// ============================================================
func getAbsoluteTime(from date: Date) -> String {
    let f = DateFormatter()
    f.dateFormat = "HH:mm"
    return "Updated \(f.string(from: date))"
}

// ============================================================
// MARK: - SHARED FOOTER
// ============================================================
struct WidgetFooterView: View {
    let entry: CommuteEntry
    let theme: SeverityLevel
    @Environment(\.widgetFamily) var family

    private var isStale: Bool { entry.isStale }

    // ── STALE: solid white pill, dark label
    // ── FRESH: ghost pill, theme-blended label
    private var pillBackground: Color {
        isStale ? .white : theme.textColor.opacity(0.12)
    }
    
    private var pillForeground: Color {
        isStale ? Color(white: 0.12) : theme.secondaryTextColor
    }
    
    private var timestampColor: Color {
        isStale ? .white.opacity(0.9) : theme.secondaryTextColor.opacity(0.8)
    }

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            Text(getAbsoluteTime(from: entry.fetchDate))
                .font(.system(size: WidgetMetrics.footerFontSize, weight: .bold))
                .foregroundColor(timestampColor)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            
            Spacer(minLength: 6)
            
            if #available(iOS 17.0, *) {
                Button(intent: RefreshCommuteIntent()) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: isStale ? 10 : 9, weight: .bold))
                        
                        if isStale && family != .systemSmall {
                            Text("WAKE UP")
                                .font(.system(size: 9, weight: .heavy))
                                .tracking(0.5)
                        }
                    }
                    .padding(.horizontal, isStale ? 12 : 8)
                    .padding(.vertical, isStale ? 7 : 5)
                    .background(pillBackground)
                    .clipShape(Capsule())
                    .foregroundColor(pillForeground)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isStale ? "Wake up widget" : "Refresh commute status")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
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
                } else if entry.lines.isEmpty {
                    EmptyStateView(theme: entry.overallLevel)
                } else {
                    if family == .systemSmall, let worst = entry.worstLine {
                        SmallPriorityView(line: worst, theme: entry.overallLevel, entry: entry)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        DashboardView(entry: entry, theme: entry.overallLevel)
                    }
                }
            }
        }
        .grayscale(entry.isStale ? 1.0 : 0.0)
        .opacity(entry.isStale ? 0.75 : 1.0)
        .modifier(ContainerBackgroundModifier())
    }
}

// ============================================================
// MARK: - MEDIUM WIDGET
// ============================================================
struct DashboardView: View {
    let entry: CommuteEntry
    let theme: SeverityLevel

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                if let worst = entry.worstLine {
                    PriorityView(line: worst, theme: theme)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }

                Rectangle()
                    .fill(theme.dividerColor)
                    .frame(width: 1)
                    .padding(.top, 12)

                OtherLinesPanelView(lines: entry.otherLines, theme: theme)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            Rectangle()
                .fill(entry.isStale ? Color.white.opacity(0.3) : theme.dividerColor)
                .frame(height: 1)
                .padding(.horizontal, 10)

            WidgetFooterView(entry: entry, theme: theme)
        }
        .padding(.horizontal, 4)
    }
}

struct PriorityView: View {
    let line: CommuteLine
    let theme: SeverityLevel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("PRIORITY")
                .font(.system(size: WidgetMetrics.headerFontSize, weight: .bold))
                .tracking(1.8)
                .foregroundColor(theme.secondaryTextColor)

            Spacer()

            HStack(spacing: 12) {
                StatusIcon(level: line.level, size: WidgetMetrics.iconSizeMedium)
                VStack(alignment: .leading, spacing: 2) {
                    Text(line.name)
                        .font(.system(size: WidgetMetrics.lineNameMedium, weight: .bold))
                        .foregroundColor(theme.textColor)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text(line.status)
                        .font(.system(size: WidgetMetrics.lineStatusMedium, weight: .semibold))
                        .foregroundColor(theme.secondaryTextColor)
                        .lineLimit(2).minimumScaleFactor(0.75)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer()
        }
        .padding(.leading, 14).padding(.top, 14).padding(.bottom, 10)
        .frame(maxHeight: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(line.name) line priority: \(line.status)")
    }
}

struct OtherLinesPanelView: View {
    let lines: [CommuteLine]
    let theme: SeverityLevel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("OTHER LINES")
                .font(.system(size: WidgetMetrics.headerFontSize, weight: .bold))
                .tracking(1.8)
                .foregroundColor(theme.secondaryTextColor)
                .padding(.top, 14)
                .padding(.leading, 12)

            Spacer()

            VStack(alignment: .leading, spacing: 8) {
                ForEach(lines.prefix(4)) { line in LineRowView(line: line, theme: theme) }
            }
            .padding(.leading, 12)
            .padding(.bottom, 10)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// ============================================================
// MARK: - SMALL WIDGET
// ============================================================
struct SmallPriorityView: View {
    let line: CommuteLine
    let theme: SeverityLevel
    let entry: CommuteEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            Text("PRIORITY")
                .font(.system(size: WidgetMetrics.headerFontSize, weight: .bold))
                .tracking(1.8)
                .foregroundColor(theme.secondaryTextColor)
                .padding(.horizontal, 14)
                .padding(.top, 14)

            Spacer()

            HStack(spacing: 10) {
                StatusIcon(level: line.level, size: WidgetMetrics.iconSizeSmall)
                VStack(alignment: .leading, spacing: 2) {
                    Text(line.name)
                        .font(.system(size: WidgetMetrics.lineNameSmall, weight: .bold))
                        .foregroundColor(theme.textColor)
                        .lineLimit(1).minimumScaleFactor(0.6)
                    Text(line.status)
                        .font(.system(size: WidgetMetrics.lineStatusSmall, weight: .semibold))
                        .foregroundColor(theme.secondaryTextColor)
                        .lineLimit(2).minimumScaleFactor(0.7)
                }
            }
            .padding(.horizontal, 14)

            Spacer()

            WidgetFooterView(entry: entry, theme: theme)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(line.name) line priority: \(line.status)")
    }
}

// ============================================================
// MARK: - SUPPORTING VIEWS
// ============================================================
struct LineRowView: View {
    let line: CommuteLine
    let theme: SeverityLevel

    var body: some View {
        HStack(spacing: 8) {
            StatusIcon(level: line.level, size: WidgetMetrics.iconLineRow)
            VStack(alignment: .leading, spacing: 1) {
                Text(line.name).font(.system(size: 12, weight: .bold)).foregroundColor(theme.textColor).lineLimit(1)
                Text(line.status).font(.system(size: 10, weight: .medium)).foregroundColor(theme.secondaryTextColor).lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(line.name): \(line.status)")
    }
}

struct StatusIcon: View {
    let level: SeverityLevel
    let size: CGFloat

    var iconName: String {
        switch level {
        case .good:   return "checkmark"
        case .minor:  return "exclamationmark.triangle.fill"
        case .severe: return "clock.fill"
        case .suspended: return "xmark"
        }
    }

    var body: some View {
        ZStack {
            Circle().fill(Color.white).frame(width: size, height: size)
            Image(systemName: iconName)
                .font(.system(size: size * 0.45, weight: .black))
                .foregroundColor(level.iconColor)
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

// ============================================================
// MARK: - WIDGET ENTRY POINT
// ============================================================
@main
struct CommutePremiumWidget: Widget {
    let kind = "CommutePremiumWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CommuteProvider()) { entry in
            CommutePremiumEntryView(entry: entry)
        }
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

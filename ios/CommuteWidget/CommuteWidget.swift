import WidgetKit
import SwiftUI
import AppIntents

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
    static let staleThreshold: TimeInterval = 120
}

struct SavedLine: Codable {
    let id: String
    let name: String
}

struct CommuteLine: Identifiable, Codable {
    let id: String
    let name: String
    let status: String
    let severity: Int

    var level: SeverityLevel {
        switch severity {
        case 1:
            return .good
        case 2...8:
            return .minor
        case 9:
            return .severe
        default:
            return .suspended
        }
    }
}

enum SeverityLevel {
    case good, minor, severe, suspended

    var gradientColors: [Color] {
        switch self {
        case .good:
            return [Color(red: 0.157, green: 0.655, blue: 0.271),
                    Color(red: 0.118, green: 0.494, blue: 0.208)]
        case .minor:
            return [Color(red: 1.000, green: 0.749, blue: 0.000),
                    Color(red: 0.902, green: 0.659, blue: 0.000)]
        case .severe:
            return [Color(red: 0.863, green: 0.208, blue: 0.271),
                    Color(red: 0.741, green: 0.129, blue: 0.188)]
        case .suspended:
            return [Color(red: 0.890, green: 0.125, blue: 0.090),
                    Color(red: 0.722, green: 0.102, blue: 0.071)]
        }
    }

    var iconColor: Color {
        switch self {
        case .good:
            return Color(red: 0.157, green: 0.655, blue: 0.271)
        case .minor:
            return Color(red: 0.851, green: 0.549, blue: 0.000)
        case .severe:
            return Color(red: 0.863, green: 0.208, blue: 0.271)
        case .suspended:
            return Color(red: 0.890, green: 0.125, blue: 0.090)
        }
    }

    var textColor: Color {
        switch self {
        case .good, .severe, .suspended:
            return .white
        case .minor:
            return Color(red: 0.15, green: 0.10, blue: 0.00)
        }
    }

    var secondaryTextColor: Color {
        switch self {
        case .good, .severe, .suspended:
            return .white.opacity(0.80)
        case .minor:
            return Color(red: 0.25, green: 0.15, blue: 0.00).opacity(0.85)
        }
    }

    var dividerColor: Color {
        switch self {
        case .good, .severe, .suspended:
            return .white.opacity(0.3)
        case .minor:
            return Color.black.opacity(0.15)
        }
    }
}

struct TfLLine: Decodable {
    let id: String
    let lineStatuses: [TfLStatus]
}

struct TfLStatus: Decodable {
    let statusSeverity: Int
    let statusSeverityDescription: String
}

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

            // 15-minute fallback entry
            let fallbackTime = now.addingTimeInterval(15 * 60)
            let fallbackEntry = CommuteEntry(date: fallbackTime, fetchDate: now, lines: lines, debugMessage: msg ?? "Still offline. Tap again when clear")

            // 2-hour deep freeze entry
            let deepFreezeTime = now.addingTimeInterval(7200)
            let deepFreezeEntry = CommuteEntry(date: deepFreezeTime, fetchDate: now, lines: lines, debugMessage: "Tap to refresh")

            let hour = Calendar.current.component(.hour, from: now)
            let refreshMinutes: Int
            if hour < 7 || hour > 20 {
                refreshMinutes = 5
            } else {
                refreshMinutes = 2
            }

            let nextRefresh = Calendar.current.date(byAdding: .minute, value: refreshMinutes, to: now)!

            completion(Timeline(entries: [freshEntry, staleEntry, fallbackEntry, deepFreezeEntry], policy: .after(nextRefresh)))
        }
    }

    private func fetchRawData() async -> ([CommuteLine], String?) {
        let savedLines: [SavedLine]
        do {
            savedLines = try readSavedLines()
        } catch {
            return ([], "BRIDGE ERROR: " + error.localizedDescription)
        }
        guard !savedLines.isEmpty else {
            return ([], "Open the app to save your commute lines.")
        }
        do {
            let commuteLines = try await fetchTfLStatus(for: savedLines)
            // Cache the successfully fetched lines
            if let userDefaults = UserDefaults(suiteName: kAppGroupID),
               let encoded = try? JSONEncoder().encode(commuteLines),
               let jsonString = String(data: encoded, encoding: .utf8) {
                userDefaults.set(jsonString, forKey: "cachedTfLStatus")
                userDefaults.synchronize()
            }
            return (commuteLines, nil)
        } catch {
            // Fail-open: try loading last successfully cached statuses
            if let userDefaults = UserDefaults(suiteName: kAppGroupID),
               let jsonString = userDefaults.string(forKey: "cachedTfLStatus"),
               let cachedData = jsonString.data(using: .utf8),
               let cachedLines = try? JSONDecoder().decode([CommuteLine].self, from: cachedData) {
                
                // Filter cached lines to only match the currently saved line IDs
                let filteredCachedLines = cachedLines.filter { cachedLine in
                    savedLines.contains { $0.id == cachedLine.id }
                }
                if !filteredCachedLines.isEmpty {
                    return (filteredCachedLines, "Still offline. Tap again when clear")
                }
            }
            return ([], "Still offline. Tap again when clear")
        }
    }

    private func readSavedLines() throws -> [SavedLine] {
        guard let userDefaults = UserDefaults(suiteName: kAppGroupID) else {
            throw WidgetError.appGroupUnavailable
        }
        guard let jsonString = userDefaults.string(forKey: "myLines") else {
            throw WidgetError.fileNotFound
        }
        guard let data = jsonString.data(using: .utf8) else {
            throw WidgetError.decodingFailed("String to UTF-8 failed")
        }
        do {
            return try JSONDecoder().decode([SavedLine].self, from: data)
        } catch {
            throw WidgetError.decodingFailed("JSON decode failed: " + error.localizedDescription)
        }
    }

    private func fetchTfLStatus(for savedLines: [SavedLine]) async throws -> [CommuteLine] {
        let ids = savedLines.map { $0.id }.joined(separator: ",")
        let urlString = "https://api.tfl.gov.uk/Line/" + ids + "/Status"
        guard let url = URL(string: urlString) else {
            throw WidgetError.invalidURL
        }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 7
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode([TfLLine].self, from: data)
        return response.compactMap { tflLine in
            guard let saved = savedLines.first(where: { $0.id == tflLine.id }),
                  let status = tflLine.lineStatuses.first else { return nil }
            return CommuteLine(id: tflLine.id, name: saved.name, status: status.statusSeverityDescription, severity: status.statusSeverity)
        }
    }
}

enum WidgetError: LocalizedError {
    case appGroupUnavailable, fileNotFound, invalidURL, decodingFailed(String)
    var errorDescription: String? {
        switch self {
        case .appGroupUnavailable:
            return "App Group container not found."
        case .fileNotFound:
            return "Data missing. Open the app first."
        case .invalidURL:
            return "Could not build TfL API URL."
        case .decodingFailed(let msg):
            return msg
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

func getAbsoluteTime(from date: Date) -> String {
    let f = DateFormatter()
    f.dateFormat = "HH:mm"
    return "Updated " + f.string(from: date)
}

struct WidgetFooterView: View {
    let entry: CommuteEntry
    let theme: SeverityLevel
    @Environment(\.widgetFamily) var family

    private var isStale: Bool { entry.isStale }

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
        .accessibilityLabel(line.name + " line priority: " + line.status)
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
        .accessibilityLabel(line.name + " line priority: " + line.status)
    }
}

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
        .accessibilityLabel(line.name + ": " + line.status)
    }
}

struct StatusIcon: View {
    let level: SeverityLevel
    let size: CGFloat

    var iconName: String {
        switch level {
        case .good:
            return "checkmark"
        case .minor:
            return "clock.fill"
        case .severe:
            return "exclamationmark.triangle.fill"
        case .suspended:
            return "xmark"
        }
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.white)
                .frame(width: size, height: size)

            if level == .suspended {
                Circle()
                    .stroke(Color.black, lineWidth: size * 0.05)
                    .frame(width: size, height: size)
            }

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
        if #available(iOS 17.0, *) {
            content.containerBackground(for: .widget) { Color.clear }
        } else {
            content
        }
    }
}

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
        if #available(iOS 17.0, *) {
            return self.contentMarginsDisabled()
        } else {
            return self
        }
    }
}
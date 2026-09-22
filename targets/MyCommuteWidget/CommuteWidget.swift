import WidgetKit
import SwiftUI
import AppIntents
import os

private let logger = Logger(subsystem: "com.mycommute.app", category: "WidgetTimeline")

struct WidgetMetrics {
    static let headerFontSize: CGFloat   = 9
    static let footerFontSize: CGFloat   = 8
    static let lineNameMedium: CGFloat   = 16
    static let lineStatusMedium: CGFloat = 11
    static let lineNameSmall: CGFloat    = 16
    static let lineStatusSmall: CGFloat  = 11
    static let iconSizeMedium: CGFloat   = 38
    static let iconSizeSmall: CGFloat    = 36
    static let iconLineRow: CGFloat      = 16
    static let staleBackstop: TimeInterval = 3 * 3600
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
        case 10, 18:
            return .good
        case 9, 14, 19:
            return .minor
        case 6, 7, 8, 17:
            return .severe
        case 0, 1, 2, 3, 4, 5, 11, 16, 20:
            return .suspended
        default:
            return .suspended
        }
    }
}

enum SeverityLevel {
    case good, minor, severe, suspended

    var rank: Int {
        switch self {
        case .good: return 0
        case .minor: return 1
        case .severe: return 2
        case .suspended: return 3
        }
    }

    var gradientColors: [Color] {
        switch self {
        case .good:
            return [Color(red: 13.0/255.0, green: 92.0/255.0, blue: 46.0/255.0), Color.black]
        case .minor:
            return [Color(red: 122.0/255.0, green: 74.0/255.0, blue: 0.0/255.0), Color.black]
        case .severe:
            return [Color(red: 122.0/255.0, green: 14.0/255.0, blue: 14.0/255.0), Color.black]
        case .suspended:
            return [Color(red: 92.0/255.0, green: 10.0/255.0, blue: 10.0/255.0), Color.black]
        }
    }

    var iconColor: Color {
        switch self {
        case .good:
            return Color(red: 48.0/255.0, green: 209.0/255.0, blue: 88.0/255.0) // #30D158
        case .minor:
            return Color(red: 255.0/255.0, green: 176.0/255.0, blue: 0.0/255.0) // #FFB000
        case .severe:
            return Color(red: 255.0/255.0, green: 59.0/255.0, blue: 48.0/255.0) // #FF3B30
        case .suspended:
            return Color(red: 255.0/255.0, green: 59.0/255.0, blue: 48.0/255.0) // #FF3B30
        }
    }

    var textColor: Color {
        return .white
    }

    var secondaryTextColor: Color {
        return .white.opacity(0.60)
    }

    var dividerColor: Color {
        return .white.opacity(0.12)
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
    let fetchDate: Date?
    let lines: [CommuteLine]
    let debugMessage: String?
    let isStale: Bool
    let isFailure: Bool

    var worstLine: CommuteLine? {
        if let disrupted = lines.filter({ $0.level.rank > 0 }).max(by: { $0.level.rank < $1.level.rank }) {
            return disrupted
        }
        return lines.first
    }

    var disruptedLines: [CommuteLine] {
        lines.filter { $0.level != .good }
    }

    var otherLines: [CommuteLine] {
        guard let worst = worstLine else { return [] }
        return lines
            .filter { $0.id != worst.id }
            .sorted { $0.level.rank > $1.level.rank }
    }

    var overallLevel: SeverityLevel {
        worstLine?.level ?? .good
    }
}

private let kAppGroupID = "group.com.mycommute.app"

struct CommuteProvider: TimelineProvider {
    private static let defaultLines: [SavedLine] = [
        SavedLine(id: "victoria", name: "Victoria"),
        SavedLine(id: "jubilee", name: "Jubilee"),
        SavedLine(id: "northern", name: "Northern"),
        SavedLine(id: "central", name: "Central"),
        SavedLine(id: "piccadilly", name: "Piccadilly"),
        SavedLine(id: "elizabeth", name: "Elizabeth")
    ]

    func placeholder(in context: Context) -> CommuteEntry {
        CommuteEntry(date: Date(), fetchDate: nil, lines: [], debugMessage: nil, isStale: false, isFailure: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (CommuteEntry) -> Void) {
        let savedLines = (try? readSavedLines()) ?? Self.defaultLines
        let lastFetch = readLastFetchDate()
        if let cached = readPreWarmedCache(for: savedLines), !cached.isEmpty {
            completion(CommuteEntry(date: Date(), fetchDate: lastFetch, lines: cached, debugMessage: nil, isStale: false, isFailure: false))
            return
        }
        Task {
            let (lines, isFailure, msg) = await fetchRawData()
            let fetchDate = readLastFetchDate()
            completion(CommuteEntry(date: Date(), fetchDate: fetchDate, lines: lines, debugMessage: msg, isStale: isFailure, isFailure: isFailure))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CommuteEntry>) -> Void) {
        Task {
            let now = Date()
            let (lines, isFailure, msg) = await fetchRawData()
            let lastFetchDate = readLastFetchDate()

            if let lastFetch = lastFetchDate {
                let gap = now.timeIntervalSince(lastFetch)
                logger.info("Widget getTimeline executed. Age since last successful fetch: \(gap)s. isFailure: \(isFailure)")
            } else {
                logger.info("Widget getTimeline executed. No previous successful fetch recorded (first run). isFailure: \(isFailure)")
            }

            if isFailure {
                // Immediate warning emission on failure with historical cache age
                let failedEntry = CommuteEntry(
                    date: now,
                    fetchDate: lastFetchDate,
                    lines: lines,
                    debugMessage: msg,
                    isStale: true,
                    isFailure: true
                )
                let retryDate = now.addingTimeInterval(300)
                completion(Timeline(entries: [failedEntry], policy: .after(retryDate)))
                return
            }

            // Exactly two entries on success:
            // 1. Healthy at now
            let freshEntry = CommuteEntry(
                date: now,
                fetchDate: now,
                lines: lines,
                debugMessage: nil,
                isStale: false,
                isFailure: false
            )

            // 2. Secondary age backstop entry at now + backstop (author declared, zero floating-point comparison)
            let backstopEntry = CommuteEntry(
                date: now.addingTimeInterval(WidgetMetrics.staleBackstop),
                fetchDate: now,
                lines: lines,
                debugMessage: nil,
                isStale: true,
                isFailure: false
            )

            let hour = Calendar.current.component(.hour, from: now)
            let refreshInterval: TimeInterval = (hour < 7 || hour > 20) ? 300 : 120
            let nextRefresh = now.addingTimeInterval(refreshInterval)

            completion(Timeline(entries: [freshEntry, backstopEntry], policy: .after(nextRefresh)))
        }
    }

    private func readLastFetchDate() -> Date? {
        guard let userDefaults = UserDefaults(suiteName: kAppGroupID) else { return nil }
        let epoch = userDefaults.double(forKey: "lastSuccessfulFetchEpoch")
        guard epoch > 0 else { return nil }
        return Date(timeIntervalSince1970: epoch)
    }

    private func readPreWarmedCache(for savedLines: [SavedLine]) -> [CommuteLine]? {
        guard let userDefaults = UserDefaults(suiteName: kAppGroupID) else { return nil }
        let rawJson = userDefaults.string(forKey: "cachedLineStatuses") ?? userDefaults.string(forKey: "cachedTfLStatus")
        guard let jsonString = rawJson,
              let data = jsonString.data(using: .utf8),
              let cachedLines = try? JSONDecoder().decode([CommuteLine].self, from: data) else {
            return nil
        }
        let linesMap = Dictionary(uniqueKeysWithValues: cachedLines.map { ($0.id.lowercased(), $0) })
        let ordered = savedLines.compactMap { linesMap[$0.id.lowercased()] }
        if !ordered.isEmpty {
            return ordered
        }
        let savedSet = Set(savedLines.map { $0.id.lowercased() })
        let filtered = cachedLines.filter { savedSet.contains($0.id.lowercased()) }
        return filtered.isEmpty ? nil : filtered
    }

    private func fetchRawData() async -> ([CommuteLine], Bool, String?) {
        let savedLines = (try? readSavedLines()) ?? Self.defaultLines
        
        do {
            let commuteLines = try await fetchTfLStatus(for: savedLines)
            // Cache successfully fetched lines and record the successful fetch epoch
            if let userDefaults = UserDefaults(suiteName: kAppGroupID) {
                userDefaults.set(Date().timeIntervalSince1970, forKey: "lastSuccessfulFetchEpoch")
                if let encoded = try? JSONEncoder().encode(commuteLines),
                   let jsonString = String(data: encoded, encoding: .utf8) {
                    userDefaults.set(jsonString, forKey: "cachedTfLStatus")
                    userDefaults.set(jsonString, forKey: "cachedLineStatuses")
                }
            }
            return (commuteLines, false, nil)
        } catch {
            // Fail-open: return pre-warmed snapshot immediately with failure state
            if let cached = readPreWarmedCache(for: savedLines), !cached.isEmpty {
                return (cached, true, "Offline · Cached data shown")
            }
            // Airplane-safe first run: fallback to saved/default lines with offline badge
            let fallbackLines = savedLines.map {
                CommuteLine(id: $0.id, name: $0.name, status: "Offline · Tap ↻ to check", severity: 10)
            }
            return (fallbackLines, true, "Offline · Tap ↻ to check")
        }
    }

    private func readSavedLines() throws -> [SavedLine] {
        guard let userDefaults = UserDefaults(suiteName: kAppGroupID) else {
            return Self.defaultLines
        }
        guard let jsonString = userDefaults.string(forKey: "myLines"),
              let data = jsonString.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([SavedLine].self, from: data),
              !decoded.isEmpty else {
            return Self.defaultLines
        }
        return decoded
    }

    private func getSeverityRank(_ severity: Int) -> Int {
        switch severity {
        case 10, 18:
            return 0
        case 9, 14, 19:
            return 1
        case 6, 7, 8, 17:
            return 2
        default:
            return 3
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
        let unordered = response.compactMap { tflLine -> CommuteLine? in
            guard let saved = savedLines.first(where: { $0.id.caseInsensitiveCompare(tflLine.id) == .orderedSame }),
                  let status = tflLine.lineStatuses.max(by: { getSeverityRank($0.statusSeverity) < getSeverityRank($1.statusSeverity) }) else { return nil }
            return CommuteLine(id: tflLine.id, name: saved.name, status: status.statusSeverityDescription, severity: status.statusSeverity)
        }
        let linesMap = Dictionary(uniqueKeysWithValues: unordered.map { ($0.id.lowercased(), $0) })
        let ordered = savedLines.compactMap { linesMap[$0.id.lowercased()] }
        return ordered.isEmpty ? unordered : ordered
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

@available(iOS 17.0, *)
struct WidgetRefreshButtonStyle: ButtonStyle {
    let isStale: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .rotationEffect(configuration.isPressed ? .degrees(180) : .degrees(0))
            .animation(.easeInOut(duration: 0.35), value: configuration.isPressed)
            .padding(.horizontal, isStale ? 10 : 8)
            .padding(.vertical, isStale ? 6 : 5)
            .background(
                Capsule()
                    .fill(Color.white.opacity(isStale ? (configuration.isPressed ? 0.35 : 0.22) : (configuration.isPressed ? 0.18 : 0.08)))
            )
            .overlay(
                Capsule()
                    .stroke(Color.white.opacity(isStale ? 0.40 : 0.16), lineWidth: 0.5)
            )
            .scaleEffect(configuration.isPressed ? 0.88 : 1.0)
            .opacity(configuration.isPressed ? 0.8 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

struct WidgetFooterView: View {
    let entry: CommuteEntry
    let theme: SeverityLevel
    @Environment(\.widgetFamily) var family

    private var isStale: Bool { entry.isStale }

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            HStack(spacing: 4) {
                if entry.isFailure {
                    Image(systemName: "exclamationmark.circle")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(.white.opacity(0.9))
                } else if entry.isStale {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(Color(red: 255.0/255.0, green: 176.0/255.0, blue: 0.0/255.0))
                }

                if let fetchDate = entry.fetchDate {
                    (Text("Updated ") + Text(fetchDate, style: .relative) + Text(" ago"))
                        .font(.system(size: WidgetMetrics.footerFontSize, weight: .medium))
                        .monospacedDigit()
                        .foregroundColor(.white.opacity(0.85))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                } else {
                    Text("Tap ↻ to check")
                        .font(.system(size: WidgetMetrics.footerFontSize, weight: .medium))
                        .foregroundColor(.white.opacity(0.85))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }

            Spacer(minLength: 6)

            if #available(iOS 17.0, *) {
                Button(intent: RefreshCommuteIntent()) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: isStale ? 10 : 9, weight: .bold))
                        .foregroundColor(isStale ? .white : .white.opacity(0.85))
                        .symbolEffect(.bounce, value: entry.date)
                }
                .buttonStyle(WidgetRefreshButtonStyle(isStale: isStale))
                .contentShape(Rectangle())
                .accessibilityLabel(isStale ? "Refresh commute status (warning active)" : "Refresh commute status")
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 2)
    }
}

struct CommutePremiumEntryView: View {
    var entry: CommuteEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryInline:
            AccessoryInlineView(entry: entry)
                .modifier(ContainerBackgroundModifier())
        case .accessoryCircular:
            AccessoryCircularView(entry: entry)
                .modifier(ContainerBackgroundModifier())
        case .accessoryRectangular:
            AccessoryRectangularView(entry: entry)
                .modifier(ContainerBackgroundModifier())
        default:
            ZStack {
                LinearGradient(colors: entry.overallLevel.gradientColors, startPoint: .topLeading, endPoint: .bottomTrailing)

                // Content layer
                Group {
                    if let msg = entry.debugMessage, entry.lines.isEmpty {
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
            .modifier(ContainerBackgroundModifier())
        }
    }
}

struct DashboardView: View {
    let entry: CommuteEntry
    let theme: SeverityLevel

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                if let worst = entry.worstLine {
                    PriorityView(line: worst, theme: theme)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }

                Rectangle()
                    .fill(theme.dividerColor)
                    .frame(width: 1)
                    .padding(.top, 6)

                OtherLinesPanelView(lines: entry.otherLines, theme: theme)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            Rectangle()
                .fill(entry.isStale ? Color.white.opacity(0.3) : theme.dividerColor)
                .frame(height: 1)
                .padding(.horizontal, 10)

            WidgetFooterView(entry: entry, theme: theme)
                .layoutPriority(1)
        }
        .padding(.horizontal, 4)
        .widgetURL(URL(string: "mycommute://"))
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

            Spacer(minLength: 4)

            HStack(spacing: 10) {
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

            Spacer(minLength: 4)
        }
        .padding(.leading, 12).padding(.top, 6).padding(.bottom, 6)
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
                .padding(.top, 6)
                .padding(.leading, 10)

            Spacer(minLength: 2)

            // Without severity sorting, a cap can hide the disrupted line behind three good-service
            // rows — the tightening keeps all 4 lines visible. The cap arrives only with the sort, in the deferred cycle.
            VStack(alignment: .leading, spacing: 4) {
                ForEach(lines.prefix(4)) { line in LineRowView(line: line, theme: theme) }
            }
            .padding(.leading, 10)
            .padding(.bottom, 6)
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
                .padding(.top, 10)

            Spacer(minLength: 4)

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

            Spacer(minLength: 4)

            WidgetFooterView(entry: entry, theme: theme)
                .layoutPriority(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "mycommute://"))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(line.name + " line priority: " + line.status)
    }
}

struct LineRowView: View {
    let line: CommuteLine
    let theme: SeverityLevel

    var body: some View {
        HStack(spacing: 6) {
            StatusIcon(level: line.level, size: WidgetMetrics.iconLineRow)
            VStack(alignment: .leading, spacing: 1) {
                Text(line.name).font(.system(size: 11, weight: .bold)).foregroundColor(theme.textColor).lineLimit(1)
                Text(line.status).font(.system(size: 9, weight: .medium)).foregroundColor(theme.secondaryTextColor).lineLimit(1)
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
            Image(systemName: "exclamationmark.circle").foregroundColor(.white.opacity(0.85)).font(.title3)
            Text(message).font(.system(size: 9, weight: .medium, design: .monospaced)).foregroundColor(theme.textColor).multilineTextAlignment(.center).padding(.horizontal, 10)
        }
    }
}

struct EmptyStateView: View {
    let theme: SeverityLevel
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "tram.fill.tunnel")
                .font(.title2)
                .foregroundColor(theme.secondaryTextColor)
            Text("Tap to select commute lines")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(theme.textColor)
            Text("Select lines for live delay alerts")
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(theme.secondaryTextColor)
                .multilineTextAlignment(.center)
        }
        .widgetURL(URL(string: "mycommute://lines"))
    }
}

enum CommuteFormatters {
    static func displayName(for id: String) -> String {
        switch id.lowercased().replacingOccurrences(of: "-", with: "") {
        case "bakerloo": return "Bakerloo"
        case "central": return "Central"
        case "circle": return "Circle"
        case "district": return "District"
        case "dlr": return "DLR"
        case "elizabeth": return "Elizabeth"
        case "hammersmithcity": return "Hammersmith & City"
        case "jubilee": return "Jubilee"
        case "metropolitan": return "Metropolitan"
        case "northern": return "Northern"
        case "piccadilly": return "Piccadilly"
        case "victoria": return "Victoria"
        case "waterloocity": return "Waterloo & City"
        case "liberty": return "Liberty"
        case "lioness": return "Lioness"
        case "mildmay": return "Mildmay"
        case "suffragette": return "Suffragette"
        case "weaver": return "Weaver"
        case "windrush": return "Windrush"
        default: return id.capitalized
        }
    }

    static func shortCode(for id: String) -> String {
        switch id.lowercased().replacingOccurrences(of: "-", with: "") {
        case "bakerloo": return "BAK"
        case "central": return "CEN"
        case "circle": return "CIR"
        case "district": return "DIS"
        case "dlr": return "DLR"
        case "elizabeth": return "ELI"
        case "hammersmithcity": return "H&C"
        case "jubilee": return "JUB"
        case "metropolitan": return "MET"
        case "northern": return "NOR"
        case "piccadilly": return "PIC"
        case "victoria": return "VIC"
        case "waterloocity": return "W&C"
        case "liberty": return "LIB"
        case "lioness": return "LIO"
        case "mildmay": return "MLD"
        case "suffragette": return "SUF"
        case "weaver": return "WEA"
        case "windrush": return "WND"
        default: return String(id.prefix(3)).uppercased()
        }
    }

    static func shortStatus(for status: String) -> String {
        switch status.lowercased() {
        case "good service": return "Good"
        case "minor delays": return "Minor"
        case "severe delays": return "Severe"
        case "part suspended": return "Part Susp"
        case "suspended": return "Susp"
        case "planned closure": return "Closure"
        case "part closure": return "Part Close"
        default:
            if status.count > 10 {
                return String(status.prefix(8)) + "."
            }
            return status
        }
    }

    static func severityIcon(for level: SeverityLevel) -> String {
        switch level {
        case .suspended: return "xmark.circle.fill"
        case .severe: return "exclamationmark.triangle.fill"
        case .minor: return "clock.fill"
        case .good: return "checkmark"
        }
    }
}

struct AccessoryRow: View {
    let line: CommuteLine
    var font: Font = .system(size: 12, weight: .bold)

    private var icon: String {
        CommuteFormatters.severityIcon(for: line.level)
    }
    private var fullName: String {
        CommuteFormatters.displayName(for: line.id)
    }
    private var shortCode: String {
        CommuteFormatters.shortCode(for: line.id)
    }
    private var shortStat: String {
        CommuteFormatters.shortStatus(for: line.status)
    }

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .bold))
                .widgetAccentable()

            ViewThatFits(in: .horizontal) {
                // Tier 1: Full name + full status (e.g. "Piccadilly · Severe Delays")
                Text("\(fullName) · \(line.status)")
                    .lineLimit(1)

                // Tier 2: Short code + short status (e.g. "PIC · Severe")
                Text("\(shortCode) · \(shortStat)")
                    .lineLimit(1)

                // Tier 3: Guaranteed-fit terminal floor (<= 38pt, <= 4 chars: "PIC")
                Text(shortCode)
                    .lineLimit(1)
            }
            .font(font)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(fullName), \(line.status)")
    }
}

struct AccessoryInlineView: View {
    let entry: CommuteEntry

    var body: some View {
        ViewThatFits {
            content
        }
        .dynamicTypeSize(...DynamicTypeSize.large)
    }

    @ViewBuilder
    private var content: some View {
        if entry.lines.isEmpty {
            Label("Tap to setup", systemImage: "tram")
        } else if entry.disruptedLines.count > 1 {
            Label("\(entry.disruptedLines.count) Lines Delayed", systemImage: "exclamationmark.triangle.fill")
        } else if let worst = entry.worstLine, worst.level != .good {
            let icon = CommuteFormatters.severityIcon(for: worst.level)
            let shortName = CommuteFormatters.shortCode(for: worst.id)
            let shortStat = CommuteFormatters.shortStatus(for: worst.status)
            Label("\(shortName): \(shortStat)", systemImage: icon)
        } else {
            Label("All Lines Normal", systemImage: "checkmark")
                .accessibilityLabel("All lines normal")
        }
    }
}

struct AccessoryCircularView: View {
    let entry: CommuteEntry

    private var targetURL: URL {
        URL(string: entry.lines.isEmpty ? "mycommute://lines" : "mycommute://")!
    }

    var body: some View {
        Group {
            if entry.lines.isEmpty {
                Image(systemName: "tram")
                    .font(.system(size: 18))
                    .widgetAccentable()
            } else if entry.disruptedLines.isEmpty {
                // All clear: 100% closed ring + checkmark & line count
                Gauge(value: 1.0) {
                    Text("Status")
                } currentValueLabel: {
                    VStack(spacing: 0) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 11, weight: .bold))
                            .widgetAccentable()
                        Text("\(entry.lines.count) OK")
                            .font(.system(size: 9, weight: .heavy, design: .rounded))
                            .widgetAccentable()
                    }
                }
                .gaugeStyle(.accessoryCircularCapacity)
            } else if entry.disruptedLines.count == 1, let worst = entry.worstLine {
                // 1 disrupted: ring indicator + severity icon & 3-letter short code
                Gauge(value: 1.0) {
                    Text("Disrupted")
                } currentValueLabel: {
                    VStack(spacing: 0) {
                        Image(systemName: CommuteFormatters.severityIcon(for: worst.level))
                            .font(.system(size: 11, weight: .bold))
                            .widgetAccentable()
                        Text(CommuteFormatters.shortCode(for: worst.id))
                            .font(.system(size: 9, weight: .heavy, design: .rounded))
                            .widgetAccentable()
                    }
                }
                .gaugeStyle(.accessoryCircularCapacity)
            } else {
                // Multi-disrupted: Fraction disrupted / total
                let total = max(entry.lines.count, 1)
                let disrupted = entry.disruptedLines.count
                Gauge(value: Double(disrupted), in: 0...Double(total)) {
                    Text("Disruptions")
                } currentValueLabel: {
                    VStack(spacing: 0) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 10, weight: .bold))
                            .widgetAccentable()
                        Text("\(disrupted)")
                            .font(.system(size: 12, weight: .black, design: .rounded))
                            .widgetAccentable()
                    }
                }
                .gaugeStyle(.accessoryCircularCapacity)
            }
        }
        .widgetURL(targetURL)
        .dynamicTypeSize(...DynamicTypeSize.large)
    }
}

struct AccessoryRectangularView: View {
    let entry: CommuteEntry

    private var targetURL: URL {
        URL(string: entry.lines.isEmpty ? "mycommute://lines" : "mycommute://")!
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if entry.lines.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Image(systemName: "tram.fill")
                            .font(.system(size: 11, weight: .bold))
                            .widgetAccentable()
                        Text("My Commute")
                            .font(.system(size: 12, weight: .bold))
                    }
                    Text("Tap to select commute lines")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            } else if entry.disruptedLines.isEmpty {
                // All Clear State: Row 1 Hero + Row 2 Secondary
                HStack(spacing: 5) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 12, weight: .bold))
                        .widgetAccentable()
                        .accessibilityLabel("All lines normal")
                    Text("All Lines Normal")
                        .font(.system(size: 12, weight: .bold))
                        .lineLimit(1)
                }
                .frame(height: 20)

                if entry.isStale {
                    // Demote stale all-clear to relative time
                    HStack(spacing: 4) {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(.system(size: 9))
                            .foregroundColor(.secondary)
                        Text("Updated ")
                            .font(.system(size: 9))
                            .foregroundColor(.secondary) +
                        Text(entry.date, style: .relative)
                            .font(.system(size: 9))
                            .foregroundColor(.secondary) +
                        Text(" ago")
                            .font(.system(size: 9))
                            .foregroundColor(.secondary)
                    }
                    .frame(height: 16)
                } else {
                    HStack(spacing: 4) {
                        Image(systemName: "tram.fill")
                            .font(.system(size: 9))
                            .foregroundColor(.secondary)
                        Text("\(entry.lines.count) lines monitored")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                    .frame(height: 16)
                }
            } else if entry.disruptedLines.count == 1, let worst = entry.worstLine {
                // Exactly 1 line disrupted: Row 1 = Hero Line Name (Full width), Row 2 = Status (Full width)
                HStack(spacing: 5) {
                    Image(systemName: CommuteFormatters.severityIcon(for: worst.level))
                        .font(.system(size: 12, weight: .bold))
                        .widgetAccentable()
                    Text(CommuteFormatters.displayName(for: worst.id))
                        .font(.system(size: 13, weight: .bold))
                        .lineLimit(1)
                }
                .frame(height: 20)

                Text(worst.status)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .frame(height: 16)
            } else if entry.disruptedLines.count == 2, let worst = entry.worstLine, let second = entry.otherLines.first(where: { $0.level != .good }) {
                // Exactly 2 lines disrupted: Row 1 = Worst, Row 2 = Second
                AccessoryRow(line: worst, font: .system(size: 12, weight: .bold))
                    .frame(height: 20)

                AccessoryRow(line: second, font: .system(size: 11, weight: .medium))
                    .frame(height: 16)
            } else if let worst = entry.worstLine {
                // 3+ lines disrupted: Row 1 = Worst, Row 2 = "+N more disrupted" chip
                AccessoryRow(line: worst, font: .system(size: 12, weight: .bold))
                    .frame(height: 20)

                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 10, weight: .semibold))
                        .widgetAccentable()
                    Text("+\(entry.disruptedLines.count - 1) more disrupted")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                .frame(height: 16)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Plus \(entry.disruptedLines.count - 1) other lines disrupted")
            }
        }
        .padding(.vertical, 2)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(targetURL)
        .dynamicTypeSize(...DynamicTypeSize.large)
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

struct CommutePremiumWidget: Widget {
    let kind = "CommutePremiumWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CommuteProvider()) { entry in
            CommutePremiumEntryView(entry: entry)
        }
        .configurationDisplayName("My Commute")
        .description("Live TfL status, colour-coded by your worst delay.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
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
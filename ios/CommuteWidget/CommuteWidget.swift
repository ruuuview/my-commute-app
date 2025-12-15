import WidgetKit
import SwiftUI

// --- 1. DATA MODELS (Must match React Native JSON exactly) ---
struct WidgetData: Decodable {
    let primary: LineData?
    let secondary: LineData?
    let lastUpdated: String
}

struct LineData: Decodable {
    let name: String
    let status: String
    let time: String
    let color: String
    let icon: String
}

// --- 2. TIMELINE PROVIDER (The Data Fetcher) ---
struct Provider: TimelineProvider {
    // REPLACE THIS WITH YOUR EXACT APP GROUP ID
    let appGroupID = "group.com.mycommute.app"

    func placeholder(in context: Context) -> SimpleEntry {
        // A dummy entry for the preview gallery
        SimpleEntry(date: Date(), data: WidgetData(
            primary: LineData(name: "Northern", status: "Part Closure", time: "--", color: "#D70015", icon: "🛑"),
            secondary: LineData(name: "Victoria", status: "Good Service", time: "2 min", color: "#008000", icon: "✅"),
            lastUpdated: ""
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let entry = readDataFromAppGroup()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        let entry = readDataFromAppGroup()
        
        // Refresh the widget every 15 minutes automatically
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
    
    // --- HELPER: Read JSON from React Native ---
    func readDataFromAppGroup() -> SimpleEntry {
        let userDefaults = UserDefaults(suiteName: appGroupID)
        
        if let jsonData = userDefaults?.string(forKey: "widgetData")?.data(using: .utf8) {
            do {
                let decodedData = try JSONDecoder().decode(WidgetData.self, from: jsonData)
                return SimpleEntry(date: Date(), data: decodedData)
            } catch {
                print("Error decoding JSON: \(error)")
            }
        }
        
        // Fallback if no data found (The "Empty State")
        return SimpleEntry(date: Date(), data: nil)
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let data: WidgetData?
}

// --- 3. THE WIDGET VIEW (The UI) ---
struct CommuteWidgetEntryView : View {
    var entry: Provider.Entry

    var body: some View {
        ZStack {
            // Background Color (Light Grey)
            Color(red: 0.97, green: 0.97, blue: 0.97)
            
            if let widgetData = entry.data {
                VStack(spacing: 0) {
                    
                    // --- ROW 1: PRIMARY (Top Priority) ---
                    if let primary = widgetData.primary {
                        LineRow(line: primary, isTop: true)
                    }
                    
                    // Divider
                    Rectangle()
                        .fill(Color.gray.opacity(0.2))
                        .frame(height: 1)
                    
                    // --- ROW 2: SECONDARY ---
                    if let secondary = widgetData.secondary {
                        LineRow(line: secondary, isTop: false)
                    }
                }
            } else {
                // Empty State (User hasn't opened app yet)
                VStack {
                    Text("MY COMMUTE")
                        .font(.system(size: 14, weight: .black))
                        .foregroundColor(.gray)
                    Text("Open app to sync lines")
                        .font(.caption)
                        .foregroundColor(.gray.opacity(0.7))
                }
            }
        }
    }
}

// --- 4. SUB-COMPONENT: A Single Row ---
struct LineRow: View {
    let line: LineData
    let isTop: Bool
    
    var body: some View {
        HStack {
            // Left Side: Icon + Name + Status
            VStack(alignment: .leading, spacing: 4) {
                Text(line.name.uppercased())
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundColor(Color.black)
                
                HStack(spacing: 4) {
                    Text(line.icon)
                        .font(.caption2)
                    Text(line.status.uppercased())
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Color(hex: line.color))
                }
            }
            
            Spacer()
            
            // Right Side: Time or "CLOSED" Pill
            if line.time == "--" {
                // Closed Pill
                Text("CLOSED")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(Color(hex: line.color))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color(hex: line.color).opacity(0.15))
                    .cornerRadius(6)
            } else {
                // Time
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(line.time)
                        .font(.system(size: 28, weight: .heavy))
                    Text("min")
                        .font(.system(size: 12, weight: .bold))
                }
                .foregroundColor(.black)
            }
        }
        .padding(.horizontal, 16)
        .frame(maxHeight: .infinity)
        .background(Color.white)
    }
}

// --- 5. COLOR HELPER (Hex to SwiftUI Color) ---
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// --- 6. WIDGET CONFIGURATION ---
@main
struct CommuteWidget: Widget {
    let kind: String = "CommuteWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            CommuteWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Commute Status")
        .description("Live status of your priority lines.")
        .supportedFamilies([.systemMedium]) // We limit to Medium (The Rectangle)
    }
}


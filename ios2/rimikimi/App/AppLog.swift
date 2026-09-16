import OSLog

enum AppLog {
    static let ui = Logger(subsystem: Config.bundleID, category: "ui")
    static let auth = Logger(subsystem: Config.bundleID, category: "auth")
    static let api = Logger(subsystem: Config.bundleID, category: "api")
}

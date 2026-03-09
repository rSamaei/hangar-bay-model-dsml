-- Users (simple, no password)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Sessions (token-based)
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Aircraft
CREATE TABLE IF NOT EXISTS aircraft (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    wingspan REAL NOT NULL,
    length REAL NOT NULL,
    height REAL NOT NULL,
    tail_height REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
);

-- Hangars
CREATE TABLE IF NOT EXISTS hangars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
);

-- Hangar Bays
CREATE TABLE IF NOT EXISTS hangar_bays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hangar_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    width REAL NOT NULL,
    depth REAL NOT NULL,
    height REAL NOT NULL,
    FOREIGN KEY (hangar_id) REFERENCES hangars(id) ON DELETE CASCADE,
    UNIQUE(hangar_id, name)
);

-- Schedule Entries: User just specifies WHAT aircraft and WHEN
-- The WHERE (hangar/bays) is computed automatically by the scheduler
CREATE TABLE IF NOT EXISTS schedule_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    aircraft_id INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE CASCADE
);

-- Legacy tables (kept for backwards compatibility)
CREATE TABLE IF NOT EXISTS inductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    aircraft_id INTEGER NOT NULL,
    hangar_id INTEGER NOT NULL,
    bays TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE CASCADE,
    FOREIGN KEY (hangar_id) REFERENCES hangars(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auto_inductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    aircraft_id INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL,
    preferred_hangar_id INTEGER,
    not_before TEXT,
    not_after TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE CASCADE,
    FOREIGN KEY (preferred_hangar_id) REFERENCES hangars(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_aircraft_user ON aircraft(user_id);
CREATE INDEX IF NOT EXISTS idx_hangars_user ON hangars(user_id);
CREATE INDEX IF NOT EXISTS idx_hangar_bays_hangar ON hangar_bays(hangar_id);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_user ON schedule_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_inductions_user ON inductions(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_inductions_user ON auto_inductions(user_id);

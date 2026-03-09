import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = path.join(__dirname, 'airfield.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(database: Database.Database): void {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// User operations
export interface User {
  id: number;
  username: string;
  created_at: string;
}

export function findOrCreateUser(username: string): User {
  const db = getDatabase();

  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;

  if (!user) {
    const result = db.prepare('INSERT INTO users (username) VALUES (?)').run(username);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;
  }

  return user;
}

export function getUserById(id: number): User | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

// Session operations
export interface Session {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
}

export function createSession(userId: number, token: string, expiresAt: Date): Session {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)'
  ).run(userId, token, expiresAt.toISOString());

  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid) as Session;
}

export function getSessionByToken(token: string): (Session & { username: string }) | undefined {
  const db = getDatabase();
  return db.prepare(`
    SELECT s.*, u.username
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as (Session & { username: string }) | undefined;
}

export function deleteSession(token: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function cleanExpiredSessions(): void {
  const db = getDatabase();
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}

// Aircraft operations
export interface Aircraft {
  id: number;
  user_id: number;
  name: string;
  wingspan: number;
  length: number;
  height: number;
  tail_height: number;
  created_at: string;
}

export function getAircraftByUser(userId: number): Aircraft[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM aircraft WHERE user_id = ? ORDER BY name').all(userId) as Aircraft[];
}

export function getAircraftById(id: number, userId: number): Aircraft | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM aircraft WHERE id = ? AND user_id = ?').get(id, userId) as Aircraft | undefined;
}

export function createAircraft(userId: number, data: Omit<Aircraft, 'id' | 'user_id' | 'created_at'>): Aircraft {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO aircraft (user_id, name, wingspan, length, height, tail_height)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, data.name, data.wingspan, data.length, data.height, data.tail_height);

  return db.prepare('SELECT * FROM aircraft WHERE id = ?').get(result.lastInsertRowid) as Aircraft;
}

export function updateAircraft(id: number, userId: number, data: Partial<Omit<Aircraft, 'id' | 'user_id' | 'created_at'>>): Aircraft | undefined {
  const db = getDatabase();
  const existing = getAircraftById(id, userId);
  if (!existing) return undefined;

  const updated = { ...existing, ...data };
  db.prepare(`
    UPDATE aircraft SET name = ?, wingspan = ?, length = ?, height = ?, tail_height = ?
    WHERE id = ? AND user_id = ?
  `).run(updated.name, updated.wingspan, updated.length, updated.height, updated.tail_height, id, userId);

  return getAircraftById(id, userId);
}

export function deleteAircraft(id: number, userId: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM aircraft WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
}

// Hangar operations
export interface Hangar {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
}

export interface HangarBay {
  id: number;
  hangar_id: number;
  name: string;
  width: number;
  depth: number;
  height: number;
}

export interface HangarWithBays extends Hangar {
  bays: HangarBay[];
}

export function getHangarsByUser(userId: number): HangarWithBays[] {
  const db = getDatabase();

  type Row = Hangar & {
    bay_id: number | null;
    bay_name: string | null;
    bay_width: number | null;
    bay_depth: number | null;
    bay_height: number | null;
  };

  const rows = db.prepare(`
    SELECT h.id, h.user_id, h.name, h.created_at,
           b.id AS bay_id, b.name AS bay_name, b.width AS bay_width, b.depth AS bay_depth, b.height AS bay_height
    FROM hangars h
    LEFT JOIN hangar_bays b ON b.hangar_id = h.id
    WHERE h.user_id = ?
    ORDER BY h.name, b.name
  `).all(userId) as Row[];

  const map = new Map<number, HangarWithBays>();
  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, { id: row.id, user_id: row.user_id, name: row.name, created_at: row.created_at, bays: [] });
    }
    if (row.bay_id !== null) {
      map.get(row.id)!.bays.push({
        id: row.bay_id,
        hangar_id: row.id,
        name: row.bay_name!,
        width: row.bay_width!,
        depth: row.bay_depth!,
        height: row.bay_height!
      });
    }
  }
  return [...map.values()];
}

export function getHangarById(id: number, userId: number): HangarWithBays | undefined {
  const db = getDatabase();
  const hangar = db.prepare('SELECT * FROM hangars WHERE id = ? AND user_id = ?').get(id, userId) as Hangar | undefined;
  if (!hangar) return undefined;

  return {
    ...hangar,
    bays: db.prepare('SELECT * FROM hangar_bays WHERE hangar_id = ? ORDER BY name').all(hangar.id) as HangarBay[]
  };
}

export function createHangar(userId: number, name: string, bays: Omit<HangarBay, 'id' | 'hangar_id'>[]): HangarWithBays {
  const db = getDatabase();

  const result = db.prepare('INSERT INTO hangars (user_id, name) VALUES (?, ?)').run(userId, name);
  const hangarId = result.lastInsertRowid as number;

  const insertBay = db.prepare(`
    INSERT INTO hangar_bays (hangar_id, name, width, depth, height)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const bay of bays) {
    insertBay.run(hangarId, bay.name, bay.width, bay.depth, bay.height);
  }

  return getHangarById(hangarId, userId)!;
}

export function updateHangar(id: number, userId: number, name: string, bays: Omit<HangarBay, 'id' | 'hangar_id'>[]): HangarWithBays | undefined {
  const db = getDatabase();
  const existing = getHangarById(id, userId);
  if (!existing) return undefined;

  db.prepare('UPDATE hangars SET name = ? WHERE id = ?').run(name, id);
  db.prepare('DELETE FROM hangar_bays WHERE hangar_id = ?').run(id);

  const insertBay = db.prepare(`
    INSERT INTO hangar_bays (hangar_id, name, width, depth, height)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const bay of bays) {
    insertBay.run(id, bay.name, bay.width, bay.depth, bay.height);
  }

  return getHangarById(id, userId);
}

export function deleteHangar(id: number, userId: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM hangars WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
}

// Schedule Entry operations
export interface ScheduleEntry {
  id: number;
  user_id: number;
  aircraft_id: number;
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface ScheduleEntryWithDetails extends ScheduleEntry {
  aircraft_name: string;
  wingspan: number;
  length: number;
  height: number;
  tail_height: number;
}

export function getScheduleEntriesByUser(userId: number): ScheduleEntryWithDetails[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT se.*, a.name as aircraft_name, a.wingspan, a.length, a.height, a.tail_height
    FROM schedule_entries se
    JOIN aircraft a ON se.aircraft_id = a.id
    WHERE se.user_id = ?
    ORDER BY se.start_time
  `).all(userId) as ScheduleEntryWithDetails[];
}

export function createScheduleEntry(userId: number, data: {
  aircraft_id: number;
  start_time: string;
  end_time: string;
}): ScheduleEntry {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO schedule_entries (user_id, aircraft_id, start_time, end_time)
    VALUES (?, ?, ?, ?)
  `).run(userId, data.aircraft_id, data.start_time, data.end_time);

  return db.prepare('SELECT * FROM schedule_entries WHERE id = ?').get(result.lastInsertRowid) as ScheduleEntry;
}

export function createScheduleEntries(userId: number, entries: Array<{
  aircraft_id: number;
  start_time: string;
  end_time: string;
}>): ScheduleEntry[] {
  if (entries.length === 0) return [];

  const db = getDatabase();
  const insertStmt = db.prepare(`
    INSERT INTO schedule_entries (user_id, aircraft_id, start_time, end_time)
    VALUES (?, ?, ?, ?)
  `);

  const ids: number[] = [];
  db.transaction(() => {
    for (const entry of entries) {
      const result = insertStmt.run(userId, entry.aircraft_id, entry.start_time, entry.end_time);
      ids.push(result.lastInsertRowid as number);
    }
  })();

  const placeholders = ids.map(() => '?').join(', ');
  return db.prepare(`SELECT * FROM schedule_entries WHERE id IN (${placeholders}) ORDER BY id`)
    .all(...ids) as ScheduleEntry[];
}

export function deleteScheduleEntry(id: number, userId: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM schedule_entries WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
}

export function updateScheduleEntry(
  id: number,
  userId: number,
  data: { start_time: string; end_time: string }
): ScheduleEntry | undefined {
  const db = getDatabase();
  const result = db.prepare(
    'UPDATE schedule_entries SET start_time = ?, end_time = ? WHERE id = ? AND user_id = ?'
  ).run(data.start_time, data.end_time, id, userId);
  if (result.changes === 0) return undefined;
  return db.prepare('SELECT * FROM schedule_entries WHERE id = ?').get(id) as ScheduleEntry;
}

export function clearAllScheduleEntries(userId: number): number {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM schedule_entries WHERE user_id = ?').run(userId);
  return result.changes;
}

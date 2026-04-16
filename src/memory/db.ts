import Database from 'better-sqlite3';
import { env } from '../config/env.js';

// En modo nube (Render/Cloud Run), el filesystem es efímero — usar SQLite in-memory
// En modo local, usar archivo persistente
let db: InstanceType<typeof Database>;
try {
    const isCloud = !!env.WEBHOOK_URL;
    if (isCloud) {
        db = new Database(':memory:');
        console.log("[DB] Modo nube detectado — usando SQLite in-memory (Firestore es la fuente primaria).");
    } else {
        db = new Database(env.DB_PATH);
        console.log(`[DB] SQLite local inicializado: ${env.DB_PATH}`);
    }
} catch (e: any) {
    console.warn(`[DB] Error abriendo SQLite (${e.message}), usando in-memory como fallback.`);
    db = new Database(':memory:');
}

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export interface MessageRow {
    id: number;
    user_id: number;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    timestamp: string;
}

export function saveMessage(userId: number, role: 'system' | 'user' | 'assistant' | 'tool', content: string) {
    const stmt = db.prepare('INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)');
    stmt.run(userId, role, content);
}

export function getMessages(userId: number, limit: number = 50): MessageRow[] {
    const stmt = db.prepare('SELECT * FROM messages WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?');
    return (stmt.all(userId, limit) as MessageRow[]).reverse();
}

export function clearMessages(userId: number) {
    const stmt = db.prepare('DELETE FROM messages WHERE user_id = ?');
    stmt.run(userId);
}

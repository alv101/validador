import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { HistoryEntry } from "@/types/history";

type LocalDB = DBSchema & {
  history: {
    key: string;
    value: HistoryEntry;
  };
};

let dbPromise: Promise<IDBPDatabase<LocalDB>> | null = null;

function getDb(): Promise<IDBPDatabase<LocalDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LocalDB>("validador-pwa", 2, {
      upgrade(db) {
        const rawDb = db as unknown as IDBDatabase;
        if (rawDb.objectStoreNames.contains("queue")) {
          rawDb.deleteObjectStore("queue");
        }

        if (!db.objectStoreNames.contains("history")) {
          db.createObjectStore("history", { keyPath: "id" });
        }
      },
    });
  }

  return dbPromise;
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  const db = await getDb();
  await db.put("history", entry);

  const history = await db.getAll("history");
  if (history.length <= 100) return;

  const toDelete = history
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, history.length - 100);

  for (const item of toDelete) {
    await db.delete("history", item.id);
  }
}

export async function getHistoryEntries(): Promise<HistoryEntry[]> {
  const db = await getDb();
  const items = await db.getAll("history");
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

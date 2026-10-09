import { describe, expect, it } from "vitest"
import { createTestDatabase, migrationNames, migrationSql } from "../helpers/db"

const PER_STREAMER = "20261008235900_queue_per_streamer"

/** Base con el esquema anterior a las colas por streamer y datos de entonces. */
async function legacyDatabase(users: string) {
  const names = migrationNames()
  const pg = await createTestDatabase(names[names.indexOf(PER_STREAMER) - 1])

  await pg.exec(`
    INSERT INTO "User"(id, username, password, role, "createdAt", "updatedAt") VALUES ${users};
    INSERT INTO "Song"(id, "youtubeId", title, channel, thumbnail) VALUES
      ('s1', 'v1', 'Uno', 'c', ''), ('s2', 'v2', 'Dos', 'c', '');
    INSERT INTO "QueueItem"(id, position, "songId") VALUES ('q1', 1, 's1'), ('q2', 2, 's2');
    INSERT INTO "HistoryItem"(id, "songId") VALUES ('h1', 's1');
  `)
  return pg
}

describe("migración a colas por streamer", () => {
  it("es la última migración del proyecto", () => {
    expect(migrationNames().at(-1)).toBe(PER_STREAMER)
  })

  it("entrega la cola y el historial compartidos al streamer más antiguo", async () => {
    const pg = await legacyDatabase(`
      ('admin', 'admin', 'x', 'admin', '2026-01-01', now()),
      ('nueva', 'nueva', 'x', 'streamer', '2026-03-01', now()),
      ('veterana', 'veterana', 'x', 'streamer', '2026-02-01', now())
    `)

    await pg.exec(migrationSql(PER_STREAMER))

    const queue = await pg.query<{ id: string; streamerId: string }>(
      `SELECT id, "streamerId" FROM "QueueItem" ORDER BY position`
    )
    expect(queue.rows).toEqual([
      { id: "q1", streamerId: "veterana" },
      { id: "q2", streamerId: "veterana" },
    ])
    const history = await pg.query<{ streamerId: string }>(
      `SELECT "streamerId" FROM "HistoryItem"`
    )
    expect(history.rows).toEqual([{ streamerId: "veterana" }])
  })

  it("si no hay ningún streamer, descarta la cola y el historial sin fallar", async () => {
    const pg = await legacyDatabase(`('admin', 'admin', 'x', 'admin', '2026-01-01', now())`)

    await pg.exec(migrationSql(PER_STREAMER))

    const counts = await pg.query<{ queue: number; history: number; songs: number }>(`
      SELECT (SELECT count(*)::int FROM "QueueItem") AS queue,
             (SELECT count(*)::int FROM "HistoryItem") AS history,
             (SELECT count(*)::int FROM "Song") AS songs
    `)
    expect(counts.rows[0]).toEqual({ queue: 0, history: 0, songs: 2 })
  })

  it("después, una canción en la cola necesita un streamer que exista", async () => {
    const pg = await createTestDatabase()
    await pg.exec(`INSERT INTO "Song"(id, "youtubeId", title, channel, thumbnail)
                   VALUES ('s1', 'v1', 'Uno', 'c', '')`)

    await expect(
      pg.exec(`INSERT INTO "QueueItem"(id, position, "songId") VALUES ('q1', 1, 's1')`)
    ).rejects.toThrow(/streamerId/)
    await expect(
      pg.exec(`INSERT INTO "QueueItem"(id, position, "songId", "streamerId")
               VALUES ('q1', 1, 's1', 'no-existe')`)
    ).rejects.toThrow(/foreign key/)
  })
})

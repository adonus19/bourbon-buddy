/**
 * findOrCreateBourbon (BB-230a): resolve a share to a shared catalog id so both
 * sides key on the same bottle — reusing the same match order the extraction
 * path uses (nameNormalized → aliases → nameLowercase → create).
 */
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "SERVER_TS" },
}));

import { findOrCreateBourbon } from "./catalog";

interface Row {
  id: string;
  data: Record<string, unknown>;
}

interface DocDouble {
  id: string;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

/** Minimal in-memory Firestore double for the `bourbons` collection. */
function makeDb(rows: Row[]) {
  const created: Array<{ id: string; data: Record<string, unknown> }> = [];
  let autoId = 0;
  const toDoc = (r: Row): DocDouble => ({
    id: r.id,
    exists: true,
    data: () => r.data,
  });
  const match = (field: string, op: string, val: unknown): Row[] =>
    rows.filter((r) =>
      op === "array-contains"
        ? Array.isArray(r.data[field]) &&
          (r.data[field] as unknown[]).includes(val)
        : r.data[field] === val
    );
  const col = {
    where(field: string, op: string, val: unknown) {
      const results = match(field, op, val);
      return {
        limit: () => ({
          get: () =>
            Promise.resolve({
              empty: results.length === 0,
              docs: results.map(toDoc),
            }),
        }),
      };
    },
    doc(id?: string) {
      if (id) {
        const found = rows.find((r) => r.id === id);
        return {
          id,
          get: (): Promise<DocDouble> =>
            Promise.resolve(
              found ? toDoc(found) : { id, exists: false, data: () => undefined }
            ),
          set: (data: Record<string, unknown>) => {
            created.push({ id, data });
            return Promise.resolve();
          },
        };
      }
      const newId = `new-${++autoId}`;
      return {
        id: newId,
        set: (data: Record<string, unknown>) => {
          created.push({ id: newId, data });
          rows.push({ id: newId, data });
          return Promise.resolve();
        },
      };
    },
  };
  return { db: { collection: () => col } as never, created };
}

describe("findOrCreateBourbon (BB-230a)", () => {
  const base = { createdByUserId: "u1" };

  it("returns the existing catalog doc when bourbonId resolves", async () => {
    const { db, created } = makeDb([
      { id: "b1", data: { name: "Weller 12", distillery: "BT", category: "bourbon" } },
    ]);
    const res = await findOrCreateBourbon(db, { ...base, bourbonId: "b1" });
    expect(res).toEqual({
      id: "b1",
      name: "Weller 12",
      distillery: "BT",
      category: "bourbon",
    });
    expect(created).toHaveLength(0); // no write
  });

  it("matches an existing bottle by normalized name (no duplicate created)", async () => {
    const { db, created } = makeDb([
      {
        id: "b2",
        data: {
          name: "Blanton's Single Barrel",
          nameNormalized: "blantons single barrel",
          distillery: "BT",
          category: "bourbon",
        },
      },
    ]);
    const res = await findOrCreateBourbon(db, {
      ...base,
      name: "blantons single barrel",
    });
    expect(res.id).toBe("b2");
    expect(created).toHaveLength(0);
  });

  it("matches by alias, then by lowercase name", async () => {
    const { db } = makeDb([
      { id: "b3", data: { name: "EH Taylor", aliases: ["eh taylor small batch"] } },
      { id: "b4", data: { name: "Old Forester 86", nameLowercase: "old forester 86" } },
    ]);
    expect((await findOrCreateBourbon(db, { ...base, name: "EH Taylor Small Batch" })).id).toBe(
      "b3"
    );
    expect((await findOrCreateBourbon(db, { ...base, name: "Old Forester 86" })).id).toBe("b4");
  });

  it("creates a new catalog doc with normalized keys when nothing matches", async () => {
    const { db, created } = makeDb([]);
    const res = await findOrCreateBourbon(db, {
      ...base,
      name: "The Lakes Chocolatier",
      distillery: "The Lakes",
      category: "world_other",
    });
    expect(res.id).toBe("new-1");
    expect(created).toHaveLength(1);
    expect(created[0].data).toMatchObject({
      name: "The Lakes Chocolatier",
      nameLowercase: "the lakes chocolatier",
      nameNormalized: "the lakes chocolatier",
      aliases: [],
      distillery: "The Lakes",
      category: "world_other",
      createdByUserId: "u1",
    });
  });

  it("falls back to name lookup when bourbonId is given but does not resolve", async () => {
    const { db, created } = makeDb([
      { id: "b5", data: { name: "Larceny", nameNormalized: "larceny" } },
    ]);
    const res = await findOrCreateBourbon(db, {
      ...base,
      bourbonId: "missing",
      name: "Larceny",
    });
    expect(res.id).toBe("b5");
    expect(created).toHaveLength(0);
  });

  it("throws when neither a resolvable id nor a name is given", async () => {
    const { db } = makeDb([]);
    await expect(findOrCreateBourbon(db, { ...base })).rejects.toThrow();
  });
});

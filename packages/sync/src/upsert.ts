// TontiHelm — upsert par identifiant : la brique de fusion du pull delta.
// Les objets remplacés gardent la position de l'original (ordre stable des
// listes — quartiers puis noms côté tournée), les nouveaux arrivent en fin.
export function upsertById<T>(list: T[], incoming: T[], keyOf: (item: T) => string): T[] {
  if (incoming.length === 0) return list;
  const map = new Map(list.map((item) => [keyOf(item), item]));
  const order = list.map((item) => keyOf(item));
  for (const item of incoming) {
    const key = keyOf(item);
    if (!map.has(key)) order.push(key);
    map.set(key, item);
  }
  return order.map((key) => map.get(key) as T);
}

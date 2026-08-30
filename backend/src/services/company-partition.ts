export function partitionByEmpresa<T extends { empresaId: string }>(
  rows: readonly T[],
): Map<string, T[]> {
  const partitions = new Map<string, T[]>();
  for (const row of rows) {
    const partition = partitions.get(row.empresaId) ?? [];
    partition.push(row);
    partitions.set(row.empresaId, partition);
  }
  return partitions;
}

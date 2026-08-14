interface WordDropSurfaceEdge {
  id: number;
  start: string;
  end: string;
  direction: number;
}

export function buildWordDropCellPath(
  cells: Set<string>,
  boardSize: number,
  cellSize: number,
  options: { boardDimension?: number; gap?: number; cornerRadius?: number } = {},
) {
  if (cells.size === 0) return "";
  const boardDimension = options.boardDimension ?? 15;
  const gap = options.gap ?? 1;
  const cornerRadius = options.cornerRadius ?? Math.min(2, cellSize * 0.12);
  const edges: WordDropSurfaceEdge[] = [];
  const addEdge = (startRow: number, startCol: number, endRow: number, endCol: number, direction: number) => {
    edges.push({
      id: edges.length,
      start: `${startRow}:${startCol}`,
      end: `${endRow}:${endCol}`,
      direction,
    });
  };

  for (const key of cells) {
    const [row, col] = key.split(":").map(Number);
    if (!cells.has(`${row - 1}:${col}`)) addEdge(row, col, row, col + 1, 0);
    if (!cells.has(`${row}:${col + 1}`)) addEdge(row, col + 1, row + 1, col + 1, 1);
    if (!cells.has(`${row + 1}:${col}`)) addEdge(row + 1, col + 1, row + 1, col, 2);
    if (!cells.has(`${row}:${col - 1}`)) addEdge(row + 1, col, row, col, 3);
  }

  const edgesByStart = new Map<string, WordDropSurfaceEdge[]>();
  for (const edge of edges) {
    const outgoing = edgesByStart.get(edge.start) ?? [];
    outgoing.push(edge);
    edgesByStart.set(edge.start, outgoing);
  }
  const visited = new Set<number>();
  const stride = cellSize + gap;
  const coordinate = (vertex: string) => {
    const [row, col] = vertex.split(":").map(Number);
    const x = col === 0 ? 0 : col === boardDimension ? boardSize : col * stride - gap / 2;
    const y = row === 0 ? 0 : row === boardDimension ? boardSize : row * stride - gap / 2;
    return { x, y };
  };
  const roundedPath = (rawPoints: Array<{ x: number; y: number }>) => {
    const points = rawPoints.length > 1
      && rawPoints[0].x === rawPoints[rawPoints.length - 1].x
      && rawPoints[0].y === rawPoints[rawPoints.length - 1].y
      ? rawPoints.slice(0, -1)
      : rawPoints;
    if (points.length < 3) return "";
    const toward = (from: { x: number; y: number }, to: { x: number; y: number }, distance: number) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy);
      const ratio = length === 0 ? 0 : Math.min(distance, length / 2) / length;
      return { x: from.x + dx * ratio, y: from.y + dy * ratio };
    };
    const commands: string[] = [];
    points.forEach((point, index) => {
      const previous = points[(index - 1 + points.length) % points.length];
      const next = points[(index + 1) % points.length];
      const before = toward(point, previous, cornerRadius);
      const after = toward(point, next, cornerRadius);
      commands.push(index === 0 ? `M ${before.x} ${before.y}` : `L ${before.x} ${before.y}`);
      commands.push(`Q ${point.x} ${point.y} ${after.x} ${after.y}`);
    });
    commands.push("Z");
    return commands.join(" ");
  };

  const paths: string[] = [];
  for (const first of edges) {
    if (visited.has(first.id)) continue;
    const points = [coordinate(first.start)];
    let current = first;
    while (!visited.has(current.id)) {
      visited.add(current.id);
      points.push(coordinate(current.end));
      if (current.end === first.start) break;
      const candidates = (edgesByStart.get(current.end) ?? []).filter((edge) => !visited.has(edge.id));
      if (candidates.length === 0) break;
      candidates.sort((left, right) => {
        const rank = (edge: WordDropSurfaceEdge) => {
          const turn = (edge.direction - current.direction + 4) % 4;
          return turn === 1 ? 0 : turn === 0 ? 1 : turn === 3 ? 2 : 3;
        };
        return rank(left) - rank(right);
      });
      current = candidates[0];
    }
    const path = roundedPath(points);
    if (path) paths.push(path);
  }
  return paths.join(" ");
}

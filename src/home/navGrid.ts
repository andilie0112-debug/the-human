// Grid A* pathfinding for indoor rooms (pure TypeScript, no three.js).
// The room is centred on the origin; cells are square. Paths are smoothed with line-of-sight.

export interface Point {
  x: number;
  z: number;
}

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;
  private readonly x0: number;
  private readonly z0: number;

  constructor(width: number, depth: number, readonly cell = 0.2) {
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(depth / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.x0 = -width / 2;
    this.z0 = -depth / 2;
  }

  private center(c: number, r: number): Point {
    return { x: this.x0 + (c + 0.5) * this.cell, z: this.z0 + (r + 0.5) * this.cell };
  }

  private cellOf(p: Point): [number, number] {
    return [
      Math.min(this.cols - 1, Math.max(0, Math.floor((p.x - this.x0) / this.cell))),
      Math.min(this.rows - 1, Math.max(0, Math.floor((p.z - this.z0) / this.cell))),
    ];
  }

  /** Copy of the blocked cells (to restore after rebuilding the furniture). */
  snapshot(): Uint8Array {
    return this.blocked.slice();
  }

  restore(cells: Uint8Array): void {
    this.blocked.set(cells);
  }

  isBlockedAt(p: Point): boolean {
    const [c, r] = this.cellOf(p);
    return this.blocked[r * this.cols + c] === 1;
  }

  /** Blocks cells whose centre lies inside a rectangle (optionally rotated, degrees around Y). */
  blockRect(cx: number, cz: number, w: number, d: number, rotDeg = 0, inflate = 0): void {
    const a = (-rotDeg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const hw = w / 2 + inflate;
    const hd = d / 2 + inflate;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.center(c, r);
        const dx = p.x - cx;
        const dz = p.z - cz;
        // Rotate into the rectangle's local frame.
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) this.blocked[r * this.cols + c] = 1;
      }
    }
  }

  /** Blocks the outer border so agents keep `margin` metres from the walls. */
  blockBorder(margin: number): void {
    const n = Math.ceil(margin / this.cell);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (c < n || r < n || c >= this.cols - n || r >= this.rows - n) this.blocked[r * this.cols + c] = 1;
      }
    }
  }

  /** Clears a rectangle (used for door openings). */
  clearRect(cx: number, cz: number, w: number, d: number): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.center(c, r);
        if (Math.abs(p.x - cx) <= w / 2 && Math.abs(p.z - cz) <= d / 2) this.blocked[r * this.cols + c] = 0;
      }
    }
  }

  /** Nearest walkable cell centre to a point (breadth-first over rings). */
  nearestFree(p: Point): Point | null {
    const [c0, r0] = this.cellOf(p);
    if (!this.blocked[r0 * this.cols + c0]) return this.center(c0, r0);
    let best: Point | null = null;
    let bestD = Infinity;
    for (let ring = 1; ring < Math.max(this.cols, this.rows); ring++) {
      for (let r = r0 - ring; r <= r0 + ring; r++) {
        for (let c = c0 - ring; c <= c0 + ring; c++) {
          if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== ring) continue;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows || this.blocked[r * this.cols + c]) continue;
          const q = this.center(c, r);
          const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = q;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Straight walk possible between two points (samples every half cell). */
  lineOfSight(a: Point, b: Point): boolean {
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(dist / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.isBlockedAt({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  }

  /**
   * Path from `from` to `to` as waypoints (excluding `from`), or null if unreachable.
   * A blocked target is moved to the nearest free cell.
   */
  findPath(from: Point, to: Point): Point[] | null {
    const start = this.isBlockedAt(from) ? this.nearestFree(from) : from;
    const goal = this.isBlockedAt(to) ? this.nearestFree(to) : to;
    if (!start || !goal) return null;
    if (this.lineOfSight(start, goal)) return [goal];

    const [sc, sr] = this.cellOf(start);
    const [gc, gr] = this.cellOf(goal);
    const n = this.cols * this.rows;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open: number[] = [];
    const f = new Float32Array(n).fill(Infinity);
    const h = (i: number): number => {
      const dc = Math.abs((i % this.cols) - gc);
      const dr = Math.abs(Math.floor(i / this.cols) - gr);
      return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
    };
    const s = sr * this.cols + sc;
    const goalIdx = gr * this.cols + gc;
    g[s] = 0;
    f[s] = h(s);
    open.push(s);

    while (open.length > 0) {
      // Small grids: a linear scan for the lowest f is fast enough and allocation-free.
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goalIdx) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % this.cols;
      const cr = Math.floor(cur / this.cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
          const ni = nr * this.cols + nc;
          if (this.blocked[ni] || closed[ni]) continue;
          // No corner cutting through blocked cells.
          if (dc && dr && (this.blocked[cr * this.cols + nc] || this.blocked[nr * this.cols + cc])) continue;
          const cost = g[cur] + (dc && dr ? Math.SQRT2 : 1);
          if (cost < g[ni]) {
            g[ni] = cost;
            f[ni] = cost + h(ni);
            came[ni] = cur;
            open.push(ni);
          }
        }
      }
    }
    if (came[goalIdx] === -1 && goalIdx !== s) return null;

    const cells: Point[] = [];
    for (let i = goalIdx; i !== -1 && i !== s; i = came[i]) cells.unshift(this.center(i % this.cols, Math.floor(i / this.cols)));
    cells[cells.length - 1] = goal;

    // String-pulling: skip waypoints that are directly visible.
    const path: Point[] = [];
    let anchor = start;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.lineOfSight(anchor, cells[j])) j--;
      path.push(cells[j]);
      anchor = cells[j];
      i = j + 1;
    }
    return path;
  }
}

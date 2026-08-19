import { memo, useEffect, useMemo, useReducer, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

/*
 * The fog bank over the squares a Fog of War player cannot see.
 *
 * It is drawn as one continuous mass, not a cloud per square, in three layers:
 *
 *   slab   — a flat cell behind every fogged square, tinted from a ramp that
 *            runs across the whole board. Because the ramp is global, adjacent
 *            slabs merge invisibly, and because the slabs are opaque, no gap can
 *            ever open in the middle of the bank.
 *   wall   — the extruded side, drawn as the cloud's own silhouette offset down
 *            and right in shadow and laid *under* the slabs, so it shows only
 *            where the bank actually ends. Drawing it as flat strips instead
 *            gave the bank hard ninety-degree corners in a colour nothing else
 *            on the board used, which is exactly what a cloud should not have.
 *   bumps  — rounded cubes riding the surface and the silhouette, each with its
 *            own light-to-shadow ramp (that is what gives them form) whose ends
 *            are slid along the same global gradient (that is what keeps the
 *            bank reading as one thing lit from one direction). This is the only
 *            layer that moves.
 *
 * react-native-svg ships feTurbulence and the lighting filters as stubs that
 * warn and render nothing, so all of the volume here is geometry and gradients.
 *
 * Nothing may reach more than REACH + DRIFT past a fogged square. A piece is
 * drawn at 66% of a cell, centred, so it starts 17% in from the edge — keeping
 * the total under that is what guarantees the cloud never creeps over a piece
 * standing on a square the player can see.
 *
 * That budget binds *every* layer, not just the bumps. The two shadow layers
 * were the ones that broke it: the side wall is the silhouette offset by DEPTH,
 * so it inherited the bumps' reach and added to it, and each contact shadow was
 * an ellipse wider than the bump it belonged to. Both are now clamped — the
 * wall to the same bound as the bumps, the contact shadow to inside its own
 * bump — so no shadow can fall on a square the player can see.
 */

const DEPTH = 0.05; // side wall thickness, in cells
const REACH = 0.08; // how far anything may hang past its fogged square
const DRIFT = 0.02; // idle motion amplitude
const INSET = 0.06; // how far the slab pulls back from the edge of the bank
const MAX_WIDE = 3;
const MAX_TALL = 2;

const FACE_LIGHT = "#FFFFFF";
const FACE_DARK = "#AAC0D3";
const BUMP_LIT = ["#FFFFFF", "#DCE8F2"] as const;
const BUMP_SHADE = ["#BCCEDD", "#8CA4BC"] as const;
const WALL_LIGHT = "#8CA4BB";
const WALL_DARK = "#6B839C";

const DRIFTS = [
  { duration: 7400, x: [-DRIFT, DRIFT], y: [-DRIFT, DRIFT] },
  { duration: 8600, x: [DRIFT, -DRIFT], y: [-DRIFT, DRIFT] },
  { duration: 6800, x: [-DRIFT, DRIFT], y: [DRIFT, -DRIFT] },
  { duration: 9200, x: [DRIFT, -DRIFT], y: [DRIFT, -DRIFT] },
] as const;

function noise(key: string, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < key.length; index++) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function mix(from: string, to: string, amount: number): string {
  const parse = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  const t = Math.min(1, Math.max(0, amount));
  const channel = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, "0");
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
}

/** The board-wide light ramp, sampled at a point in board coordinates. */
function ramp(from: string, to: string, column: number, row: number): string {
  return mix(from, to, (column + row) / 14);
}

interface Slab {
  square: string;
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
}

interface Bump {
  x: number;
  y: number;
  size: number;
  radius: number;
  lit: string;
  shade: string;
  /** Tone of this bump's side wall, from the same board-wide ramp. */
  wall: string;
  /** Where that side wall sits: offset by DEPTH, but never past the budget. */
  wallX: number;
  wallY: number;
  order: number;
}

interface Group {
  key: string;
  column: number;
  row: number;
  width: number;
  height: number;
  bumps: Bump[];
}

/**
 * Merge the fogged squares into a few chunky rectangles. Capped, so a big fog
 * bank breaks into blocks rather than becoming one enormous slab, and greedy in
 * board order, so the same fog always produces the same blocks.
 */
function buildGroups(squares: string[], fogged: Set<string>, isFogged: (c: number, r: number) => boolean): Group[] {
  const taken = new Set<string>();
  const groups: Group[] = [];

  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      if (!isFogged(column, row) || taken.has(`${column},${row}`)) continue;

      let width = 1;
      while (width < MAX_WIDE && isFogged(column + width, row) && !taken.has(`${column + width},${row}`)) width++;

      let height = 1;
      while (height < MAX_TALL) {
        let full = true;
        for (let step = 0; step < width; step++) {
          if (!isFogged(column + step, row + height) || taken.has(`${column + step},${row + height}`)) full = false;
        }
        if (!full) break;
        height++;
      }

      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) taken.add(`${column + dx},${row + dy}`);
      }
      groups.push({ key: `${column}:${row}:${width}x${height}`, column, row, width, height, bumps: [] });
    }
  }

  return groups;
}

/**
 * Bumps for one block, on a jittered lattice covering the whole rectangle,
 * perimeter included. Every one is clamped to the REACH budget, so the cloud
 * can bulge past the fog without ever reaching a piece next door.
 */
function buildBumps(group: Group, cell: number, pad: number): Bump[] {
  const reach = cell * REACH;
  const width = group.width * cell;
  const height = group.height * cell;
  const columns = Math.max(1, Math.round(group.width * 1.15));
  const rows = Math.max(1, Math.round(group.height * 1.15));
  const bumps: Bump[] = [];

  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const salt = row * 37 + column * 11;
      const size = cell * (0.62 + noise(group.key, salt + 3) * 0.42);
      const cx = Math.min(
        Math.max(pad + (column / columns) * width + (noise(group.key, salt + 5) - 0.5) * cell * 0.3, pad - reach + size / 2),
        pad + width + reach - size / 2,
      );
      const cy = Math.min(
        Math.max(pad + (row / rows) * height + (noise(group.key, salt + 11) - 0.5) * cell * 0.26, pad - reach + size / 2),
        pad + height + reach - size / 2,
      );
      const boardColumn = group.column + (cx - pad) / cell;
      const boardRow = group.row + (cy - pad) / cell;

      const depth = cell * DEPTH;
      const x = cx - size / 2;
      const y = cy - size / 2;

      bumps.push({
        x,
        y,
        wallX: Math.min(x + depth, pad + width + reach - size),
        wallY: Math.min(y + depth, pad + height + reach - size),
        size,
        radius: size * (0.2 + noise(group.key, salt + 13) * 0.14),
        lit: ramp(BUMP_LIT[0], BUMP_LIT[1], boardColumn, boardRow),
        shade: ramp(BUMP_SHADE[0], BUMP_SHADE[1], boardColumn, boardRow),
        wall: ramp(WALL_LIGHT, WALL_DARK, boardColumn, boardRow),
        order: cx + cy,
      });
    }
  }

  // Back to front, so each bump's contact shadow lands behind the bump in front.
  return bumps.sort((left, right) => left.order - right.order);
}

function buildSlabs(squares: string[], fogged: Set<string>, isFogged: (c: number, r: number) => boolean, cell: number): Slab[] {
  const onBoard = (column: number, row: number) => column >= 0 && column < 8 && row >= 0 && row < 8;
  // Off the board counts as covered: there is nothing out there to show through.
  const covered = (column: number, row: number) => isFogged(column, row) || !onBoard(column, row);

  return squares.flatMap((square, index) => {
    if (!fogged.has(square)) return [];
    const column = index % 8;
    const row = Math.floor(index / 8);

    const insetLeft = covered(column - 1, row) ? 0 : cell * INSET;
    const insetRight = covered(column + 1, row) ? 0 : cell * INSET;
    const insetTop = covered(column, row - 1) ? 0 : cell * INSET;
    const insetBottom = covered(column, row + 1) ? 0 : cell * INSET;

    return [{
      square,
      left: column * cell + insetLeft,
      top: row * cell + insetTop,
      width: cell - insetLeft - insetRight,
      height: cell - insetTop - insetBottom,
      color: ramp(FACE_LIGHT, FACE_DARK, column, row),
    }];
  });
}

interface Appearance {
  value: Animated.Value;
  leaving: boolean;
}

/**
 * Keeps an animated 0..1 value per key, springing new keys in and timing
 * departed ones out before dropping them. Both the slabs and the blocks use it,
 * so a square's fog rolls in and burns off instead of blinking.
 */
function useAppearance(keys: string[]): Map<string, Appearance> {
  const entries = useRef(new Map<string, Appearance>()).current;
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const signature = keys.join("|");

  useEffect(() => {
    const wanted = new Set(keys);
    let changed = false;

    for (const key of wanted) {
      const existing = entries.get(key);
      if (existing && !existing.leaving) continue;
      const entry = existing ?? { value: new Animated.Value(0), leaving: false };
      entry.leaving = false;
      entries.set(key, entry);
      changed = changed || !existing;
      Animated.spring(entry.value, {
        toValue: 1,
        damping: 14,
        stiffness: 150,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
    }

    for (const [key, entry] of entries) {
      if (wanted.has(key) || entry.leaving) continue;
      entry.leaving = true;
      changed = true;
      Animated.timing(entry.value, {
        toValue: 0,
        duration: 320,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || !entries.get(key)?.leaving) return;
        entries.delete(key);
        redraw();
      });
    }

    if (changed) redraw();
    // `signature` is the identity of the key set; the array itself is rebuilt
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return entries;
}

interface FogCloudsProps {
  /** Board squares in draw order, row by row from the viewer's top-left. */
  squares: string[];
  /** Squares the viewer cannot see. */
  fogged: Set<string>;
  cellSize: number;
  boardSize: number;
}

function FogClouds({ squares, fogged, cellSize, boardSize }: FogCloudsProps) {
  const pad = cellSize * 0.35;

  const { slabs, groups } = useMemo(() => {
    const isFogged = (column: number, row: number) =>
      column >= 0 && column < 8 && row >= 0 && row < 8 && fogged.has(squares[row * 8 + column]);
    const built = buildGroups(squares, fogged, isFogged);
    for (const group of built) group.bumps = buildBumps(group, cellSize, pad);
    return { slabs: buildSlabs(squares, fogged, isFogged, cellSize), groups: built };
  }, [cellSize, fogged, pad, squares]);

  const slabAppearance = useAppearance(slabs.map((slab) => slab.square));
  const groupAppearance = useAppearance(groups.map((group) => group.key));

  /*
   * A square that has just come into view is no longer in `slabs`, but its
   * cloud is still burning off, so the geometry it was last drawn with has to
   * outlive the fog itself. Same for a block the merge no longer produces.
   */
  const slabsByKey = useRef(new Map<string, Slab>()).current;
  const groupsByKey = useRef(new Map<string, Group>()).current;
  for (const slab of slabs) slabsByKey.set(slab.square, slab);
  for (const group of groups) groupsByKey.set(group.key, group);
  for (const key of [...slabsByKey.keys()]) if (!slabAppearance.has(key)) slabsByKey.delete(key);
  for (const key of [...groupsByKey.keys()]) if (!groupAppearance.has(key)) groupsByKey.delete(key);

  const drifts = useMemo(() => DRIFTS.map(() => new Animated.Value(0)), []);
  useEffect(() => {
    const loops = drifts.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: DRIFTS[index].duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: DRIFTS[index].duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [drifts]);

  // Back to front, so overlapping blocks stack the way the light implies.
  const orderedGroups = [...groupAppearance.keys()].sort((left, right) => {
    const place = (key: string) => {
      const group = groupsByKey.get(key);
      return group ? group.row * 8 + group.column : 0;
    };
    return place(left) - place(right);
  });

  const blockFrame = (group: Group) => ({
    position: "absolute" as const,
    left: group.column * cellSize - pad,
    top: group.row * cellSize - pad,
    width: group.width * cellSize + pad * 2,
    height: group.height * cellSize + pad * 2,
  });

  // The wall and the bumps are the same silhouette at two depths, so they have
  // to share one drift or the shadow would slide out from under the cloud.
  const driftFor = (key: string) => {
    const index = Math.floor(noise(key, 97) * DRIFTS.length) % DRIFTS.length;
    const motion = DRIFTS[index];
    const drift = drifts[index];
    return {
      transform: [
        { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [motion.x[0] * cellSize, motion.x[1] * cellSize] }) },
        { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [motion.y[0] * cellSize, motion.y[1] * cellSize] }) },
      ],
    };
  };

  if (slabAppearance.size === 0 && groupAppearance.size === 0) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.layer, { width: boardSize, height: boardSize }]}>
      {/*
        * The side wall: every bump again, offset down and right in shadow, laid
        * under the slabs so it is visible only where the bank ends. Following
        * the silhouette is what keeps the fog's edge lobed instead of squared
        * off, and it drifts with the bumps because it is the same geometry.
        */}
      {orderedGroups.map((key) => {
        const group = groupsByKey.get(key);
        const appearance = groupAppearance.get(key);
        if (!group || !appearance) return null;
        const motion = driftFor(key);
        return (
          <Animated.View
            key={`wall-${key}`}
            pointerEvents="none"
            style={[
              blockFrame(group),
              { opacity: appearance.value, transform: motion.transform },
            ]}
          >
            <Svg width={group.width * cellSize + pad * 2} height={group.height * cellSize + pad * 2}>
              {group.bumps.map((bump, bumpIndex) => (
                <Rect
                  key={bumpIndex}
                  x={bump.wallX}
                  y={bump.wallY}
                  width={bump.size}
                  height={bump.size}
                  rx={bump.radius}
                  fill={bump.wall}
                />
              ))}
            </Svg>
          </Animated.View>
        );
      })}

      {[...slabAppearance.entries()].map(([square, appearance]) => {
        // A departing slab keeps its last geometry so it can fade in place.
        const slab = slabsByKey.get(square);
        if (!slab) return null;
        return (
          // Overlays the whole board, so its children can be placed in board
          // coordinates rather than being laid out in flow.
          <Animated.View
            key={square}
            pointerEvents="none"
            style={[
              styles.piece,
              {
                left: slab.left,
                top: slab.top,
                width: slab.width,
                height: slab.height,
                backgroundColor: slab.color,
                opacity: appearance.value,
              },
            ]}
          />
        );
      })}

      {orderedGroups.map((key) => {
        const group = groupsByKey.get(key);
        const appearance = groupAppearance.get(key);
        if (!group || !appearance) return null;
        const width = group.width * cellSize + pad * 2;
        const height = group.height * cellSize + pad * 2;

        return (
          <Animated.View
            key={key}
            pointerEvents="none"
            style={[
              blockFrame(group),
              {
                opacity: appearance.value,
                transform: [
                  ...driftFor(key).transform,
                  {
                    scale: appearance.value.interpolate({
                      inputRange: [0, 1],
                      outputRange: appearance.leaving ? [1.2, 1] : [0.7, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Svg width={width} height={height}>
              <Defs>
                <RadialGradient id={`hollow-${key}`} cx="0.5" cy="0.5" r="0.5">
                  <Stop offset="0" stopColor="#66809A" stopOpacity="0.62" />
                  <Stop offset="0.6" stopColor="#7E96AD" stopOpacity="0.3" />
                  <Stop offset="1" stopColor="#93A9BE" stopOpacity="0" />
                </RadialGradient>
                {group.bumps.map((bump, bumpIndex) => (
                  <LinearGradient key={bumpIndex} id={`bump-${key}-${bumpIndex}`} x1="0.12" y1="0" x2="0.9" y2="1">
                    <Stop offset="0" stopColor={bump.lit} />
                    <Stop offset="1" stopColor={bump.shade} />
                  </LinearGradient>
                ))}
              </Defs>
              {/* Each bump lays a contact shadow on the surface behind it and
                  then covers it, which is what reads as relief. */}
              {group.bumps.flatMap((bump, bumpIndex) => [
                <Ellipse
                  key={`shade-${bumpIndex}`}
                  cx={bump.x + bump.size * 0.55}
                  cy={bump.y + bump.size * 0.58}
                  rx={bump.size * 0.42}
                  ry={bump.size * 0.38}
                  fill={`url(#hollow-${key})`}
                />,
                <Rect
                  key={`bump-${bumpIndex}`}
                  x={bump.x}
                  y={bump.y}
                  width={bump.size}
                  height={bump.size}
                  rx={bump.radius}
                  fill={`url(#bump-${key}-${bumpIndex})`}
                />,
              ])}
            </Svg>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 0, top: 0, zIndex: 8 },
  piece: { position: "absolute" },
});

// Dragging a piece re-renders the board constantly; the fog only changes when
// the fog changes.
export default memo(FogClouds, (previous, next) =>
  previous.cellSize === next.cellSize &&
  previous.boardSize === next.boardSize &&
  previous.squares.length === next.squares.length &&
  previous.squares.every((square, index) => square === next.squares[index]) &&
  previous.fogged.size === next.fogged.size &&
  [...previous.fogged].every((square) => next.fogged.has(square)));

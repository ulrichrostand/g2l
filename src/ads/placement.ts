import { Tile, type Cell, type Grid } from "../core/grid";
import type { SeededRandom } from "../core/rng";
import type { LevelLayout, Room } from "../level/generator";
import type { Sponsor } from "./sponsors";

/** Une affiche accrochée sur la face sud d'un mur de salle (celle que la caméra de jeu voit). */
export interface PosterSlot {
  /** Case de mur qui porte l'affiche. */
  wallCell: Cell;
  roomIndex: number;
}

export interface PlacedPoster extends PosterSlot {
  sponsor: Sponsor;
}

/** Une affiche par salle au plus, et un plafond par niveau : trop d'affiches rendraient le décor bruyant. */
export const MAX_POSTERS_PER_LEVEL = 4;
/** Marge aux angles : une affiche collée à un coin serait coupée par le mur voisin. */
const CORNER_MARGIN = 1;

/**
 * Emplacements possibles : cases du mur nord de chaque salle, hors coins, hors caméras de surveillance
 * et hors terminaux (qui s'adossent au mur) pour ne jamais superposer deux éléments.
 */
export function candidatePosterSlots(layout: LevelLayout): PosterSlot[] {
  const { grid, rooms } = layout;
  const blocked = new Set<string>([
    ...layout.cameras.map((camera) => key(camera.wallCell)),
    ...layout.terminals.map((slot) => key({ x: slot.cell.x, z: slot.cell.z - 1 })),
  ]);
  const slots: PosterSlot[] = [];
  rooms.forEach((room, roomIndex) => {
    for (const wallCell of northWallCells(grid, room)) {
      if (!blocked.has(key(wallCell))) slots.push({ wallCell, roomIndex });
    }
  });
  return slots;
}

function northWallCells(grid: Grid, room: Room): Cell[] {
  const wallZ = room.z - 1;
  const cells: Cell[] = [];
  for (let x = room.x + CORNER_MARGIN; x < room.x + room.width - CORNER_MARGIN; x++) {
    // Mur plein devant un sol praticable : pas de porte ni de couloir à cet endroit.
    if (grid.get(x, wallZ) === Tile.Wall && grid.isWalkable(x, room.z)) cells.push({ x, z: wallZ });
  }
  return cells;
}

/**
 * Choisit les affiches du niveau et leur attribue un annonceur à tour de rôle.
 * Déterministe pour une graine donnée. Sans annonceur, ne place rien.
 */
export function placePosters(layout: LevelLayout, sponsors: readonly Sponsor[], random: SeededRandom, maxPosters = MAX_POSTERS_PER_LEVEL): PlacedPoster[] {
  if (sponsors.length === 0 || maxPosters <= 0) return [];
  const byRoom = new Map<number, PosterSlot[]>();
  for (const slot of candidatePosterSlots(layout)) {
    const inRoom = byRoom.get(slot.roomIndex) ?? [];
    inRoom.push(slot);
    byRoom.set(slot.roomIndex, inRoom);
  }
  const chosenSlots = random
    .shuffle([...byRoom.keys()].sort((first, second) => first - second))
    .slice(0, maxPosters)
    .map((roomIndex) => {
      const options = byRoom.get(roomIndex) as PosterSlot[];
      return options[random.int(0, options.length - 1)] as PosterSlot;
    });
  // Départ aléatoire dans la liste : d'un niveau à l'autre, chaque annonceur passe en premier à son tour.
  const offset = random.int(0, sponsors.length - 1);
  return chosenSlots.map((slot, index) => ({ ...slot, sponsor: sponsors[(offset + index) % sponsors.length] as Sponsor }));
}

function key(cell: Cell): string {
  return `${cell.x},${cell.z}`;
}

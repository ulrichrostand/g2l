import { Tile, type Cell, type Grid } from "../core/grid";
import type { SeededRandom } from "../core/rng";
import type { LevelLayout, Room } from "../level/generator";
import type { Sponsor } from "./sponsors";

/** Emprise d'une affiche au sol, en cases : large pour rester lisible depuis la caméra de jeu (vue plongeante). */
export const POSTER_FOOTPRINT = { cellsX: 4, cellsZ: 3 } as const;

/** Une affiche peinte au sol : `cell` est le coin nord-ouest de son emprise. */
export interface PosterSlot {
  cell: Cell;
  roomIndex: number;
}

export interface PlacedPoster extends PosterSlot {
  sponsor: Sponsor;
}

/** Une affiche par salle au plus, et un plafond par niveau : trop d'affiches rendraient le décor bruyant. */
export const MAX_POSTERS_PER_LEVEL = 4;

/**
 * Emplacements possibles : rectangles de sol entièrement dans une salle, sans aucun élément de jeu dessus
 * (départ, sortie, terminaux et leur accès, dossiers, caméras, rondes de gardes), pour ne jamais en cacher un.
 */
export function candidatePosterSlots(layout: LevelLayout): PosterSlot[] {
  const blocked = occupiedCells(layout);
  const slots: PosterSlot[] = [];
  layout.rooms.forEach((room, roomIndex) => {
    for (let z = room.z; z + POSTER_FOOTPRINT.cellsZ <= room.z + room.height; z++) {
      for (let x = room.x; x + POSTER_FOOTPRINT.cellsX <= room.x + room.width; x++) {
        if (isFreeFloor(layout.grid, blocked, x, z)) slots.push({ cell: { x, z }, roomIndex });
      }
    }
  });
  return slots;
}

function isFreeFloor(grid: Grid, blocked: ReadonlySet<string>, originX: number, originZ: number): boolean {
  for (let z = originZ; z < originZ + POSTER_FOOTPRINT.cellsZ; z++) {
    for (let x = originX; x < originX + POSTER_FOOTPRINT.cellsX; x++) {
      if (grid.get(x, z) !== Tile.Floor || blocked.has(key({ x, z }))) return false;
    }
  }
  return true;
}

function occupiedCells(layout: LevelLayout): Set<string> {
  const cells: Cell[] = [
    layout.start,
    layout.exit,
    ...layout.intel,
    ...layout.terminals.flatMap((slot) => [slot.cell, slot.accessCell]),
    ...layout.cameras.map((camera) => camera.floorCell),
    ...layout.guards.flatMap((route) => route.waypoints),
  ];
  return new Set(cells.map(key));
}

/** Le mur sud, haut et vu de dessus par la caméra, cache le sol jusqu'à environ trois cases derrière lui. */
const SOUTH_WALL_SHADOW_CELLS = 3;

/**
 * Rangée préférée d'une salle : la plus au sud qui reste visible (hors de l'ombre du mur sud), ce qui place
 * l'affiche loin du néon, décalé vers le nord. Une salle trop basse retombe sur sa rangée la plus au nord.
 */
export function preferredRow(room: Room, options: readonly PosterSlot[]): number {
  const lastVisibleRow = room.z + room.height - POSTER_FOOTPRINT.cellsZ - SOUTH_WALL_SHADOW_CELLS;
  const visible = options.filter((slot) => slot.cell.z <= lastVisibleRow).map((slot) => slot.cell.z);
  return visible.length > 0 ? Math.max(...visible) : Math.min(...options.map((slot) => slot.cell.z));
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
      const rowChoices = options.filter((slot) => slot.cell.z === preferredRow(layout.rooms[roomIndex] as Room, options));
      return rowChoices[random.int(0, rowChoices.length - 1)] as PosterSlot;
    });
  // Départ aléatoire dans la liste : d'un niveau à l'autre, chaque annonceur passe en premier à son tour.
  const offset = random.int(0, sponsors.length - 1);
  return chosenSlots.map((slot, index) => ({ ...slot, sponsor: sponsors[(offset + index) % sponsors.length] as Sponsor }));
}

function key(cell: Cell): string {
  return `${cell.x},${cell.z}`;
}

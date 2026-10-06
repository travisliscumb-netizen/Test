import type { Ctx } from "../../paint";

/** How a shell-type critter looks: walking, tucked in (still or sliding), or tucked in and about to wake. */
export type ShellState = "walk" | "shell" | "peek";

/** A ground-walker: walks, turns at walls, walks off ledges, flattened by a stomp. */
export interface WalkerSkin {
  readonly name: string;
  draw(ctx: Ctx, step: number, squashed: boolean): void;
}

/** A shell-type critter: a stomp tucks it into something kickable that slides and spins. */
export interface ShellSkin {
  readonly name: string;
  draw(ctx: Ctx, state: ShellState, step: number, spin: number): void;
}

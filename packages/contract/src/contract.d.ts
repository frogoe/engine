/** Authoring-side types for the browser contract (contract.js). */
export declare function defineGame(
  game: (options: {
    finish: (score: number) => void;
    input: {
      on: (
        event: "down" | "drag" | "up",
        handler: (p: { dx: number; dy: number; x: number; y: number }) => void,
      ) => void;
      pointer: { down: boolean; dx: number; dy: number; x: number; y: number };
    };
    loop: {
      update?: (dt: number) => void;
      render?: (ctx: CanvasRenderingContext2D) => void;
    };
    stage: {
      ctx: CanvasRenderingContext2D;
      height: number;
      play: { center: number; left: number; right: number; width: number };
      refresh: () => void;
      safe: { bottom: number; left: number; right: number; top: number };
      width: number;
    };
  }) => void,
): void;

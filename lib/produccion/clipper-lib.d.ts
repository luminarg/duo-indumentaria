// Tipos mínimos para clipper-lib (port JS de Clipper 6, sin tipos propios).
// Solo lo que usa lib/produccion/geometry.ts.
declare module "clipper-lib" {
  type IntPoint = { X: number; Y: number };
  type Path = IntPoint[];
  type Paths = Path[];

  const ClipperLib: {
    Clipper: {
      new (): {
        AddPaths(paths: Paths, polyType: number, closed: boolean): boolean;
        Execute(clipType: number, solution: Paths, subjFill: number, clipFill: number): boolean;
      };
      Area(path: Path): number;
      CleanPolygons(paths: Paths, distance: number): void;
      SimplifyPolygons(paths: Paths, fillType: number): Paths;
    };
    ClipperOffset: {
      new (miterLimit?: number, arcTolerance?: number): {
        AddPaths(paths: Paths, joinType: number, endType: number): void;
        Execute(solution: Paths, delta: number): void;
      };
    };
    ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number };
    PolyType: { ptSubject: number; ptClip: number };
    PolyFillType: { pftEvenOdd: number; pftNonZero: number; pftPositive: number; pftNegative: number };
    JoinType: { jtSquare: number; jtRound: number; jtMiter: number };
    EndType: { etClosedPolygon: number; etClosedLine: number; etOpenButt: number; etOpenSquare: number; etOpenRound: number };
  };
  export default ClipperLib;
}

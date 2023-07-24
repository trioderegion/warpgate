import { Propagator } from "./propagator.js";

/**
 * Generator function for exploring vertex-connected grid locations in an
 * outward "ring" pattern.
 *
 * @export
 * @generator
 * @name warpgate.util.RingGenerator
 * @param {{x:Number, y:Number}} origin Staring location (pixels) for search
 * @param {Number} numRings
 * @yields {{x: Number, y: Number}} pixel location of next grid-ring-connected origin
 */
export function* RingGenerator(origin, numRings) {
  const gridLoc = canvas.grid.grid.getGridPositionFromPixels(
    origin.x,
    origin.y
  );

  const positions = new Set();

  const seen = (position) => {
    const key = position.join(".");
    if (positions.has(key)) return true;

    positions.add(key);
    return false;
  };

  seen(gridLoc);
  let queue = [gridLoc];
  let ring = 0;

  /* include seed point in iterator */
  yield { x: origin.x, y: origin.y };

  /* if this is off-grid, also check the snap location */
  const snapped = canvas.grid.getSnappedPosition(origin.x, origin.y);
  const snappedIndex = canvas.grid.grid.getGridPositionFromPixels(
    snapped.x,
    snapped.y
  );
  if (!seen(snappedIndex)) {
    queue = [snappedIndex];
    yield snapped;
  }

  while (queue.length > 0 && ring < numRings) {
    const next = queue.flatMap((loc) => canvas.grid.grid.getNeighbors(...loc));
    queue = next.filter((loc) => !seen(loc));

    for (const loc of queue) {
      const [x, y] = canvas.grid.grid.getPixelsFromGridPosition(...loc);
      yield { x, y };
    }

    ring += 1;
  }

  return { x: null, y: null };
}

/**
 * Utility class for locating a free area on the grid from
 * a given initial 'requested' position. Effectively slides
 * the requested position to a nearby position free of other
 * tokens (by default, but accepts arbitrary canvas layers with quad trees)
 *
 * @class PlaceableFit
 */
export class PlaceableFit {
  /**
   * Initialize new "fit" search from the provided
   * bounds.
   *
   * @param {{x:Number, y:Number, width:Number, height:Number}} bounds
   * @param {Object} [options]
   * @constructor
   */
  constructor(bounds, options = {}) {
    this.options = {
      avoidWalls: true,
      searchRange: 6,
      visualize: false,
      collisionLayers: [canvas.tokens],
    };

    foundry.utils.mergeObject(this.options, options);

    this.bounds = new PIXI.Rectangle(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height
    );

    if (this.options.visualize) canvas.controls?.debug?.clear?.();
  }

  /**
   *
   *
   * @param {{x:Number, y:Number}} newOrigin
   * @returns PIXI.Rectangle bounds for overlap testing (slightly smaller)
   * @memberof PlaceableFit
   */
  _collisionBounds(newOrigin) {
    const newBounds = new PIXI.Rectangle(
      newOrigin.x,
      newOrigin.y,
      this.bounds.width,
      this.bounds.height
    );
    newBounds.pad(-10);
    return newBounds.normalize();
  }

  /**
   * With the provided origin (top left), can this
   * placeable fit without overlapping other placeables?
   *
   * @param {{x: Number, y: Number}} loc Origin of bounds
   * @returns boolean Placeable bounds fit without overlap
   * @memberof PlaceableFit
   */
  spaceClear(loc) {
    const candidateBounds = this._collisionBounds(loc);

    if (this.options.visualize) {
      canvas.controls.debug
        .lineStyle(2, 0xff0000, 0.5)
        .drawShape(candidateBounds);
    }

    for (const layer of this.options.collisionLayers) {
      const hits = layer.quadtree.getObjects(candidateBounds);
      if (hits.size == 0) return true;
    }

    return false;
  }

  /**
   *
   *
   * @param {{x:Number, y:Number}} originalCenter
   * @param {{x:Number, y:Number}} shiftedCenter
   * @returns Boolean resulting shifted position would collide with a move blocking wall
   * @memberof PlaceableFit
   */
  _offsetCollidesWall(originalCenter, shiftedCenter) {
    const collision = CONFIG.Canvas.polygonBackends.move.testCollision(
      originalCenter,
      shiftedCenter,
      { mode: "any", type: "move" }
    );

    return collision;
  }

  /**
   * Searches for and returns the bounds origin point at which it does
   * not overlap other placeables.
   *
   * @returns {{x: Number, y: Number}|undefined} Identified bounds origin free of overlap
   * @memberof PlaceableFit
   */
  find() {
    if (game.release?.generation < 11) {
      return Propagator.getFreePosition(this.bounds, this.bounds);
    }

    const locIter = RingGenerator(this.bounds, this.options.searchRange);

    let testLoc = null;

    const newCenter = (x, y) => ({
      x: x + this.bounds.width / 2,
      y: y + this.bounds.height / 2,
    });

    while (!(testLoc = locIter.next()).done) {
      const { x, y } = testLoc.value;

      let clear = this.spaceClear({ x, y });
      if (clear && this.options.avoidWalls) {
        clear = !this._offsetCollidesWall(this.bounds.center, newCenter(x, y));
      }

      if (clear) return { x, y };
    }

    return;
  }
}

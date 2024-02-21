/**
 * Generator function for exploring vertex-connected grid locations in an
 * outward "ring" pattern.
 *
 * @export
 * @generator
 * @name warpgate.plugin.RingGenerator
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
  yield { x: origin.x, y: origin.y, ring: -1 };

  /* if this is off-grid, also check the snap location */
  const snapped = canvas.grid.getSnappedPosition(origin.x, origin.y);
  const snappedIndex = canvas.grid.grid.getGridPositionFromPixels(
    snapped.x,
    snapped.y
  );
  if (!seen(snappedIndex)) {
    queue = [snappedIndex];
    yield {...snapped, ring: -1};
  }

  while (queue.length > 0 && ring < numRings) {
    const next = queue.flatMap((loc) => canvas.grid.grid.getNeighbors(...loc));
    queue = next.filter((loc) => !seen(loc));

    for (const loc of queue) {
      const [x, y] = canvas.grid.grid.getPixelsFromGridPosition(...loc);
      yield { x, y, ring };
    }

    ring += 1;
  }

  return { x: null, y: null, ring: null };
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
    this.tree = new Quadtree(canvas.scene.dimensions.sceneRect);
    this.bounds = new PIXI.Rectangle(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height
    );

    if (this.options.visualize) canvas.controls?.debug?.clear?.();
  }

  /**
   * Generates a new rectangle based on the
   * provided, shifted, origin/center.
   *
   * @param {{x:Number, y:Number}} loc `{x,y}` location value (in pixels) defining the testing bound's origin (top left)
   * @param {Boolean} isCenter provided location defines the bounds new center, rather than origin
   * @returns PIXI.Rectangle bounds for overlap testing (slightly smaller)
   * @memberof PlaceableFit
   */
  _collisionBounds(loc, isCenter = false) {

    const origin = isCenter ? {
      x: loc.x - this.bounds.width / 2,
      y: loc.y - this.bounds.height / 2,
    } : loc;

    const newBounds = new PIXI.Rectangle(
      origin.x,
      origin.y,
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
   * @param {Boolean} isCenter Provided origin instead defines the bounds' centerpoint
   * @returns boolean Placeable bounds fit without overlap
   * @memberof PlaceableFit
   */
  spaceClear(loc, isCenter = false) {
    const candidateBounds = this._collisionBounds(loc, isCenter);

    if (this.options.visualize) {
      canvas.controls.debug
        .lineStyle(2, 0xff0000, 0.5)
        .drawShape(candidateBounds);
    }

    /* Check if the putative offset (may be 0 length)
     * hits a wall and consider as an invalid location
     */
    if (this.options.avoidWalls && this._offsetCollidesWall(this.bounds.center, candidateBounds.center)) {
      return false;
    }

    /* Check rectangular overlap with configured placeable layers */
    for (const layer of this.options.collisionLayers) {
      const hits = layer.quadtree.getObjects(candidateBounds);
      if (hits.size > 0) return false;
    }

    /* Check for rectangular overlap with previous placements
     * of this instance */
    const localHits = this.tree.getObjects(candidateBounds);
    if (localHits.size > 0) return false;

    return true;
  }

  /**
   * Tests if segment defined by two points hits a move blocking
   * wall.
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
   * @param {Object<string, *>} [options]
   * @param {Boolean} [options.center=false] Return the _center-point_ of the valid freespace bounds, rather than its origin (top-left)
   *
   * @returns {{x: Number, y: Number}|undefined} Identified bounds origin free of overlap
   * @memberof PlaceableFit
   */
  find({center = false} = {}) {

    const locIter = RingGenerator(this.bounds, this.options.searchRange);

    let testLoc = null;

    while (!(testLoc = locIter.next()).done) {

      const newCenter = {
        x: testLoc.value.x + this.bounds.width / 2,
        y: testLoc.value.y + this.bounds.height / 2,
      };

      if (this.spaceClear(newCenter, true)) {
        this.bounds.x = testLoc.value.x;
        this.bounds.y = testLoc.value.y;
        this.tree.insert({r: this.bounds.clone(), t: {x: this.bounds.x, y: this.bounds.y}});
        return center ? newCenter : testLoc.value;
      }
    }
  }
}

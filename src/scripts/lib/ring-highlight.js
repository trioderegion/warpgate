/*
 * This file is part of the warpgate module (https://github.com/trioderegion/warpgate)
 * Copyright (c) 2023 Matthew Haentschke.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * For gridded scenes, will highlight a corresponding number of concentric rings spreading outward from the provided starting point (which is given a negative ring index).
 *
 * By default, the number of rings to highlight is zero and the layer is cleared before drawing, which results in erasing any highlighted rings on the canvas.
 *
 * @param {object} config
 * @param {Number} config.x
 * @param {Number} config.y
 * @param {Number} [config.rings = 0] Number of concentric rings to highlight.
 * @param {String} [config.name = 'warpgate-ring'] Highlight layer name to be used for drawing/clearing
 *
 * @param {object} [options]
 * @param {Number} [options.size = 1] Width of each ring, in grid spaces
 * @param {Array<string|number|Color>} [options.colors = [game.user.color]] Circular list of colors for each ring. Will repeat if number of rings is larger than the number of provided colors. Provided value is passed through `Color.from` and converted to its integer representation.
 * @param {boolean} [options.clear = true] Clear any current highlights on named layer before drawing more.
 * @param {Number} [options.lifetime = 0] Time (in milliseconds) before the highlighted ring is automatically
 *   cleared. A negative value or zero indicates "indefinitely". Ignored if `config.rings` is less than 1.
 *
 * @returns {Array<{x: Number, y: Number, ring: Number}>} Highlighted grid locations (in pixels) and their corresponding ring index
 *
 * @example
 * const name = 'rangefinder';
 * const size = 2;
 * const rings = 3;
 * const colors = [0xFF0000, 0x00FF00, 0x0000FF];
 * 
 * // Draw a simple ring on the default layer
 * warpgate.grid.highlightRing({x: token.x, y:token.y, rings:1});
 * 
 * // Draw a larger temporary ring on the rangerfinder layer
 * const highlights = warpgate.grid.highlightRing(
 *     {x: token.x, y:token.y, rings, name}, 
 *     {size, colors, clear: true, lifetime:2000});
 *     
 * ui.notifications.info(`Highlighted ${highlights.length} grid positions.`);
 */
export function highlightRing(
  config = { x: 0, y: 0, rings: 0, name: 'warpgate-ring' },
  options = { size: 1, colors: [], clear: true, lifetime: 0}
) {

  /* establish defaults */
  config = foundry.utils.mergeObject({rings: 0, name: 'warpgate-ring'}, config);
  options = foundry.utils.mergeObject({ size: 1, colors: [], clear: true, lifetime: 0}, options);

  /* ensure we have a layer on which to draw */
  canvas.grid.addHighlightLayer(config.name);

  if (options.clear) canvas.grid.clearHighlightLayer(config.name);

  if(config.rings < 1) {
    return [];
  }

  /* prep color array/string */
  options.colors =
    options.colors instanceof Array ? options.colors : [options.colors];

  if (options.colors.length == 0) {
    options.colors = [game.user.color];
  }

  /* Convert to a Number form */
  options.colors = options.colors.map((val) => Color.from(val).valueOf());
  
  
  /* snap position to nearest grid square origin */
  const snapped = canvas.grid.getSnappedPosition(config.x, config.y);

  const locs = [...warpgate.plugin.RingGenerator(snapped, config.rings * options.size)];
  locs.forEach((loc) => {
    if (loc.ring < 0) return;

    canvas.grid.highlightPosition(config.name, {
      x: loc.x,
      y: loc.y,
      color:
        options.colors[
          Math.floor(loc.ring / options.size) % options.colors.length
        ],
    });
  });
  if (options.lifetime > 0) warpgate.wait(options.lifetime).then( () => highlightRing({name: config.name}) );
  return locs;
}


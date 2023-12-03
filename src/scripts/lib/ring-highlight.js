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
 * @typedef {function(object, object):Color} ColorFn
 * @param {object} ringData Contains information about the current grid square/hex being highlighted.`x, y, ring` as <x,y> position and ring index (first is ring 0)
 * @param {object} options Highlight options passed to the initial call.
 *
 * @returns Color Any object/primitive compatible with the `Color` constructor.
 */

/** @ignore */
function BandedColorFn(rings, size, colorList) {
  
  const unitRings = rings instanceof Array ? rings.map( ring => ring * size ) : Array.from({length: rings}, () => 1 * size);
  const unitColors = [];
  unitRings.forEach( (size, band) => unitColors.push( ...Array.from({length: size}, (index) => colorList.at(band % colorList.length)) ))
  
  return ({ring}) => unitColors.at(ring);

}

/**
 * For gridded scenes, will highlight a corresponding number of concentric rings spreading outward from the provided starting point (which is given a negative ring index).
 *
 * By default, the number of rings to highlight is zero and the layer is cleared before drawing, which results in erasing any highlighted rings on the canvas.
 *
 * @param {object} config
 * @param {Number} config.x
 * @param {Number} config.y
 * @param {Number|Array<Number>} [config.rings = 0] Number of concentric rings to highlight. If an array is provided, it is treated as a "schedule" where each entry represents `value` number of `size`-width rings.
 * @param {String} [config.name = 'warpgate-ring'] Highlight layer name to be used for drawing/clearing
 *
 * @param {object} [options]
 * @param {Number} [options.size = 1] Width of each ring, in grid spaces
 * @param {Color|Array<Color>|ColorFn} [options.colors = game.user.color] Colors for each ring 'band' (based on `size` option). If a `Color` is passed, all highlights will use that color. If an `Array<Color>` is passed each `size`-width ring will be colored according to the provided list, which is iterated _circularly_ (i.e. repeats if short). If a `ColorFn` is passed, it will be used to generate the color on a per-square/hex basis (see {@link ColorFn} for more details). Any falsey value provided (either in list or as ColorFn return) will _not_ highlight the given location (e.g. "transparent highlight").
 * @param {boolean} [options.clear = true] Clear any current highlights on named layer before drawing more.
 * @param {Number} [options.lifetime = 0] Time (in milliseconds) before the highlighted ring is automatically
 *   cleared. A negative value or zero indicates "indefinitely". Ignored if `config.rings` is less than 1.
 *
 * @returns {Array<{x: Number, y: Number, ring: Number}>} Highlighted grid locations (in pixels) and their corresponding ring index
 *
 * @example
 * const name = 'rangefinder';
 * const size = 2;
 * const rings = 5;
 * const colors = ['red', '#00FF00', 0x0000FF, false];
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
  options = {}
) {

  /* establish defaults */
  config = foundry.utils.mergeObject({rings: 0, name: 'warpgate-ring'}, config);
  options = foundry.utils.mergeObject({ size: 1, colors: game.user.color, clear: true, lifetime: 0}, options);

  /* ensure we have a layer on which to draw */
  canvas.grid.addHighlightLayer(config.name);

  if (options.clear) canvas.grid.clearHighlightLayer(config.name);

  const singleRings = config.rings instanceof Array ? config.rings.reduce( (acc, curr) => acc + curr * options.size, 0) : config.rings * options.size;

  if(singleRings < 1) {
    return [];
  }

  /* prep color array/string */
  const colorFn = typeof options.colors == 'string' ? () => options.colors 
    : options.colors instanceof Array ? BandedColorFn(config.rings, options.size, options.colors) :
    options.colors;
  
  /* snap position to nearest grid square origin */
  const snapped = canvas.grid.getSnappedPosition(config.x, config.y);

  const locs = [...warpgate.plugin.RingGenerator(snapped, singleRings)];
  locs.forEach((loc) => {
    if (loc.ring < 0) return;

    const color = colorFn(loc, options);
    loc.color = color;
    if (!!color) {
      canvas.grid.highlightPosition(config.name, {
        x: loc.x,
        y: loc.y,
        color: colorFn(loc, options),
      });
    }
  });
  if (options.lifetime > 0) warpgate.wait(options.lifetime).then( () => highlightRing({name: config.name}) );
  return locs;
}


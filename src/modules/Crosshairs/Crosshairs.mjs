import models from '../../models';
import CrosshairsPlaceable from './CrosshairsPlaceable.mjs';
const {fields} = foundry.data;
/**
 *
 *
 * @class CrosshairsDocument
 * @mixes ClientDocumentMixin
 *
 */
export default class Crosshairs extends models.BaseCrosshairs {

  static defineSchema() {
    return foundry.utils.mergeObject(super.defineSchema(), {
      borderDisplay: new fields.BooleanField(),
      icon: new fields.SchemaField({
        display: new fields.BooleanField(),
        texture: new fields.FilePathField({categories: ["IMAGE", "VIDEO"]}),
      }),
      snap: new fields.SchemaField({
        position: new fields.NumberField({initial: CONST.GRID_SNAPPING_MODES.VERTEX}),
        size: new fields.NumberField({initial: CONST.GRID_SNAPPING_MODES.VERTEX | CONST.GRID_SNAPPING_MODES.CENTER | CONST.GRID_SNAPPING_MODES.EDGE_MIDPOINT}),
      }),
      fillAlpha: new fields.AlphaField(),
      label: new fields.SchemaField({
        display: new fields.BooleanField(),
        text: new fields.StringField(),
        dx: new fields.NumberField(),
        dy: new fields.NumberField(),
      }),
      textureTile: new fields.NumberField(),
    })
  }

  static get placeableClass() {
    return CrosshairsPlaceable;
  }

  #layer = null;

  get documentName() {
    return 'Crosshairs';
  }

  get layer() {
    if (this.#layer) return this.#layer;
    const create = (doc) => new this.constructor.placeableClass(doc);
    const sink = {
      get(target, prop) {
        switch (prop) {
          case 'createObject':
            return create;
          default:
            return target[prop];
        }
      }
    }

    this.#layer = new Proxy(canvas.activeLayer, sink);
    return this.#layer;
  }



  token = {};

  prepareDerivedData() {
    super.prepareDerivedData();
    const gridUnits = this.distance / this.parent.grid.distance;
    this.radius = gridUnits * this.parent.grid.size;
    this.token = {}
    switch (this.t) {
      default:
        this.token.x = this.x - this.radius;
        this.token.y = this.y - this.radius;
        this.token.width = gridUnits * 2;
        this.token.height = gridUnits * 2;

    }

  }

  show() {
    this._destroyed = false;
    this.#layer = null;
    return this.object.show();
  }

}

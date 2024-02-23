import BaseCrosshairs from './BaseCrosshairs.mjs';
/**
 *
 *
 * @class CrosshairsDocument
 * @mixes ClientDocumentMixin
 *
 */
export default class Crosshairs extends BaseCrosshairs {

  #layer = null;

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
    };

    this.#layer = new Proxy(canvas.activeLayer, sink);
    return this.#layer;
  }

  get isEmbedded() {
    return !!this.parent;
  }

  token = {};

  prepareDerivedData() {
    super.prepareDerivedData();
    const gridUnits = this.distance / this.parent.grid.distance;
    this.radius = gridUnits * this.parent.grid.size;
    this.token = {};
    this.token.width = gridUnits * 2;
    this.token.height = gridUnits * 2;
    switch (this.t) {
      case 'rect':
        this.token.x = this.x;
        this.token.y = this.y;
        break;
      case 'circle':
      default:
        this.token.x = this.x - this.radius;
        this.token.y = this.y - this.radius;
    }
  }

  show() {
    this._destroyed = false;
    this.#layer = null;
    return this.object.show();
  }

}

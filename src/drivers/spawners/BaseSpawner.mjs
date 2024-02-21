import warpdata from '../../models';
import { PlaceableFit } from '../../scripts/lib/PlaceableFit.mjs';

/**
 *
 *
 * @export
 * @class BaseSpawner
 */
export default class BaseSpawner {
  static get DEFAULT_MODELS() {
    return {
      warp: warpdata.WarpIn,
      crosshairs: warpdata.BaseCrosshairs,
    };
  }

  models;

  warpin;

  toSpawn;

  constructor(warpin, models = {}) {
    this.models = foundry.utils.mergeObject(this.constructor.DEFAULT_MODELS, models);
    this.warpin = warpin;
    this.toSpawn = [];
  }

  async spawn(options = {}) {
    if (await this._setup(options) === false) return false;
    this.toSpawn = await this._prepareTokens(options);
    options.callbacks?.prepare(this.toSpawn);
    await this._placeTokens(options);
    this.results = await this._spawn(options);
    await this._cleanup(options);
    return this.results;
  }

  async _setup(options) {
    // TODO add our flags and ownership
    return true;
  }

  async _prepareTokens(options) {
    const actor = this.warpin.warpActor();
    // TODO where to get initial position?
    const tokens = Array.from({ length: this.warpin.config.duplicates }, () => {
      if (!actor.prototypeToken.actorLink) return actor.getTokenDocument({delta: this.warpin.getDiff('actor')});
      return actor.getTokenDocument();
    });
    this.toSpawn.push(...await Promise.all(tokens));

    return await Promise.all(tokens);
  }

  async _placeTokens(options) {
    const grid = canvas.scene.grid.size;
    const fitter = new PlaceableFit(new PIXI.Rectangle());

    this.toSpawn.forEach( t => {
      fitter.bounds.x = t.x;
      fitter.bounds.y = t.y;
      fitter.bounds.width = t.width * grid;
      fitter.bounds.height = t.height * grid;

      const loc = fitter.find();
      if (loc) {
        t.updateSource({x: loc.x, y: loc.y});
      }
    });
  }

  async _spawn(options) {
    const spawned = await this.#embed(options);
    await this.#update(spawned, options);
  }

  #embed(options) {
    return canvas.scene.createEmbeddedDocuments('Token', this.toSpawn);
  }

  #update(spawned, options) {

  }

  async _cleanup(options) {}

}

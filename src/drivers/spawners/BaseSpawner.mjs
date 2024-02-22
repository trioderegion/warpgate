import warpdata from '../../models';
import crosshairs from '../../modules/Crosshairs';
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
      warpin: warpdata.WarpIn,
      crosshairs: crosshairs.Crosshairs
    };
  }

  /** @type {typeof BaseSpawner.DEFAULT_MODELS} */
  models;

  /** @type {import('../../models/WarpIn.mjs').default} */
  warpin;

  /** @type Array<foundry.documents.BaseToken> */
  toSpawn;

  constructor(warpin, models = {}) {
    this.models = foundry.utils.mergeObject(this.constructor.DEFAULT_MODELS, models);
    this.warpin = warpin;
    this.toSpawn = [];
  }

  async spawn(options = {}) {
    if (await this._setup(options) === false) return false;
    this.toSpawn = await this._prepareTokens(options);

    if (await options.callbacks?.prepare(this.toSpawn) === false) return false;

    await this._placeTokens(options);
    this.results = await this._spawn(options);
    await this._cleanup(options);
    return this.results;
  }

  async _setup(options) {
    /* Flag this user as the tokens's creator,
     * and add ownership entry */
    this.warpin.updateSource({
      'actor.flags.%config.id%.control': {
        user: this.warpin.config.user,
        actor: options.controllingActor?.uuid,
      },
      [`actor.ownership.${this.warpin.config.user}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
    });

    return true;
  }

  async _prepareTokens(options) {
    /* Generate temporary proxy actor and token instance data */
    const actor = this.warpin.warpActor();

    const linked = this.warpin.position.toObject();
    const unlinked = {
      ...linked,
      delta: this.warpin.getDiff('actor'),
    };

    /* Create N token instances (with position data) from warp actor */
    const tokens = Array.from({ length: this.warpin.config.duplicates }, () => {
      const instance = actor.prototypeToken.actorLink ? linked : unlinked;
      return actor.getTokenDocument(instance);
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

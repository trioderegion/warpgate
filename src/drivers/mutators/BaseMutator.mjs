import warpdata from '../../models';

/**
 *
 *
 * @export
 * @class BaseMutator
 */
export default class BaseMutator {

  static get DEFAULT_MODELS() {
    return {
      mutation: warpdata.Mutation,
      delta: warpdata.RollbackDelta,
      stack: warpdata.RollbackStack,
    };
  }

  /** @type {typeof BaseMutator.DEFAULT_MODELS} */
  models;

  /** @type {typeof BaseMutator.DEFAULT_MODELS.mutation} */
  mutation;

  results;

  constructor(mutation, models = {}) {
    this.mutation = mutation;
    this.models = foundry.utils.mergeObject(this.constructor.DEFAULT_MODELS, models);
  }

  async mutate(options = {}) {
    if (!await this._setup(options)) return false;
    if (!await this._updateStack(options)) return false;

    try {
      this.results = await this._mutate(options);
    } catch(e) {
      this.results = [];
      options.error = e;
    }

    await this._cleanup(options);
    return this.results;
  }

  async _setup(options) {
    return true;
  }

  async _updateStack(options) {
    return true;
  }

  /**
   * @return {Promise<*>} results
   */
  async _mutate(options) {
    return await this.#apply(options);
  }

  async _cleanup(options) {}


  #apply(options) {

    const promises = [];

    /* Update the token, actor, and actor-embeds */
    promises.push(this.mutation.applyToken());
    promises.push(this.mutation.applyActor());
    promises.push(...this.mutation.applyEmbedded());

    return Promise.all(promises);
  }

}

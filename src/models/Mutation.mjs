import warpfields from './schema';
import EmbeddedShorthandField from './schema/EmbeddedShorthandField.mjs';

const {fields} = foundry.data;
const {DataModel} = foundry.abstract;

export default class Mutation extends DataModel {
  constructor(token, options = {}) {
    const initial = {
      actor: token.actor.toObject(),
      token: token.toObject(),
    };
    super(initial, {...options, parent: token});
  }

  #changes = {}

  static defineSchema() {
    return {
      actor: new warpfields.DocSchemaField(Actor.implementation, {required: false, nullable: true}),
      token: new warpfields.DocSchemaField(TokenDocument.implementation, {required: false, nullable: true}),
      embedded: new warpfields.EmbeddedShorthandField(Actor.implementation, fields.ObjectField),
      config: new warpfields.MutationConfigField(),
    }
  }

  updateSource(changes, options) {
    const delta = super.updateSource(changes, options);
    foundry.utils.mergeObject(this.#changes, delta);
    return delta;
  }


  /* Mutation Fields */
  getToken() {
    return this.parent;
  }

  static async _apply(doc, changes, options) {
    if (doc.id) {
      return doc.update(changes, options);
    } else {
      return doc.updateSource(changes, options);
    }
  }

  async applyToken() {
    const diff = this.getDiff('token');
    return this.constructor._apply(
      this.getToken(),
      diff,
      this.config.updateOpts.token
    )
  }

  getActor() {
    return this.parent.actor;
  }

  async applyActor() {
    const diff = this.getDiff('actor');
    return this.constructor._apply(
      this.getActor(),
      diff,
      this.config.updateOpts.actor
    )
  }

  applyEmbedded() {
    const shorthand = this.getDiff('embedded');
    return EmbeddedShorthandField.submit(this.getActor(), shorthand, this.config.comparisonKeys, this.config.updateOpts);
  }

  getScene() {
    this.getToken().parent;
  }

  getDiff(field) {
    return foundry.utils.deepClone(this.#changes[field]);
  }

  // @TODO temp wrapper
  apply(driver = globalThis.Mutator) {
    return driver.mutate(this);
  }

}

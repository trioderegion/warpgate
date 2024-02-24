import warpfields from './schema';

const {fields} = foundry.data;
const {DataModel} = foundry.abstract;

export default class BaseShorthand extends DataModel {
  static defineSchema() {
    return {
      actor: new warpfields.DocSchemaField(Actor.implementation, {required: false, nullable: true}),
      token: new warpfields.DocSchemaField(TokenDocument.implementation, {required: false, nullable: true}),
      embedded: new warpfields.EmbeddedShorthandField(Actor.implementation, fields.ObjectField),
    };
  }

  /**
   * Merge two schema definitions together as well as possible.
   * @param {DataSchema} a  First schema that forms the basis for the merge. *Will be mutated.*
   * @param {DataSchema} b  Second schema that will be merged in, overwriting any non-mergeable properties.
   * @returns {DataSchema}  Fully merged schema.
   */
  static mergeSchema(a, b) {
    Object.assign(a, b);
    return a;
  }

  #changes = {};

  updateSource(changes, options = {}) {
    const delta = super.updateSource(changes, options);
    foundry.utils.mergeObject(this.#changes, options.diff ? delta : changes);
    return options.diff ? delta : changes;
  }

  getDiff(field) {
    if (!field) return foundry.utils.deepClone(this.#changes);
    return foundry.utils.deepClone(this.#changes[field]);
  }
}

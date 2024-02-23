import warpfields from './schema';
import BaseShorthand from './BaseShorthand.mjs';
const {fields} = foundry.data;

export default class Mutation extends BaseShorthand {
  constructor(data = {}, options = {}) {

    const templateToken = options.parent instanceof TokenDocument
      ? options.parent
      : options.parent.token ?? options.parent.prototypeToken;

    options.parent = options.parent instanceof TokenDocument
      ? options.parent.actor
      : options.parent;


    const initial = {
      actor: foundry.utils.mergeObject(options.parent.toObject(), data?.actor?.toObject?.() ?? data?.actor ?? {}),
      token: foundry.utils.mergeObject(templateToken.toObject(), data?.token?.toObject?.() ?? data?.token ?? {}),
    };

    super(initial, options);
  }

  static defineSchema() {
    return this.mergeSchema(super.defineSchema(), {
      config: new warpfields.ShorthandConfigField({
        permanent: new fields.BooleanField({initial: false, nullable: false}),
      }),
    });
  }

  /* Mutation Fields */

  /**
   * Retrieve active tokens on current scene
   */
  getTokens() {
    return this.parent.getActiveTokens();
  }

  static async _apply(doc, changes, options) {
    if (doc.id) {
      return doc.update(changes, options);
    } else {
      return doc.updateSource(changes, options);
    }
  }

  static async _applyBatch(owner, embeddedName, data, targetIds, options = {}) {
    const updates = targetIds.map( id => ({_id: id, ...data}) );
    return owner.updateEmbeddedDocuments(embeddedName, updates, options);
  }

  async applyToken() {
    const diff = this.getDiff('token');
    const ids = this.getTokens().map( t => t.id );
    return this.constructor._applyBatch(
      this.getScene(),
      'Token',
      diff,
      ids,
      this.config.updateOpts.token
    );
  }

  getActor() {
    return this.parent;
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
    return warpfields.EmbeddedShorthandField.submit(
      this.getActor(),
      shorthand,
      this.config.comparisonKeys,
      this.config.updateOpts
    );
  }

  // TODO will likely need to collect a list of scenes
  getScene() {
    return this.getTokens().find( t => !!t.document.parent )?.document.parent;
  }
}

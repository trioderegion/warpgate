import warpfields from './schema';
import BaseShorthand from './BaseShorthand.mjs';
const {fields} = foundry.data;

export default class Mutation extends BaseShorthand {
  constructor(token, options = {}) {
    if (typeof token === 'string') token = fromUuidSync(token, {strict: true});
    const initial = {
      actor: token.actor.toObject(),
      token: token.toObject(),
    };
    super(initial, {...options, parent: token});
  }

  static defineSchema() {
    return this.mergeSchema(super.defineSchema(), {
      config: new warpfields.ShorthandConfigField({
        permanent: new fields.BooleanField({initial: false, nullable: false}),
      }),
    });
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
    );
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
    return warpfields.EmbeddedShorthandField.submit(
      this.getActor(),
      shorthand,
      this.config.comparisonKeys,
      this.config.updateOpts
    );
  }

  getScene() {
    return this.getToken().parent;
  }
}

import warpfields from './schema';
import BaseShorthand from './BaseShorthand.mjs';
import SpatialOrientation from './SpatialOrientation.mjs';
const {fields} = foundry.data;

export default class WarpIn extends BaseShorthand {
  constructor(actor, options = {}) {
    if (typeof actor === 'string') actor = game.actors.getName(actor);
    super({
      token: actor.prototypeToken.toObject(),
      actor: actor.toObject(),
    }, {parent: actor, ...options});
  }

  static defineSchema() {
    return this.mergeSchema(super.defineSchema(), {
      position: new fields.EmbeddedDataField(SpatialOrientation),
      scene: new fields.ForeignDocumentField(Scene, {initial: () => canvas.scene}),
      token: new fields.EmbeddedDataField(foundry.data.PrototypeToken),
      config: new warpfields.ShorthandConfigField({
        controller: new fields.StringField(),
        duplicates: new fields.NumberField({initial: 1, min: 0, step: 1, integer: true}),
        collision: new fields.BooleanField({initial: data => data.duplicates > 1})
      }),
    });
  }

  #warpActor;

  warpActor() {
    if (!this.#warpActor) {

      const _this = this;
      const handler = {
        get(target, prop, receiver) {
          /* Redirect any calls to prototypeToken to our token */
          if (prop === 'prototypeToken') return _this.token;
          /* Redirect any other fields we own to our data */
          if (prop !== 'constructor' && prop in _this.actor) return _this.actor[prop];
          /* Otherwise pass-through to implementation */
          return Reflect.get(...arguments);
        }
      };
      this.#warpActor = new Proxy(this.parent, handler);
    }

    return this.#warpActor;
  }
}

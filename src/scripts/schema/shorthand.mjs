import {_createDelta} from '../mutator.js';
const fields = foundry.data.fields;

class ActorShorthand extends Actor.implementation {

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "ActorShorthand",
    collection: "actor",
    isEmbedded: false,
    indexed: false,
    '-=preserveOnImport': null,
    '-=embedded': null
  }, {inplace: false, performDeletions: true}));

  static defineSchema() {
    const schema = super.defineSchema();
    Object.values(super.metadata.embedded).forEach(emb => delete schema[emb])
    delete schema._id;
    delete schema._stats;
    delete schema.folder;
    delete schema.sort;
    delete schema.prototypeToken;
    return schema;
  }
}

class TokenShorthand extends TokenDocument.implementation {
  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "TokenShorthand",
    collection: "token",
    isEmbedded: false,
    indexed: false,
    '-=preserveOnImport': null,
    '-=embedded': null
  }, {inplace: false, performDeletions: true}));

  static defineSchema() {
    const schema = super.defineSchema();
    Object.values(super.metadata.embedded).forEach(emb => delete schema[emb])
    delete schema._id;
    return schema;
  }

}

export class Shorthand extends foundry.abstract.DataModel {

  constructor(data = {}, {parent = null, ...options}) {
    if (parent) {
      data.actor = foundry.utils.mergeObject(data.actor ?? {}, parent.actor.toObject());
      data.token = foundry.utils.mergeObject(data.token ?? {}, parent.toObject());
    }

    super(data, {parent, ...options});
  }

  static defineSchema() {
    return {
      actor: ActorShorthand.schema,
      token: TokenShorthand.schema,
      embedded: new fields.ObjectField({
        required: false,
        initial: () => (
          Reflect.ownKeys(Actor.implementation.metadata.embedded).reduce((acc, key) => {
            acc[key] = {}
            return acc;
          }, {}))
      })
    };
  }

}

export class MutationDelta extends foundry.abstract.DataModel {

  constructor(shorthand, options={}) {
    const delta = _createDelta(shorthand.parent, shorthand);

    super({
      delta: shorthand.clone(delta),
    }, {parent: shorthand.parent, ...options})
      
  }

  static defineSchema() {
    return {
      delta: Shorthand.schema,
      user: new fields.StringField({
        required: true,
        initial: () => game.user.id
      }),
      comparisonKeys: new fields.ObjectField({
        required: false,
        initial: () => ({Item: 'name', ActiveEffect: 'name'})
      }),
      name: new fields.StringField({
        blank: false,
        trim: true,
        initial: () => foundry.utils.randomID()
      }),
      updateOpts: new fields.ObjectField({
        required:false,
        initial: ()=>({})
      }),
      overrides: new fields.ObjectField({
        required:false,
        initial: ()=>({})
      }),
    };
  }
}

Hooks.on("init", () => {
  globalThis.Shorthand = Shorthand;
  globalThis.MutationDelta = MutationDelta;
});

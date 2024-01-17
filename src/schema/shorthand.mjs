import {_createDelta} from '../scripts/mutator.js';
const fields = foundry.data.fields;
const utils = foundry.utils;

class ActorShorthand extends Actor.implementation {

  /** @inheritdoc */
  static metadata = Object.freeze(utils.mergeObject(super.metadata, {
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
    Reflect.ownKeys(schema).forEach( key => {
      schema[key].required = false;
      schema[key].readonly = false;
    })
    return schema;
  }

  prepareEmbeddedDocuments() {}

}

class TokenShorthand extends TokenDocument.implementation {
  /** @inheritdoc */
  static metadata = Object.freeze(utils.mergeObject(super.metadata, {
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
    Reflect.ownKeys(schema).forEach( key => {
      schema[key].required = false;
      schema[key].readonly = false;
    })
    return schema;
  }

  prepareEmbeddedDocuments() {}

}

class KeyedShorthand extends fields.SchemaField {
  constructor(keys, valueFn, options = {}) {
    const schema = keys.reduce((acc, key) => {
            acc[key] = valueFn(key);
            return acc;
          }, {})
    super(schema, options);
  }
}

class EmbeddedShorthand extends KeyedShorthand {
  constructor(owner, type, typeOptions = {}, options = {}) {
    const keys = Reflect.ownKeys(owner.metadata.embedded)
    super(keys, () => (new type(typeOptions)), options);
  }
}

export class Shorthand extends foundry.abstract.DataModel {

  #changes = {}

  /** 
   * @override
   * @inheritdoc
   */
  updateSource(changes, options) {
    const delta = super.updateSource(changes, options);
    utils.mergeObject(this.#changes, delta);
    return delta;
  }

  get changes() {
    return utils.deepClone(this.#changes);
  }
}

export class MutationOptions extends fields.SchemaField{
  constructor(options = {}) {
    super({
      user: new fields.StringField({
        required: true,
        initial: () => game.user.id
      }),
      comparisonKeys: new EmbeddedShorthand(Actor.implementation, fields.StringField, {initial: 'name'}),
      name: new fields.StringField({
        blank: false,
        trim: true,
        initial: () => foundry.utils.randomID()
      }),
      updateOpts: new KeyedShorthand(['token','actor','embedded'], () => new fields.ObjectField()),
      overrides: new fields.ObjectField({
        required:false,
        initial: ()=>({})
      }),
    }, options)
  }
}

export class Mutation extends Shorthand {
  constructor(data = {}, options = {}) {
    const initial = {
      actor: new ActorShorthand(options.parent.actor),
      token: new TokenShorthand(options.parent),
    };
    super(initial, options);
    this.updateSource(data);
  }

  static defineSchema() {
    return {
      actor: ActorShorthand.schema,
      token: TokenShorthand.schema,
      embedded: new EmbeddedShorthand(Actor.implementation, fields.ObjectField),
      options: new MutationOptions(),
    }
  }


}

export class MutationDelta extends foundry.abstract.DataModel {

  constructor(mutation, options={}) { 
    
    const delta = _createDelta(mutation.parent, mutation.toObject(), mutation.options);
    super({
      delta,
      options: mutation.options,
    }, {parent: mutation.parent, ...options})
      
  }

  static defineSchema() {
    return {
      delta: new fields.ObjectField({
        required: true,
        nullable: false,
        initial: () => ({})
      }),
      options: new MutationOptions(),
    };
  }
}

Hooks.on("ready", () => {
  globalThis.Mutation = Mutation;
  globalThis.MutationDelta = MutationDelta;
});

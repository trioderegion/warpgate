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
      permanent: new fields.BooleanField({initial: false, nullable: false}),
      comparisonKeys: new EmbeddedShorthand(Actor.implementation, fields.StringField, {initial: 'name'}),
      name: new fields.StringField({
        nullable: true,
        required: false,
        trim: true,
      }),
      updateOpts: new KeyedShorthand(['token','actor','embedded'], () => new fields.ObjectField()),
      overrides: new fields.ObjectField({
        required:false,
        initial: ()=>({})
      }),
    }, options)
  }

  clean(data, options) {
    data = super.clean(data, options);

    /* if `id` is being used as the comparison key, 
     * change it to `_id` and set the option to `keepId=true`
     * if either are present
     */
    data.updateOpts ??= {};
    Object.keys(data.comparisonKeys ?? {}).forEach( embName => {

      /* switch to _id if needed */
      if(data.comparisonKeys[embName] == 'id') data.comparisonKeys[embName] = '_id'

      /* flag this update to preserve ids */
      if(data.comparisonKeys[embName] == '_id') {
        data.updateOpts = foundry.utils.mergeObject(data.updateOpts, {embedded: {[embName]: {keepId: true}}});
      }
    });

    return data;
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

  // @TODO temp wrapper
  apply(driver = globalThis.Mutator) {
    return driver.mutate(this) ;
  }


}

/**
 *
 * @class MutationDelta
 * @prop {object} options
 */
export class MutationDelta extends foundry.abstract.DataModel {

  constructor(mutation, {id = null, ...options} = {}) { 
    
    const delta = _createDelta(mutation.parent, mutation.toObject(), mutation.options);

    super({
      id: id ?? mutation.options.name,
      delta,
      options: mutation.options,
    }, {parent: mutation, ...options})
  }

  static defineSchema() {
    return {
      id: new fields.StringField({
        required: true,
        nullable: false,
        initial: () => foundry.utils.randomID(),
      }),
      delta: new fields.ObjectField({
        required: true,
        nullable: false,
        initial: () => ({})
      }),
      options: new MutationOptions(),
    };
  }
}


/**
 *
 *
 * @export
 * @class MutationStack
 * @extends {foundry.abstract.DataModel}
 * @param {Array<object>} stack
 */
export class MutationStack extends foundry.abstract.DataModel {

  constructor(parent, {name = 'mutate', ...options} = {}) {
    const stack = parent.getFlag('%config.id%', name) ?? [];
    super({stack, name}, {parent, ...options});
  }

  static defineSchema() {
    return {
      name: new fields.StringField({
        required: true,
      }),
      stack: new fields.ArrayField(MutationDelta.schema)
    }
  }

  static cleanData(source = {}, options = {}) {
    const data = super.cleanData(source, options);
    data.stack = data.stack.reduce( (acc, curr) => {
      const existing = acc.find( e => e.id === curr.id );
      if (existing) {
        foundry.utils.mergeObject(existing, curr);
      } else {
        acc.push(curr);
      }

      return acc;
    }, []);

    return data;
  }

  push(...elements) {
    const updated = this.updateSource({stack: [...this.stack, ...elements]})?.stack;
    if (updated) {
      return foundry.utils.expandObject({
        [`flags.%config.id%.${this.name}`]: updated
      })
    }

    return;
  }

  get(id) {
    return this.stack.find( e => e.id === id );
  }


}

Hooks.on("ready", () => {
  globalThis.Mutation = Mutation;
  globalThis.MutationDelta = MutationDelta;
  globalThis.MutationStack = MutationStack;
});

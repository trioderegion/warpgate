import { DocSchema, EmbeddedShorthand, MutationConfig } from './schema';
const { fields } = foundry.data;
const { DataModel } = foundry.abstract;
const utils = foundry.utils;

class Shorthand extends DataModel {

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

export class Mutation extends Shorthand {
  constructor(data = {}, options = {}) {
    const initial = {
      actor: options.parent.actor.clone(),
      token: options.parent.clone(),
    };
    super(initial, options);
    this.updateSource(data);
  }

  static defineSchema() {
    return {
      actor: new DocSchema(Actor.implementation, {required: false, nullable: true}),
      token: new DocSchema(TokenDocument.implementation, {required: false, nullable: true}),
      embedded: new EmbeddedShorthand(Actor.implementation, fields.ObjectField),
      config: new MutationConfig(),
    }
  }

  base() {
    //switch (path) {
    //  case 'token': return new DocSchema(this.parent);
    //  case 'actor': return new DocSchema(this.parent.actor);
    //}
    return new this.constructor({}, {parent: this.parent, ...this.options});
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
export class MutationDelta extends DataModel {

  constructor(mutation, {id = null, ...options} = {}) { 

    super({
      id,
    }, {parent: mutation, ...options})
  }

  static defineSchema() {
    return {
      id: new fields.StringField({
        required:true,
        nullable: false,
        initial: () => foundry.utils.randomID(),
      }),
      delta: new fields.ObjectField({
        required: false,
        nullable: true,
        initial: null,
      }),
    };
  }

  _initialize(options = {}) {
    if (this.parent && !this._source.delta) {
      this._source.delta = Mutator._createDelta(this.parent.parent, this.parent.changes, this.parent.config);
    }
    super._initialize(options);
  }
}


/**
 *
 *
 * @export
 * @class MutationStack
 * @param {Array<object>} stack
 */
export class MutationStack extends DataModel {

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

    /* @TODO re-eval if this is a good idea */
    /* Allow duplicate delta IDs by merging */
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

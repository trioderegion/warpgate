import RollbackDelta from './RollbackDelta.mjs';

const {fields} = foundry.data;
const {DataModel} = foundry.abstract;

export default class RollbackStack extends DataModel {

  constructor(actor, {name = 'mutate', ...options} = {}) {
    const stack = actor.getFlag('%config.id%', name) ?? [];
    super({stack, name}, {parent: actor, ...options});
  }

  static defineSchema() {
    return {
      name: new fields.StringField({
        required: true,
      }),
      stack: new fields.ArrayField(new fields.EmbeddedDataField(RollbackDelta)),
    };
  }

  static cleanData(source = {}, options = {}) {
    const data = super.cleanData(source, options);

    /* TODO re-eval if this is a good idea */
    /* Allow duplicate delta IDs by merging */
    data.stack = data.stack.reduce((acc, curr) => {
      const existing = acc.find(e => e.id === curr.id);
      if (existing) {
        foundry.utils.mergeObject(existing, curr);
      } else {
        acc.push(curr);
      }

      return acc;
    }, []);
    data.stack = data.stack.map( d => new RollbackDelta({id: d.id, delta: d.delta}, options) )
    return data;
  }

  push(...elements) {
    const updated = this.updateSource({stack: [...this.stack, ...elements]})?.stack;
    if (updated) {
      return foundry.utils.expandObject({
        [`flags.%config.id%.${this.name}`]: updated
      })
    }

    return {};
  }

  pop() {
    const delta = this.stack.pop();
    this.updateSource({stack: [...this.stack]});
    return delta;
  }

  toFlag() {
    return foundry.utils.expandObject({
      [`flags.%config.id%.${this.name}`]: [...this.stack]
    });
  }

  get(id) {
    return this.stack.find(e => e.id === id);
  }

}

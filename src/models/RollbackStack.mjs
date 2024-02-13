import RollbackDelta from "./RollbackDelta.mjs";

const {fields} = foundry.data;
const {DataModel} = foundry.abstract;

export default class RollbackStack extends DataModel {

  constructor(parent, {name = 'mutate', ...options} = {}) {
    const stack = parent.getFlag('%config.id%', name) ?? [];
    super({stack, name}, {parent, ...options});
  }

  static defineSchema() {
    return {
      name: new fields.StringField({
        required: true,
      }),
      stack: new fields.ArrayField(RollbackDelta.schema)
    }
  }

  static cleanData(source = {}, options = {}) {
    const data = super.cleanData(source, options);

    /* @TODO re-eval if this is a good idea */
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
    data.stack = data.stack.map( d => new RollbackDelta(null, {id: d.id, delta: d.delta, ...options}) )
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

  get(id) {
    return this.stack.find(e => e.id === id);
  }


}

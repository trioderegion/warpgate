import Mutation from './Mutation.mjs';

const {fields} = foundry.data;
const {DataModel} = foundry.abstract;

export default class RollbackDelta extends DataModel {

  constructor(mutation, {id = null, delta = null, ...options} = {}) {
    super({id, delta}, {parent: mutation, ...options});
  }

  static defineSchema() {
    return {
      id: new fields.StringField({
        required: true,
        nullable: false,
        initial: () => foundry.utils.randomID(),
      }),
      delta: new fields.ObjectField({
        required: false,
        nullable: false,
        initial: () => ({}),
      }),
    };
  }

  get mutation() {
    return this.parent;
  }

  _initialize(options = {}) {
    if (this.parent ) {
      this._source.delta = this.computeRollbackDelta();
    }
    super._initialize(options);
  }

  computeRollbackDelta() {
    const {actor, token, config, embedded} = this.mutation.toObject();
    const base = new Mutation(this.mutation.parent).toObject();
    /* Token diff */
    const tokenDiff = this.constructor._strictDiff(token, base.token);

    /* Actor diff */
    const actorDiff = this.constructor._strictDiff(actor, base.actor);

    /* Embedded diff */
    const embeddedDiff = this._computeEmbeddedRollback(embedded);

    return {token: tokenDiff, actor: actorDiff, embedded: embeddedDiff, config};
  }

  _computeEmbeddedRollback(changes) {
    const rollback = Reflect.ownKeys(changes).reduce( (change, type) => {
      const collection = this.mutation.parent.actor.getEmbeddedCollection(type);
      change[type] = this.constructor._invertShorthand(
        collection,
        changes[type],
        this.mutation.config.comparisonKeys[type]
      );
      return change;
    }, {});

    return rollback;
  }

  static #findByQuery( list, key, comparisonPath ) {
    return list.find( element => foundry.utils.getProperty(element, comparisonPath) === key );
  }

  static _invertShorthand(collection, updates, comparisonKey) {
    let inverted = {};
    Object.keys(updates).forEach( key => {

      /* Find this item currently and copy off its data */
      const currentData = this.#findByQuery(collection, key, comparisonKey);

      /* This is a delete */
      if (updates[key] === warpgate.CONST.DELETE) {

        /* Hopefully we found something */
        if (currentData) foundry.utils.setProperty(inverted, key, currentData.toObject());
        else logger.debug('Delta Creation: Could not locate shorthand identified document for deletion.', collection, key, updates[key]);

        return;
      }

      /* This is an update */
      if (currentData) {
        /* Grab the current value of any updated fields and store */
        // TODO check that these updates are already expanded
        // const expandedUpdate = expandObject(updates[key]);
        const sourceData = currentData.toObject();
        const updatedData = foundry.utils.mergeObject(sourceData, updates[key], {inplace: false});

        const diff = this._strictDiff(updatedData, sourceData);

        foundry.utils.setProperty(inverted, updatedData[comparisonKey], diff);
        return;
      }

      /* Must be an add, so we delete */
      foundry.utils.setProperty(inverted, key, warpgate.CONST.DELETE);

    });

    return inverted;
  }

  static _strictDiff(base, other) {
    const diff = foundry.utils.flattenObject(
      foundry.utils.diffObject(base, other, {inner: true})
    );

    /* Get any newly added fields */
    const additions = this._newFields(base, other);

    /* Set their data to null */
    Object.keys(additions).forEach(key => {
      if (typeof additions[key] != 'object') {
        const parts = key.split('.');
        parts[parts.length - 1] = `-=${parts.at(-1)}`;
        diff[parts.join('.')] = null;
      }
    });

    return foundry.utils.expandObject(diff);
  }

  static _newFields(base = {}, other = {}) {
    base = foundry.utils.flattenObject(base);
    other = foundry.utils.flattenObject(other);

    const ts = getType(base);
    const tt = getType(other);
    if (ts !== 'Object' || tt !== 'Object') throw new Error('One of source or template are not Objects!');

    // Define recursive filtering function
    const _filter = function(s, t, filtered) {
      for (let [k, v] of Object.entries(s)) {
        let has = t.hasOwnProperty(k);
        let x = t[k];

        // Case 1 - inner object
        if (has && foundry.utils.getType(v) === 'Object' && foundry.utils.getType(x) === 'Object') {
          filtered[k] = _filter(v, x, {});
        }

        // Case 2 - inner key
        else if (!has) {
          filtered[k] = v;
        }
      }
      return filtered;
    };

    // Begin filtering at the outer-most layer
    return _filter(base, other, {});
  }

}

/* 
 * This file is part of the warpgate module (https://github.com/trioderegion/warpgate)
 * Copyright (c) 2021 Matthew Haentschke.
 * 
 * This program is free software: you can redistribute it and/or modify  
 * it under the terms of the GNU General Public License as published by  
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but 
 * WITHOUT ANY WARRANTY; without even the implied warranty of 
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU 
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License 
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import {
  logger
} from '../utility/logger.js';
import {MODULE} from '../utility/module.js'

//@ts-ignore
import * as fields from '../../../common/data/fields.mjs'

import {Mutation} from './mutation.mjs'

/**
 * Foundry abstract class representing base behavior for all DocumentData extensions
 * @external DocumentData
 * @see {@link https://foundryvtt.com/api/abstract.DocumentData.html|Interfaces/DocumentData}
 */

/**
 * @class
 * @extends {foundry.abstract.DocumentData}
 * @see external:DocumentData
 */
export class StackData extends foundry.abstract.DocumentData {

  /** @type string */
  cls;

  /** @type string */
  id;

  /** @type string */
  name;

  /** @type StackCallbacks */
  callbacks;

  /** @type Delta */
  delta;

  /** @type Shorthand */
  links;

  static CALLBACK_FIELD = {
    ...fields.OBJECT_FIELD,
    clean: data => {
      Object.values(data).forEach( stage => stage.forEach( cb => cb.fn = StackData.fnReviver(cb.fn) ) );
      return data;
    }
  }

  static fnReviver(data) {
    return (data instanceof Array && data[0] == 'Function') ?
      new (Function.bind.apply(Function, [Function].concat(data[1], [data[2]]))) :
      data
    ;
  };

  static defineSchema() {
    return {

      /* serialization and identification */
      cls: fields.field(fields.STRING_FIELD, {default: Mutation.name}),
      id: fields.REQUIRED_STRING,
      name: fields.REQUIRED_STRING,

      /* data for handling this mutation stack entry */
      user: fields.field(fields.STRING_FIELD, {default: game.userId}),
      permission: fields.field(fields.DOCUMENT_PERMISSIONS, {default: {'default': CONST.DOCUMENT_PERMISSION_LEVELS.OWNER}}),
      links: {
        type: [Object],
        required: false,
        default: [],
      },
      hidden: fields.BOOLEAN_FIELD,

      callbacks: StackData.CALLBACK_FIELD,

      /* actual mutation data */
      delta: fields.OBJECT_FIELD,
    }
  }
}

/**
 * The Foundry extension of {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map|Map}
 * @external Collection
 * @see {@link https://foundryvtt.com/api/Collection.html|Classes/Collection}
 */

/**
 * @class
 * @extends Collection
 * @see external:Collection
 */
export class MutationStack extends Collection {

  /**
   * @param {ClientDocument} doc
   */
  constructor(doc, {module = MODULE.data.name, stack = 'mutation'} = {}) {
    /* initialize our collection */
    const rawData = doc.getFlag(MODULE.data.name, stack) ?? [];
    const initData = rawData.length > 0 ? rawData.map( data => [data.id, new StackData(data)] ) : null;

    super(initData);

    this._doc = doc;
    this._type = {module, stack};

  }

  /* @deprecated */
  get stack() {
    return this;
  }

  /** @private */
  get type() {
    return this._type;
  }

  /**
   * @param {StackData} stackData
   */
  create(stackData) {
    this.set(stackData.id, stackData);
    return this;
  };

  /**
   * @param {string} id
   * @param {object|StackData} data
   */
  set(id, data) {
    data = typeof data === "object" ? new StackData(data) : data;
    return super.set(id,data);
  }

  /**
   * Applies a given change or tranform function to the current buffer,
   * unlocking if needed.
   *
   * @param {Object|Function} transform Object to merge or function to generate an object to merge.
   * @param {Function} filterFn [() => true] Optional function returning a boolean indicating if this
   *                   element should be modified. By default, affects all elements of the mutation stack.
   * @return {MutationStack} self, unlocked for writing and updates staged.
   * @memberof MutationStack
   */
  updateAll(transform, filterFn = () => true) {

    /** @param {object|Function} transform */
    const innerUpdate = (transform) => {
      if (typeof transform === 'function') {
        /* if we are applying a transform function */
        return (element) => element.update(transform(element));
      } else {
        /* if we are applying a constant change */
        return (element) => element.update(transform);
      }
    }

    this.forEach((element) => {
      if (filterFn(element)) {
        innerUpdate(transform)(element);
      }
    });

    return this;
  }

  /**
   * Deletes all mutations from this actor's stack, effectively making
   * the current changes permanent.
   *
   * @param {Function} filterFn [() => true] Optional function returning a boolean indicating if this
   *                   element should be delete. By default, deletes all elements of the mutation stack.
   * @return {MutationStack} self, unlocked for writing and updates staged.
   * @memberof MutationStack
   */
  deleteAll(filterFn = () => true) {

    this.forEach( entry => {
      if(filterFn(entry)) this.delete(entry.id); 
    });

    return this;
  }

  /**
   * Updates the owning actor with the mutation stack changes made. Will not commit a locked buffer.
   *
   * @return {Promise<MutationStack>} self, locked for writing
   * @memberof MutationStack
   */
  async commit() {

    await this._doc.update(this.toObject(true));

    return this;
  }

  pop() {
    return this.contents.pop();
  }

  toObject(asFlag = false) {
    
    const rootData = {
        [this.type.module]: {
          [this.type.stack]: this.toJSON(),
        }
      }

    if(asFlag) return {flags: rootData};

    return rootData;

  }

  /**
   * @param {string} id
   * @return {StackData|undefined} resulting StackData
   */
  unroll(id){

    /** @type StackData */
    let target = this.get(id, {strict: false});
    if (!target) {
      logger.debug(`Could not find mutation [${id}] on actor ${this._doc?.name}`);
      return;
    }

    /** @type IterableIterator<StackData> */
    let iter = this[Symbol.iterator]();

    /* place iterator at target entry */
    let curr = iter.next();
    while(!curr.done && (curr.value.id !== target.id)) {
      curr = iter.next();
    }

    if(curr.done) {
      logger.debug(`Could not iterate to previously found Mutation "${target.name}" [${target.id}].`)
      return;
    }

    /* iter at target entry */
    while( !(curr = iter.next()).done ){

      /* get the values stored in our delta and push any overlapping ones to
       * the mutation next in the stack
       */
      const stackUpdate = filterObject(target.delta, curr.value.delta);
      curr.value.update({delta: stackUpdate});

      /* remove any changes that exist higher in the stack, we have
       * been overriden and should not restore these values
       */
      const targetUpdate = MODULE.unique(target.delta, curr.value.delta);
      target.update({delta: targetUpdate});
    }

    this.delete(target.id);

    return target;
  }
  
}

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
} from './logger.js';
import {
  MODULE
} from './module.js'

import * as fields from '../../../common/data/fields.mjs'
import {Mutation} from './entities/mutation.mjs'

function fnToString(fn) {


}

export class StackData extends foundry.abstract.DocumentData {
  static defineSchema() {
    return {

      /* serialization and identification */
      class: fields.field(fields.STRING_FIELD, {default: Mutation.name}),
      id: fields.REQUIRED_STRING,
      name: fields.REQUIRED_STRING,

      /* data for handling this mutation stack entry */
      user: fields.field(fields.STRING_FIELD, {default: game.user.id}),
      permission: fields.field(fields.DOCUMENT_PERMISSIONS, {default: {'default': CONST.DOCUMENT_PERMISSION_LEVELS.OWNER}}),
      links: {
        type: [Object],
        required: false,
        default: [],
      },
      hidden: fields.BOOLEAN_FIELD,

      callbacks: fields.OBJECT_FIELD,

      /* actual mutation data */
      delta: fields.OBJECT_FIELD,
    }
  }
}

globalThis.StackData = StackData;

/*** MUTATION DATA STRUCTURE ****/
//  delta, (i.e. update object needed to revert this mutation, shorthand)
//  user: game.user.id,
//  comparisonKeys: options.comparisonKeys ?? {},
//  id: randomId();
//  name: options.name ?? id
export class MutationStack extends Collection {
  constructor(doc, {module = MODULE.data.name, stack = 'mutation'} = {}) {

    this._doc = doc;
    this._type = {module, stack};

    /* initialize our collection */
    const rawData = doc.getFlag(MODULE.data.name, 'mutate') ?? [];
    const initData = rawData.length > 0 ? rawData.map( data => [data.id, new StackData(data)] ) : null;

    super(initData);
  }

  /* @deprecated */
  get stack() {
    return this;
  }

  get type() {
    return this._type;
  }

  /**
   * Searches for an element of the mutation stack that satisfies the provided predicate
   *
   * @param {Function} predicate Receives the argments of Array#find and returns a Boolean indicating if the current
   *                             element satisfies the predicate condition
   * @return {Object} Element of the mutation stack that matches the predicate, or undefined if none.
   * @memberof MutationStack
   */
  //find(predicate) {
  //  if (this._locked) return (this._doc.getFlag(MODULE.data.name, 'mutate') ?? []).find(predicate);

  //  return this._stack.find(predicate);
  //}

  /**
   * Searches for an element of the mutation stack that satisfies the provided predicate and returns its
   * stack index
   *
   * @param {Function} predicate Receives the argments of Array#findIndex and returns a Boolean indicating if the current
   *                             element satisfies the predicate condition
   * @return {Number} Index of the element of the mutation stack that matches the predicate, or undefined if none.
   * @memberof MutationStack
   * @private
   */
  //_findIndex( predicate ) {

  //  if (this._locked) return (this._doc.getFlag(MODULE.data.name, 'mutate') ?? []).findIndex(predicate);

  //  return this._stack.findIndex(predicate);
  //}

  /**
   * Retrieves an element of the mutation stack that matches the provided name
   *
   * @param {String} name Name of mutation 
   * @return {Object} Element of the mutation stack matching the provided name, or undefined if none
   * @memberof MutationStack
   */
  //getName(name) {
  //  return this.find((element) => element.name === name);
  //}

  /**
   * Retrieves an element of the mutation stack that matches the provided name
   *
   * @param {String} id ID of mutation (serves as a unique identifier)
   * @return {Object} Element of the mutation stack matching the provided ID, or undefined if none
   * @memberof MutationStack
   */
  //get(id) {
  //  return this.find((element) => element.id === id);
  //}

  /**
   * Retrieves that last mutation added to the mutation stack, or undefined if none present
   *
   * @return {Object} Newest element of the mutation stack
   * @memberof MutationStack
   */
  //get last() {
  //  return this.stack[this.stack.length - 1];
  //}

  create(stackData) {
    this.set(stackData.id, stackData);

    return this;
  };

  /**
   * Updates the mutation matching the provided name with the provided mutation info.
   * The mutation info can be a subset of the full object iff overwrite is false.
   *
   * @param {*} name name of mutation to update
   * @param {*} mutationInfo new information, can include 'name'.
   * @param {*} options {overwrite = false} default will merge the provided info
   *            with the current values. True will replace the entire entry and requires
   *            at least the 'name' field.
   *  
   * @return {MutationStack} self, unlocked for writing and updates staged.
   * @memberof MutationStack
   */
  //update(name, mutationInfo, {
  //  overwrite = false
  //}) {
  //  //const index = this._findIndex((element) => element.name === name);

  //  const element = this.getName(name);

  //  if (!element) {
  //    return false;
  //  }

  //  this._unlock();

  //  if (overwrite) {

  //    this._stack[index] = new StackData(mutationInfo);

  //  } else {
  //    /* incomplete mutations are fine with merging */
  //    this._stack[index].update(mutationInfo);
  //  }

  //  return this;
  //}

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
   * @return {MutationStack} self, locked for writing
   * @memberof MutationStack
   */
  async commit() {

    await this._doc.update(this.toObject(true));

    return this;
  }

  toObject(asFlag = false) {
    
    const rootData = {
        [this.type.moduleName]: {
          [this.type.stackName]: this.toJSON(),
        }
      }

    if(asFlag) return {flags: rootData};

    return rootData;

  }
  
}

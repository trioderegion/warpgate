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

class StackData extends foundry.abstract.DocumentData {
  static defineSchema() {
    return {
      id: fields.REQUIRED_STRING,
      name: fields.REQUIRED_STRING,
      user: fields.field(fields.STRING_FIELD, {default: game.user.id}),
      permission: mergeObject(fields.DOCUMENT_PERMISSIONS, {default: {'default': CONST.DOCUMENT_PERMISSION_LEVELS.OWNER}},{inplace: false}),
      delta: fields.field(fields.OBJECT_FIELD, {default: {}}),
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
export class MutationStack {
  constructor(doc) {

    this._doc = doc;

    /* Grab the current stack (or make a new one) */
    this._stack = null;

    /* indicates if the stack has been duplicated for modification */
    this._locked = true;
  }

  get stack() {
    return this._locked ? this._doc.getFlag(MODULE.data.name, 'mutate') ?? [] : this._stack ;
  }

  /**
   * Searches for an element of the mutation stack that satisfies the provided predicate
   *
   * @param {Function} predicate Receives the argments of Array#find and returns a Boolean indicating if the current
   *                             element satisfies the predicate condition
   * @return {Object} Element of the mutation stack that matches the predicate, or undefined if none.
   * @memberof MutationStack
   */
  find(predicate) {
    if (this._locked) return (this._doc.getFlag(MODULE.data.name, 'mutate') ?? []).find(predicate);

    return this._stack.find(predicate);
  }

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
  _findIndex( predicate ) {

    if (this._locked) return (this._doc.getFlag(MODULE.data.name, 'mutate') ?? []).findIndex(predicate);

    return this._stack.findIndex(predicate);
  }

  /**
   * Retrieves an element of the mutation stack that matches the provided name
   *
   * @param {String} name Name of mutation (serves as a unique identifier)
   * @return {Object} Element of the mutation stack matching the provided name, or undefined if none
   * @memberof MutationStack
   */
  getName(name) {
    return this.find((element) => element.name === name);
  }

  /**
   * Retrieves that last mutation added to the mutation stack, or undefined if none present
   *
   * @return {Object} Newest element of the mutation stack
   * @memberof MutationStack
   */
  get last() {
    return this.stack[this.stack.length - 1];
  }

  create(metaData, revertData) {
    this._unlock();

    const entry = {
      ...metaData,
      delta: revertData
    }

    this.stack.push(new StackData(entry));

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
  update(name, mutationInfo, {
    overwrite = false
  }) {
    const index = this._findIndex((element) => element.name === name);

    if (index < 0) {
      return false;
    }

    this._unlock();

    if (overwrite) {

      this._stack[index] = new StackData(mutationInfo);

    } else {
      /* incomplete mutations are fine with merging */
      this._stack[index].update(mutationInfo);
    }

    return this;
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

    const innerUpdate = (transform) => {
      if (typeof transform === 'function') {
        /* if we are applying a transform function */
        return (element) => element.update(transform(element));
      } else {
        /* if we are applying a constant change */
        return (element) => element.update(transform);
      }
    }

    this._unlock();

    this._stack.forEach((element) => {
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
    this._unlock();

    this._stack = this._stack.filter((element) => !filterFn(element))

    return this;
  }

  /**
   * Updates the owning actor with the mutation stack changes made. Will not commit a locked buffer.
   *
   * @return {MutationStack} self, locked for writing
   * @memberof MutationStack
   */
  async commit() {

    if(this._locked) {
      logger.error(MODULE.localize('error.stackLockedOrEmpty'))
    }

    await this._doc.update({
      flags: {
        [MODULE.data.name]: {
          'mutate': this._stack
        }
      }
    });

    /* return to a locked read-only state */
    this._locked = true;
    this._stack = null;

    return this;
  }

  /**
   * Unlocks the current buffer for writing by copying the mutation stack into this object.
   *
   * @return {Boolean} Indicates if the unlock occured. False indicates the buffer was already unlocked.
   * @memberof MutationStack
   */
  _unlock() {

    if (!this._locked) {
      return false;
    }

    this._stack = duplicate(this._doc.getFlag(MODULE.data.name, 'mutate') ?? []);
    this._locked = false;
    return true;
  }

}

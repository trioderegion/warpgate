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
import {
  RemoteMutator
} from './remote-mutator.js'

/*** MUTATION DATA STRUCTURE ****/
//  delta, (i.e. update object needed to revert this mutation)
//  user: game.user.id,
//  comparisonKeys: options.comparisonKeys ?? {},
//  name: options.name ?? randomID()


export class MutationStack {
  constructor(tokenDoc) {

    this._token = tokenDoc;

    /* Grab the current stack (or make a new one) */
    this._stack = null;
    //

    /* indicates if the stack has been duplicated for modification */
    this._locked = true;
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
    if (this._locked) return (this._token.actor.getFlag(MODULE.data.name, 'mutate') ?? []).find(predicate);

    return this._stack.find(predicate);
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
  last() {

    if (this._locked) {
      const lockedStack = this._token.actor.getFlag(MODULE.data.name, 'mutate') ?? []
      return lockedStack[lockedStack.length - 1]
    }

    return this._stack[this._stack.length - 1]
  }

  /**
   * Updates the mutation matching the provided name with the provided mutation info.
   * The mutation info can be a subset of the full object iff overwrite is false.
   *
   * @param {*} originalName
   * @param {*} mutationInfo
   * @param {*} {overwrite = false}
   * @return {*} 
   * @memberof MutationStack
   */
  update(originalName, mutationInfo, {
    overwrite = false
  }) {
    const index = this._stack.findIndex((element) => element.name === originalName);

    if (index < 0) {
      return false;
    }

    this._unlock();

    if (overwrite) {

      /* we need at LEAST a name to identify by */
      if (!!mutationInfo.name) {
        logger.error(MODULE.localize('IncompleteMutationInfo'));
        return this;
      }

      this._stack[index] = mutationInfo;
    } else {
      /* incomplete mutations are fine with merging */
      mergeObject(this._stack[index], mutationInfo);
    }

    return this;
  }

  updateAll(transform, filterFn = () => true) {

    const innerUpdate = (transform) => {
      if (typeof transform === 'function') {
        /* if we are applying a transform function */
        return (element) => mergeObject(element, transform(element));
      } else {
        /* if we are applying a constant change */
        return (element) => mergeObject(element, transform);
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

  deleteAll(filterFn = () => true) {
    this._unlock();

    this._stack = this._stack.filter((element) => !filterFn(element))

    return this;
  }

  async commit() {
    this._unlock();

    await this._token.actor.update({
      flags: {
        [MODULE.data.name]: {
          'mutate': this._stack
        }
      }
    });
    this._locked = true;
    this._stack = null;
  }

  _unlock() {

    if (this._stack) {
      return false;
    }

    this._stack = duplicate(this._token.actor.getFlag(MODULE.data.name, 'mutate') ?? []);
    this._locked = false;
    return true;
  }

}

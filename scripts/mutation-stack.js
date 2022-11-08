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

/*** MUTATION DATA STRUCTURE ****/
//  delta, (i.e. update object needed to revert this mutation)
//  user: game.user.id,
//  comparisonKeys: options.comparisonKeys ?? {},
//  updateOpts: options.updateOpts ?? {}
//  name: options.name ?? randomID()

/** 
 * @typedef MutationData
 * @property {{actor:?object,token:?object,embedded:?object}} delta
 * @property {string} user
 * @property {Object<string, string>} comparisonKeys
 * @property {string} name
 */

/**
 * @class
 */
export class MutationStack {
  constructor(tokenDoc) {

    this.actor = tokenDoc instanceof TokenDocument ? tokenDoc.actor :
                    tokenDoc instanceof Token ? tokenDoc.document.actor :
                    tokenDoc instanceof Actor ? tokenDoc :
                    null;

    if(!this.actor) {
      throw new Error(MODULE.localize('error.stack.noActor'));
    }

  }

  /**
   * private copy of the working stack
   * @type Array<MutationData>
   */
  #stack = [];

  /** indicates if the stack has been duplicated for modification */
  #locked = true;

  /**
   * @returns {Array}
   */
  get #liveStack() {
    // @ts-ignore
    return this.actor?.getFlag(MODULE.data.name, 'mutate') ?? [] 
  }

  get stack() {
    return this.#locked ? this.#liveStack : this.#stack ;
  }

  /**
   * Searches for an element of the mutation stack that satisfies the provided predicate
   *
   * @param {function(any):boolean} predicate Receives the argments of {@link Array.find} and returns a Boolean indicating if the current
   *                             element satisfies the predicate condition
   * @return {MutationData|undefined} Element of the mutation stack that matches the predicate, or undefined if none.
   * @memberof MutationStack
   * @see Array.find
   */
  find(predicate) {
    if (this.#locked) return this.#liveStack.find(predicate);

    return this.#stack.find(predicate);
  }

  /**
   * Searches for an element of the mutation stack that satisfies the provided predicate and returns its
   * stack index
   *
   * @param {function(any):boolean} predicate Receives the argments of {@link Array.findIndex} and returns a Boolean indicating if the current
   *                             element satisfies the predicate condition
   * @return {Number} Index of the element of the mutation stack that matches the predicate, or undefined if none.
   * @memberof MutationStack
   */
  #findIndex( predicate ) {

    if (this.#locked) return this.#liveStack.findIndex(predicate);

    return this.#stack.findIndex(predicate);
  }

  /**
   * Retrieves an element of the mutation stack that matches the provided name
   *
   * @param {String} name Name of mutation (serves as a unique identifier)
   * @return {MutationData|undefined} Element of the mutation stack matching the provided name, or undefined if none
   * @memberof MutationStack
   */
  getName(name) {
    return this.find((element) => element.name === name);
  }

  /**
   * Retrieves that last mutation added to the mutation stack, or undefined if none present
   *
   * @return {MutationData} Newest element of the mutation stack
   * @memberof MutationStack
   */
  get last() {
    return this.stack[this.stack.length - 1];
  }

  /**
   * Updates the mutation matching the provided name with the provided mutation info.
   * The mutation info can be a subset of the full object iff overwrite is false.
   *
   * @param {string} name name of mutation to update
   * @param {MutationData} mutationInfo new information, can include 'name'.
   * @param {object} [options]
   * @param {boolean} [options.overwrite = false] default will merge the provided info
   *            with the current values. True will replace the entire entry and requires
   *            at least the 'name' field.
   *  
   * @return {MutationStack} self, unlocked for writing and updates staged if update successful
   * @memberof MutationStack
   */
  update(name, mutationInfo, {
    overwrite = false
  }) {
    const index = this.#findIndex((element) => element.name === name);

    if (index < 0) {
      return this;
    }

    this.#unlock();

    if (overwrite) {

      /* we need at LEAST a name to identify by */
      if (!mutationInfo.name) {
        logger.error(MODULE.localize('error.incompleteMutateInfo'));
        this.#locked=true; 
        return this;
      }

      /* if no user is provided, input current user. */
      if (!mutationInfo.user) mutationInfo.user = game.user.id;
      this.#stack[index] = mutationInfo;

    } else {
      /* incomplete mutations are fine with merging */
      mergeObject(this.#stack[index], mutationInfo);
    }

    return this;
  }

  /**
   * Applies a given change or tranform function to the current buffer,
   * unlocking if needed.
   *
   * @param {MutationData|function(MutationData) : MutationData} transform Object to merge or function to generate an object to merge.
   * @param {function(MutationData):boolean} filterFn [() => true] Optional function returning a boolean indicating if this
   *                   element should be modified. By default, affects all elements of the mutation stack.
   * @return {MutationStack} self, unlocked for writing and updates staged.
   * @memberof MutationStack
   */
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

    this.#unlock();

    this.#stack.forEach((element) => {
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
   * @param {function(MutationData):boolean} filterFn [() => true] Optional function returning a boolean indicating if this
   *                   element should be delete. By default, deletes all elements of the mutation stack.
   * @return {MutationStack} self, unlocked for writing and updates staged.
   * @memberof MutationStack
   */
  deleteAll(filterFn = () => true) {
    this.#unlock();

    this.#stack = this.#stack.filter((element) => !filterFn(element))

    return this;
  }

  /**
   * Updates the owning actor with the mutation stack changes made. Will not commit a locked buffer.
   *
   * @return {Promise<MutationStack>} self, locked for writing
   * @memberof MutationStack
   */
  async commit() {

    if(this.#locked) {
      logger.error(MODULE.localize('error.stackLockedOrEmpty'))
    }

    await this.actor.update({
      flags: {
        [MODULE.data.name]: {
          'mutate': this.#stack
        }
      }
    });

    /* return to a locked read-only state */
    this.#locked = true;
    this.#stack.length = 0;

    return this;
  }

  /**
   * Unlocks the current buffer for writing by copying the mutation stack into this object.
   *
   * @return {boolean} Indicates if the unlock occured. False indicates the buffer was already unlocked.
   * @memberof MutationStack
   */
  #unlock() {

    if (!this.#locked) {
      return false;
    }

    this.#stack = duplicate(this.#liveStack)
    this.#locked = false;
    return true;
  }

}

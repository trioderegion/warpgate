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

import { MODULE } from './module.js'
import { RemoteMutator } from './remote-mutator.js'

/*** MUTATION DATA STRUCTURE ****/
//  delta, (i.e. update object needed to revert this mutation)
//  user: game.user.id,
//  comparisonKeys: options.comparisonKeys ?? {},
//  name: options.name ?? randomID()


export class MutationStack {
  constructor(tokenDoc) {

    this._token = tokenDoc;

    /* Grab the current stack (or make a new one) */
    this._stack = duplicate(tokenDoc.actor.getFlag(MODULE.data.name, 'mutate') ?? []);
  }

  find( predicate ){
    return this._stack.find( predicate );
  }

  getName(name) {
    return this.find( (element) => element.name === name );
  }

  last() {
    return this._stack[this._stack.length - 1]
  }

  update(originalName, mutationInfo, {overwrite = false}){
    const index = this._stack.findIndex( (element) => element.name === originalName );

    if (index < 0) {
      return false;
    }

    if (overwrite) {
      this._stack[index] = mutationInfo;
    } else {
      mergeObject(this._stack[index], mutationInfo);
    }

    return this;
  }

  updateAll( transform, filterFn = () => true ){

    const innerUpdate = (transform) => {
      if(typeof transform === 'function') {
        /* if we are applying a transform function */
        return (element) => mergeObject(element, transform(element)); 
      } else {
        /* if we are applying a constant change */
        return (element) => mergeObject(element, transform);
      }
    }

    this._stack.forEach( (element) => {
      if(filterFn(element)) {
        innerUpdate(transform)(element);
      }
    });

    return this;
  } 

  deleteAll( filterFn = () => true ) {
    this._stack = this._stack.filter( (element) => !filterFn(element) )

    return this;
  }

  async commit() {
    await this._token.actor.update({flags: {[MODULE.data.name] : {'mutate': this._stack } } } );
  } 

}

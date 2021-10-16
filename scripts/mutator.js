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

import {logger} from './logger.js'
import {MODULE} from './module.js'
import {Comms} from './comms.js'

const NAME = "Mutator";

export class Mutator {
  static register() {
    Mutator.defaults();
    Mutator.hooks();
  }

  static defaults(){
    MODULE[NAME] = {
      comparisonKey: 'name'
    }
  }

  static hooks() {
    Hooks.on('preUpdateToken', Mutator._correctActorLink)
  }

  static _correctActorLink(tokenDoc, update) {

    /* if the actorId has been updated AND its being set to null,
     * check if we can patch/fix this warpgate spawn
     */
    if (update.hasOwnProperty('actorId') && update.actorId === null) {
      const sourceActorId = tokenDoc.getFlag(MODULE.data.name, 'sourceActorId') ?? false;
      if (sourceActorId) {
        logger.debug(`Detected spawned token with unowned actor ${sourceActorId}. Correcting token update.`, tokenDoc, update);
        update.actorId = sourceActorId;
      }
    }
  }

  static _parseUpdateShorthand(collection, updates, comparisonKey) {
    let parsedUpdates = Object.keys(updates).map((key) => {
      if (updates[key] === warpgate.CONST.DELETE) return { _id: null };
      const _id = collection.find( element => getProperty(element.data,comparisonKey) === key )?.id ?? null;
      return {
        _id,
        ...updates[key]
      }
    });
    parsedUpdates = parsedUpdates.filter( update => !!update._id);
    return parsedUpdates;
  }

  static _parseDeleteShorthand(collection, updates, comparisonKey) {
    let parsedUpdates = Object.keys(updates).map((key) => {
      if (updates[key] !== warpgate.CONST.DELETE) return null;
      return collection.find( element => getProperty(element.data, comparisonKey) === key )?.id ?? null;
    });

    parsedUpdates = parsedUpdates.filter( update => !!update);
    return parsedUpdates;
  }

  static _parseAddShorthand(collection, updates, comparisonKey){
    let parsedAdds = Object.keys(updates).map((key) => {

      /* ignore deletes */
      if (updates[key] === warpgate.CONST.DELETE) return false;

      /* ignore item updates for items that exist */
      if (collection.find( element => getProperty(element.data, comparisonKey) === key)) return false;
      
      let data = updates[key];
      setProperty(data, comparisonKey, key);
      return data;
    });
    parsedAdds = parsedAdds.filter( update => !!update);
    return parsedAdds;

  }

  static _invertShorthand(collection, updates, comparisonKey){
    let inverted = {};
    Object.keys(updates).forEach( (key) => {
      /* this is a delete */
      if (updates[key] === warpgate.CONST.DELETE) {
        /* find this item currently and copy off its data */ 
        const currentData = collection.find( element => getProperty(element, comparisonKey) === key );
        /* hopefully we found something */
        if(currentData)
          setProperty(inverted, key, currentData.toObject());
        return;
      }

      /* this is an update */
      const foundItem = collection.find( element => getProperty(element, comparisonKey) === key)
      if (foundItem){
        /* grab the current value of any updated fields and store */
        const expandedUpdate = expandObject(updates[key]);
        const sourceData = foundItem.data.toObject();
        const updatedData = mergeObject(sourceData, expandedUpdate, {inplace: false});
        const diff = Mutator._deepDiffMapper().map(sourceData, updatedData)

        setProperty(inverted, updatedData[comparisonKey], diff);
        return;
      }
      
      /* must be an add, so we delete */
      setProperty(inverted, key, warpgate.CONST.DELETE);
      
    });

    return inverted;
  }

  /* run the provided updates for the given embedded collection name from the owner */
  static async _performEmbeddedUpdates(owner, embeddedName, updates, comparisonKey = 'name'){
    
    const collection = owner.getEmbeddedCollection(embeddedName);

    const parsedAdds = Mutator._parseAddShorthand(collection, updates, comparisonKey);
    const parsedUpdates = Mutator._parseUpdateShorthand(collection, updates, comparisonKey); 
    const parsedDeletes = Mutator._parseDeleteShorthand(collection, updates, comparisonKey);

    logger.debug(`Modify embedded ${embeddedName} of ${owner.name} from`, {adds: parsedAdds, updates: parsedUpdates, deletes: parsedDeletes});

    try {
      if (parsedAdds.length > 0) await owner.createEmbeddedDocuments(embeddedName, parsedAdds);
    } catch (e) {
      logger.error(e);
    } 

    try {
      if (parsedUpdates.length > 0) await owner.updateEmbeddedDocuments(embeddedName, parsedUpdates);
    } catch (e) {
      logger.error(e);
    }

    try {
      if (parsedDeletes.length > 0) await owner.deleteEmbeddedDocuments(embeddedName, parsedDeletes);
    } catch (e) {
      logger.error(e);
    }

    return;
  }

  /* embeddedUpdates keyed by embedded name, contains shorthand */
  static async _updateEmbedded(owner, embeddedUpdates, comparisonKeys){

    /* @TODO check for any recursive embeds*/
    if (embeddedUpdates?.embedded) delete embeddedUpdates.embedded;

    for(const embeddedName of Object.keys(embeddedUpdates ?? {})){
      await Mutator._performEmbeddedUpdates(owner, embeddedName, embeddedUpdates[embeddedName],
        comparisonKeys[embeddedName] ?? MODULE[NAME].comparisonKey)
    }

  }

  /* updates the actor and any embedded documents of this actor */
  /* @TODO support embedded documents within embedded documents */
  static async _updateActor(actor, updates = {}, comparisonKeys = {}) {

    logger.debug('Perfoming update on (actor/updates)',actor, updates);
    await warpgate.wait(MODULE.setting('updateDelay')); // @workaround for semaphore bug

    /** perform the updates */
    if (updates.actor) await actor.update(updates.actor);

    await Mutator._updateEmbedded(actor, updates.embedded, comparisonKeys);

    return;
  }


  /* 
   * Given an update argument identical to `warpgate.spawn` and a token document, will apply the changes listed in the updates and (by default) store the change delta, which allows these updates to be reverted.  Mutating the same token multiple times will "stack" the delta changes, allowing the user to remove them one-by-one in opposite order of application (last in, first out).
   *
   * @param {TokenDocument} tokenDoc
   *
   * @param {Object = {}} updates. As `warpgate.spawn`.
   *
   * @param {Object = {}} callbacks. Two provided callback locations: delta and post. Both are awaited.
   *   delta {Function(delta, tokenDoc)} Called after the update delta has been generated, but before it is stored on the actor. Can be used to modify this delta for storage (ex. Current and Max HP are increased by 10, but when reverted, you want to keep the extra Current HP applied. Update the delta object with the desired HP to return to after revert, or remove it entirely.
   *     @param {Object} delta. Computed change of the actor based on `updates`.
   *     @param {TokenDocument} tokenDoc. Token being modified.
   *   post {Function(tokenDoc, updates)} Called after the actor has been mutated and after the mutate event has triggered. Useful for animations or changes that should not be tracked by the mutation system.
   *     @param {TokenDocument} tokenDoc. Token that has been modified.
   *     @param {Object} updates. See parent `updates` parameter.
   *
   * @param {Object = {}} options
   *   comparisonKeys: {Object = {}}. string-string key-value pairs indicating which field to use for comparisons for each needed embeddedDocument type. Ex. From dnd5e: {'ActiveEffect' : 'label'}
   *   permanent: {Boolean = false}. Indicates if this should be treated as a permanent change to the actor, which does not store the update delta information required to revert mutation.
   *   name: {String = randomId()}. User provided name, or identifier, for this particular mutation operation. Used for 'named revert'.
   *
   * @return {Promise<Object>} The change produced by the provided updates, if they are tracked (i.e. not permanent).
   */
  static async mutate(tokenDoc, updates = {}, callbacks = {}, options = {}) {
    
    /* if this is not a permanent mutation, create the delta and store it */
    let delta = {}
    if(!options.permanent) {
      delta = Mutator._createDelta(tokenDoc, updates);

      /* allow user to modify delta if needed */
      if (callbacks.delta) await callbacks.delta(delta, tokenDoc);
      
      Mutator._mergeMutateDelta(tokenDoc.actor, delta, updates, options);
    }
  
    /* prepare the event data *before* the token is modified */
    const actorData = Comms.packToken(tokenDoc);

    await Mutator._update(tokenDoc, updates, options);

    await warpgate.event.notify(warpgate.EVENT.MUTATE, {actorData, updates});

    if(callbacks.post) await callbacks.post(tokenDoc, updates);

    return delta;
  }

  static _mergeMutateDelta(actorDoc, delta, updates, options) {

    let mutateStack = actorDoc.getFlag(MODULE.data.name, 'mutate') ?? [];
    mutateStack.push({delta, user: game.user.id, comparisonKeys: options.comparisonKeys ?? {}, name: options.name ?? randomID()});

    const flags = {warpgate: {mutate: mutateStack}};
    updates.actor = mergeObject(updates.actor ?? {}, {flags});

  }

  /* @return {Promise} */
  static async _update(tokenDoc, updates, options = {}) {
    /* update the token */
    await tokenDoc.update(updates.token ?? {});

    /* update the actor */
    return Mutator._updateActor(tokenDoc.actor, updates, options.comparisonKeys ?? {});
  }

  /* Will peel off the last applied mutation change from the provided token document
   * 
   * @param {TokenDocument} tokenDoc. Token document to revert the last applied mutation.
   *
   * @return {Promise<Object>} The mutation data (updates) used for this revert operation
   */
  static async revertMutation(tokenDoc, mutationName = undefined) {

    const mutateData = await Mutator._popMutation(tokenDoc?.actor, mutationName);

    if (!!mutateData) {

      const actorData = Comms.packToken(tokenDoc);

      /* perform the revert with the stored delta */
      await Mutator._update(tokenDoc, mutateData.delta, {comparisonKeys: mutateData.comparisonKeys});

      /* notify clients */
      await warpgate.event.notify(warpgate.EVENT.REVERT, {actorData, updates: mutateData});
      return mutateData;
    }

    return false;
  }

  static async _popMutation(actor, mutationName) {

    let mutateStack = actor?.getFlag(MODULE.data.name, 'mutate');

    if (!mutateStack || !actor){
      logger.debug(`Could not pop mutation named ${mutationName} from actor ${actor?.name}`);
      return undefined;
    }

    let mutateData = undefined;

    if (!!mutationName) {
      /* find specific mutation */
      const index = mutateStack.findIndex( mutation => mutation.name === mutationName );

      /* check for no result and error */
      if ( index < 0 ) {
        logger.error(`Could not locate mutation named ${mutationName} in actor ${actor.name}`);
        return undefined;
      }

      /* otherwise, retrieve and remove */
      mutateData = mutateStack.splice(index, 1)[0];

    } else {
      /* pop the most recent mutation */
      mutateData = mutateStack?.pop();
    }

    /* if there are no mutations left on the stack, remove our flag data
     * otherwise, store the remaining mutations */
    if (mutateStack.length == 0) {
      await actor.unsetFlag(MODULE.data.name, 'mutate');
    } else {
      await actor.setFlag(MODULE.data.name, 'mutate', mutateStack);
    }

    return mutateData;
  }

  /* given a token document and the standard update object,
   * parse the changes that need to be applied to *reverse*
   * the mutate operation
   */
  static _createDelta(tokenDoc, updates) {

    /* get token changes */
    let tokenData = tokenDoc.data.toObject()
    delete tokenData.actorData;

    const updatedToken = mergeObject(tokenData, updates.token, {inplace:false});
    const tokenDelta = Mutator._deepDiffMapper().map(tokenData, updatedToken);

    /* get the actor changes (no embeds) */
    const actorData = Mutator._getRootActorData(tokenDoc.actor);

    const updatedActor = mergeObject(actorData, updates.actor, {inplace:false});
    const actorDelta = Mutator._deepDiffMapper().map(actorData, updatedActor);

    /* get the changes from the embeds */
    let embeddedDelta = {};
    if(updates.embedded) {
      
      for( const embeddedName of Object.keys(updates.embedded) ) {
        const collection = tokenDoc.actor.getEmbeddedCollection(embeddedName);
        const invertedShorthand = Mutator._invertShorthand(collection, updates.embedded[embeddedName], updates.embedded[embeddedName].comparisonKey ?? 'name');
        embeddedDelta[embeddedName] = invertedShorthand;
      }
    }

    logger.debug('Token Delta', tokenDelta, 'Actor Delta', actorDelta, 'Embedded Delta', embeddedDelta);

    return {token: tokenDelta, actor: actorDelta, embedded: embeddedDelta}
  }

  /* returns the actor data sans ALL embedded collections */
  static _getRootActorData(actorDoc) {
    let actorData = actorDoc.data.toObject();

    /* get the key NAME of the embedded document type.
     * ex. not 'ActiveEffect' (the class name), 'effect' the collection's field name
     */
    const embeddedFields = Object.values(Actor.implementation.metadata.embedded).map( thisClass => thisClass.metadata.collection );

    /* delete any embedded fields from the actor data */
    embeddedFields.forEach( field => { delete actorData[field] } )

    /* do not delta our own delta flags */
    //if (actorData.flags?.warpgate) delete actorData.flags.warpgate

    return actorData;
  }

  static _deepDiffMapper() {
    return {
      VALUE_CREATED: 'created',
      VALUE_UPDATED: 'updated',
      VALUE_DELETED: 'deleted',
      VALUE_UNCHANGED: 'unchanged',
      map: function (obj1, obj2) {

        if (this.isFunction(obj1) || this.isFunction(obj2)) {
          throw 'Invalid argument. Function given, object expected.';
        }

        if (this.isValue(obj1) || this.isValue(obj2)) {
          const type = this.compareValues(obj1, obj2);
          if (type !== this.VALUE_UNCHANGED){
            //return {
            //  type,
            //  data: obj1 === undefined ? obj2 : obj1
            //};
            return (obj1 === undefined) ? obj2 : obj1;
          } else {
            return undefined;
          }
        }

        let diff = {};

        /* check for changes or deletions from obj1 to obj2 */
        for (let key in obj1) {
          if (this.isFunction(obj1[key])) {
            continue;
          }

          let value2 = undefined;
          if (obj2[key] !== undefined) {
            value2 = obj2[key];
          }
          const result = this.map(obj1[key], value2);
          if (!jQuery.isEmptyObject(result)) diff[key] = result;
        }

        /* now check for additions in obj2 */
        for (let key in obj2) {

          /* do not diff if a function OR if this key was present
           * in obj1 (which means it was diffed for update/delete)
           */
          if (this.isFunction(obj2[key]) || obj1[key] !== undefined) {
            continue;
          }
          const result = this.map(undefined, obj2[key]);
          if (!jQuery.isEmptyObject(result)) diff[key] = result
        }

        return diff;

      },
      compareValues: function (value1, value2) {
        if (value1 === value2) {
          return this.VALUE_UNCHANGED;
        }
        if (this.isDate(value1) && this.isDate(value2) && value1.getTime() === value2.getTime()) {
          return this.VALUE_UNCHANGED;
        }
        if (value1 === undefined) {
          return this.VALUE_CREATED;
        }
        if (value2 === undefined) {
          return this.VALUE_DELETED;
        }
        return this.VALUE_UPDATED;
      },
      isFunction: function (x) {
        return Object.prototype.toString.call(x) === '[object Function]';
      },
      isArray: function (x) {
        return Object.prototype.toString.call(x) === '[object Array]';
      },
      isDate: function (x) {
        return Object.prototype.toString.call(x) === '[object Date]';
      },
      isObject: function (x) {
        return Object.prototype.toString.call(x) === '[object Object]';
      },
      isValue: function (x) {
        /* mmh: we are going to treat ANYTHING that is
         * not an object as the 'final' value to use.
         * We do not want to deep diff array values.
         */
        return !this.isObject(x) /*&& !this.isArray(x)*/;
      }
    }
  }
}

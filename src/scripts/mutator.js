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

import {MODULE, logger} from './module.js'
import {remoteMutate, remoteRevert, remoteBatchMutate, remoteBatchRevert} from './remote-mutator.js'

/** @ignore */
const NAME = "Mutator";

/** @typedef {import('./api.js').ComparisonKeys} ComparisonKeys */
/** @typedef {import('./api.js').NoticeConfig} NoticeConfig */
/** @typedef {import('./mutation-stack.js').MutationData} MutationData */
/** @typedef {import('./api.js').Shorthand} Shorthand */
/** @typedef {import('./api.js').SpawningOptions} SpawningOptions */

//TODO proper objects
/** @typedef {Object} MutateInfo
 *  @ignore
 */

/**
 * Workflow options
 * @typedef {Object} WorkflowOptions
 * @property {Shorthand} [updateOpts] Options for the creation/deletion/updating of (embedded) documents related to this mutation 
 * @property {string} [description] Description of this mutation for potential display to the remote owning user.
 * @property {NoticeConfig} [notice] Options for placing a ping or panning to the token after mutation
 * @property {boolean} [noMoveWait = false] If true, will not wait for potential token movement animation to complete before proceeding with remaining actor/embedded updates.
 * @property {Object} [overrides]
 * @property {boolean} [overrides.alwaysAccept = false] Force the receiving clients "auto-accept" state,
 *  regardless of world/client settings
 * @property {boolean} [overrides.suppressToast = false] Force the initiating and receiving clients to suppress
 *  the "call and response" UI toasts indicating the requests accepted/rejected response.
 * @property {boolean} [overrides.includeRawData = false] Force events produced from this operation to include the 
 *  raw data used for its operation (such as the final mutation data to be applied, or the resulting packed actor 
 *  data from a spawn). **Caution, use judiciously** -- enabling this option can result in potentially large
 *  socket data transfers during warpgate operation.
 * @property {boolean} [overrides.preserveData = false] If enabled, the provided updates data object will
 *  be modified in-place as needed for internal Warp Gate operations and will NOT be re-usable for a
 *  subsequent operation. Otherwise, the provided data is copied and modified internally, preserving
 *  the original input for subsequent re-use.
 *
 */

/**
 *
 * @typedef {Object} MutationOptions
 * @property {boolean} [permanent=false] Indicates if this should be treated as a permanent change
 *  to the actor, which does not store the update delta information required to revert mutation.
 * @property {string} [name=randomId()] User provided name, or identifier, for this particular
 *  mutation operation. Used for reverting mutations by name, as opposed to popping last applied.
 * @property {Object} [delta]
 * @property {ComparisonKeys} [comparisonKeys]
 */

/**
 * The post delta creation, pre mutate callback. Called after the update delta has been generated, but before 
 * it is stored on the actor. Can be used to modify this delta for storage (ex. Current and Max HP are
 * increased by 10, but when reverted, you want to keep the extra Current HP applied. Update the delta object
 * with the desired HP to return to after revert, or remove it entirely.
 *
 * @typedef {(function(Shorthand,TokenDocument):Promise|undefined)} PostDelta
 * @param {Shorthand} delta Computed change of the actor based on `updates`. Used to "unroll" this mutation when reverted.
 * @param {TokenDocument} tokenDoc Token being modified.
 *
 * @returns {Promise<any>|any}
 */

/**
 * The post mutate callback prototype. Called after the actor has been mutated and after the mutate event
 * has triggered. Useful for animations or changes that should not be tracked by the mutation system.
 *
 * @typedef {function(TokenDocument, Object, boolean):Promise|void} PostMutate
 * @param {TokenDocument} tokenDoc Token that has been modified.
 * @param {Shorthand} updates Current permutation of the original shorthand updates object provided, as
 *  applied for this mutation
 * @param {boolean} accepted Whether or not the mutation was accepted by the first owner.
 *
 * @returns {Promise<any>|any}
 */

class Mutator {
  static register() {
    Mutator.defaults();
  }

  static defaults(){
    MODULE[NAME] = {
      comparisonKey: 'name'
    }
  }

  static #idByQuery( list, key, comparisonPath ) {
    const id = this.#findByQuery(list, key, comparisonPath)?.id ?? null;

    return id;
  }

  static #findByQuery( list, key, comparisonPath ) {
    return list.find( element => getProperty(element, comparisonPath) === key )
  }

  //TODO change to reduce
  static _parseUpdateShorthand(collection, updates, comparisonKey) {
    let parsedUpdates = Object.keys(updates).map((key) => {
      if (updates[key] === warpgate.CONST.DELETE) return { _id: null };
      const _id = this.#idByQuery(collection, key, comparisonKey )
      return {
        ...updates[key],
        _id,
      }
    });
    parsedUpdates = parsedUpdates.filter( update => !!update._id);
    return parsedUpdates;
  }

  //TODO change to reduce
  static _parseDeleteShorthand(collection, updates, comparisonKey) {
    let parsedUpdates = Object.keys(updates).map((key) => {
      if (updates[key] !== warpgate.CONST.DELETE) return null;
      return this.#idByQuery(collection, key, comparisonKey);
    });

    parsedUpdates = parsedUpdates.filter( update => !!update);
    return parsedUpdates;
  }

  static _parseAddShorthand(collection, updates, comparisonKey){

    let parsedAdds = Object.keys(updates).reduce((acc, key) => {

      /* ignore deletes */
      if (updates[key] === warpgate.CONST.DELETE) return acc;

      /* ignore item updates for items that exist */
      if (this.#idByQuery(collection, key, comparisonKey)) return acc;
      
      let data = updates[key];
      setProperty(data, comparisonKey, key);
      acc.push(data);
      return acc;
    },[]);

    return parsedAdds;

  }

  static _invertShorthand(collection, updates, comparisonKey){
    let inverted = {};
    Object.keys(updates).forEach( (key) => {

      /* find this item currently and copy off its data */ 
      const currentData = this.#findByQuery(collection, key, comparisonKey);

      /* this is a delete */
      if (updates[key] === warpgate.CONST.DELETE) {

        /* hopefully we found something */
        if(currentData) setProperty(inverted, key, currentData.toObject());
        else logger.debug('Delta Creation: Could not locate shorthand identified document for deletion.', collection, key, updates[key]);

        return;
      }

      /* this is an update */
      if (currentData){
        /* grab the current value of any updated fields and store */
        const expandedUpdate = expandObject(updates[key]);
        const sourceData = currentData.toObject();
        const updatedData = mergeObject(sourceData, expandedUpdate, {inplace: false});

        const diff = MODULE.strictUpdateDiff(updatedData, sourceData);
        
        setProperty(inverted, updatedData[comparisonKey], diff);
        return;
      }
      
      /* must be an add, so we delete */
      setProperty(inverted, key, warpgate.CONST.DELETE);
      
    });

    return inverted;
  }

  

  static _errorCheckEmbeddedUpdates( embeddedName, updates ) {

    /* at the moment, the most pressing error is an Item creation without a 'type' field.
     * This typically indicates a failed lookup for an update operation
     */
    if( embeddedName == 'Item'){
      const badItemAdd = (updates.add ?? []).find( add => !add.type );

      if (badItemAdd) {
        logger.info(badItemAdd);
        const message = MODULE.format('error.badMutate.missing.type', {embeddedName});

        return {error: true, message}
      }
    }

    return {error:false};
  }

  /* run the provided updates for the given embedded collection name from the owner */
  static async _performEmbeddedUpdates(owner, embeddedName, updates, comparisonKey = 'name', updateOpts = {}){
    
    const collection = owner.getEmbeddedCollection(embeddedName);

    const parsedAdds = Mutator._parseAddShorthand(collection, updates, comparisonKey);
    const parsedUpdates = Mutator._parseUpdateShorthand(collection, updates, comparisonKey); 
    const parsedDeletes = Mutator._parseDeleteShorthand(collection, updates, comparisonKey);

    logger.debug(`Modify embedded ${embeddedName} of ${owner.name} from`, {adds: parsedAdds, updates: parsedUpdates, deletes: parsedDeletes});

    const {error, message} = Mutator._errorCheckEmbeddedUpdates( embeddedName, {add: parsedAdds, update: parsedUpdates, delete: parsedDeletes} );
    if(error) {
      logger.error(message);
      return false;
    }

    try {
      if (parsedAdds.length > 0) await owner.createEmbeddedDocuments(embeddedName, parsedAdds, updateOpts);
    } catch (e) {
      logger.error(e);
    } 

    try {
      if (parsedUpdates.length > 0) await owner.updateEmbeddedDocuments(embeddedName, parsedUpdates, updateOpts);
    } catch (e) {
      logger.error(e);
    }

    try {
      if (parsedDeletes.length > 0) await owner.deleteEmbeddedDocuments(embeddedName, parsedDeletes, updateOpts);
    } catch (e) {
      logger.error(e);
    }

    return true;
  }

  /* embeddedUpdates keyed by embedded name, contains shorthand */
  static async _updateEmbedded(owner, embeddedUpdates, comparisonKeys, updateOpts = {}){

    /* @TODO check for any recursive embeds*/
    if (embeddedUpdates?.embedded) delete embeddedUpdates.embedded;

    for(const embeddedName of Object.keys(embeddedUpdates ?? {})){
      await Mutator._performEmbeddedUpdates(owner, embeddedName, embeddedUpdates[embeddedName],
        comparisonKeys[embeddedName] ?? MODULE[NAME].comparisonKey,
        updateOpts[embeddedName] ?? {})
    }

  }

  /* updates the actor and any embedded documents of this actor */
  /* @TODO support embedded documents within embedded documents */
  static async _updateActor(actor, updates = {}, comparisonKeys = {}, updateOpts = {}) {

    logger.debug('Performing update on (actor/updates)',actor, updates, comparisonKeys, updateOpts);
    await warpgate.wait(MODULE.setting('updateDelay')); // @workaround for semaphore bug

    /** perform the updates */
    if (updates.actor) await actor.update(updates.actor, updateOpts.actor ?? {});

    await Mutator._updateEmbedded(actor, updates.embedded, comparisonKeys, updateOpts.embedded);

    return;
  }

  
   /**
   * Given an update argument identical to `warpgate.spawn` and a token document, will apply the changes listed
   * in the updates and (by default) store the change delta, which allows these updates to be reverted.  Mutating 
   * the same token multiple times will "stack" the delta changes, allowing the user to remove them as desired,
   * while preserving changes made "higher" in the stack.
   *
   * @param {TokenDocument} tokenDoc Token document to update, does not accept Token Placeable.
   * @param {Shorthand} [updates] As {@link warpgate.spawn}
   * @param {Object} [callbacks] Two provided callback locations: delta and post. Both are awaited.
   * @param {PostDelta} [callbacks.delta] 
   * @param {PostMutate} [callbacks.post] 
   * @param {WorkflowOptions & MutationOptions} [options]
   *
   * @return {Promise<MutationData|false>} The mutation stack entry produced by this mutation, if they are tracked (i.e. not permanent).
   */
  static async mutate(tokenDoc, updates = {}, callbacks = {}, options = {}) {
    
    const neededPerms = MODULE.canMutate(game.user)
    if(neededPerms.length > 0) {
      logger.warn(MODULE.format('error.missingPerms', {permList: neededPerms.join(', ')}));
      return false;
    }

    /* the provided update object will be mangled for our use -- copy it to
     * preserve the user's original input if requested (default).
     */
    if(!options.overrides?.preserveData) {
      updates = MODULE.copy(updates, 'error.badUpdate.complex');
      if(!updates) return false;
      options = foundry.utils.mergeObject(options, {overrides: {preserveData: true}}, {inplace: false});
    }

    /* ensure that we are working with clean data */
    await Mutator.clean(updates, options);

    /* providing a delta means you are managing the
     * entire data change (including mutation stack changes).
     * Typically used by remote requests */

    /* create a default mutation info assuming we were provided
     * with the final delta already or the change is permanent
     */
    let mutateInfo = Mutator._createMutateInfo( options.delta ?? {}, options );

    /* check that this mutation name is unique */
    const present = warpgate.mutationStack(tokenDoc).getName(mutateInfo.name);
    if(!!present) {
      logger.warn(MODULE.format('error.badMutate.duplicate', {name: mutateInfo.name}));
      return false;
    }

    /* ensure the options parameter has a name field if not provided */
    options.name = mutateInfo.name;

    /* expand the object to handle property paths correctly */
    MODULE.shimUpdate(updates);

    /* permanent changes are not tracked */
    if(!options.permanent) {

      /* if we have the delta provided, trust it */
      let delta = options.delta ?? Mutator._createDelta(tokenDoc, updates, options);

      /* allow user to modify delta if needed (remote updates will never have callbacks) */
      if (callbacks.delta) {

        const cont = await callbacks.delta(delta, tokenDoc);
        if(cont === false) return false;

      }

      /* update the mutation info with the final updates including mutate stack info */
      mutateInfo = Mutator._mergeMutateDelta(tokenDoc.actor, delta, updates, options);

      options.delta = mutateInfo.delta;

    } else if (callbacks.delta) {
      /* call the delta callback if provided, but there is no object to modify */
      const cont = await callbacks.delta({}, tokenDoc);
      if(cont === false) return false;
    }

    if (tokenDoc.actor.isOwner) {

      if(options.notice && tokenDoc.object) {

        const placement = {
          scene: tokenDoc.object.scene,
          ...tokenDoc.object.center,
        };

        warpgate.plugin.notice(placement, options.notice);
      }
      
      await Mutator._update(tokenDoc, updates, options);

      if(callbacks.post) await callbacks.post(tokenDoc, updates, true);

      await warpgate.event.notify(warpgate.EVENT.MUTATE, {
        uuid: tokenDoc.uuid, 
        name: options.name,
        updates: (options.overrides?.includeRawData ?? false) ? updates : 'omitted',
        options
      });

    } else {
      /* this is a remote mutation request, hand it over to that system */
      return remoteMutate( tokenDoc, {updates, callbacks, options} );
    }

    return mutateInfo;
  }

  /**
   * Perform a managed, batch update of multple token documents. Heterogeneous ownership supported
   * and routed through the Remote Mutation system as needed. The same updates, callbacks and options
   * objects will be used for all mutations.
   *
   * Note: If a specific mutation name is not provided, a single random ID will be generated for all
   * resulting individual mutations.
   *
   * @static
   * @param {Array<TokenDocument>} tokenDocs List of tokens on which to apply the provided mutation.
   * @param {Object} details The details of this batch mutation operation.
   * @param {Shorthand} details.updates The updates to apply to each token; as {@link warpgate.spawn}
   * @param {Object} [details.callbacks] Delta and post mutation callbacks; as {@link warpgate.mutate}
   * @param {PostDelta} [details.callbacks.delta]
   * @param {PostMutate} [details.callbacks.post]
   * @param {WorkflowOptions & MutationOptions} [details.options]
   *
   * @returns {Promise<Array<MutateInfo>>} List of mutation results, which resolve 
   *   once all local mutations have been applied and when all remote mutations have been _accepted_ 
   *   or _rejected_. Currently, local and remote mutations will contain differing object structures.
   *   Notably, local mutations contain a `delta` field containing the revert data for
   *   this mutation; whereas remote mutations will contain an `accepted` field,
   *   indicating if the request was accepted.
   */
  static async batchMutate( tokenDocs, {updates, callbacks, options} ) {
    
    /* break token list into sublists by first owner */
    const tokenLists = MODULE.ownerSublist(tokenDocs);

    if((tokenLists['none'] ?? []).length > 0) {
      logger.warn(MODULE.localize('error.offlineOwnerBatch'));
      logger.debug('Affected UUIDs:', tokenLists['none'].map( t => t.uuid ));
      delete tokenLists['none'];
    }

    options.name ??= randomID();

    let promises = Reflect.ownKeys(tokenLists).flatMap( async (owner) => {
      if(owner == game.userId) {
        //self service mutate
        return await tokenLists[owner].map( tokenDoc => warpgate.mutate(tokenDoc, updates, callbacks, options) );
      }

      /* is a remote update */
      return await remoteBatchMutate( tokenLists[owner], {updates, callbacks, options} );

    })

    /* wait for each client batch of mutations to complete */
    promises = await Promise.all(promises);

    /* flatten all into a single array, and ensure all subqueries are complete */
    return Promise.all(promises.flat());
  }

  /**
   * Perform a managed, batch update of multple token documents. Heterogeneous ownership supported
   * and routed through the Remote Mutation system as needed. The same updates, callbacks and options
   * objects will be used for all mutations.
   *
   * Note: If a specific mutation name is not provided, a single random ID will be generated for all
   * resulting individual mutations.
   *
   * @static
   * @param {Array<TokenDocument>} tokenDocs List of tokens on which to perform the revert
   * @param {Object} details
   * @param {string} [details.mutationName] Specific mutation name to revert, or the latest mutation 
   *   for an individual token if not provided. Tokens without mutations or without the specific 
   *   mutation requested are not processed.
   * @param {WorkflowOptions & MutationOptions} [details.options]
   * @returns {Promise<Array<MutateInfo>>} List of mutation revert results, which resolve 
   *   once all local reverts have been applied and when all remote reverts have been _accepted_ 
   *   or _rejected_. Currently, local and remote reverts will contain differing object structures.
   *   Notably, local revert contain a `delta` field containing the revert data for
   *   this mutation; whereas remote reverts will contain an `accepted` field,
   *   indicating if the request was accepted.

   */
  static async batchRevert( tokenDocs, {mutationName = null, options = {}} = {} ) {
    
    const tokenLists = MODULE.ownerSublist(tokenDocs);

    if((tokenLists['none'] ?? []).length > 0) {
      logger.warn(MODULE.localize('error.offlineOwnerBatch'));
      logger.debug('Affected UUIDs:', tokenLists['none'].map( t => t.uuid ));
      delete tokenLists['none'];
    }

    let promises = Reflect.ownKeys(tokenLists).map( (owner) => {
      if(owner == game.userId) {
        //self service mutate
        return tokenLists[owner].map( tokenDoc => warpgate.revert(tokenDoc, mutationName, options) );
      }

      /* is a remote update */
      return remoteBatchRevert( tokenLists[owner], {mutationName, options} );

    })

    promises = await Promise.all(promises);

    return Promise.all(promises.flat());
  }

  /**
   * @returns {MutationData}
   */
  static _createMutateInfo( delta, options = {} ) {
    options.name ??= randomID();
    return {
      delta: MODULE.stripEmpty(delta),
      user: game.user.id,
      comparisonKeys: MODULE.stripEmpty(options.comparisonKeys ?? {}, false),
      name: options.name,
      updateOpts: MODULE.stripEmpty(options.updateOpts ?? {}, false),
      overrides: MODULE.stripEmpty(options.overrides ?? {}, false),
    };
  }

  static _cleanInner(single) {
    Object.keys(single).forEach( key => {
      /* dont process embedded */
      if(key == 'embedded') return;

      /* dont process delete identifiers */
      if(typeof single[key] == 'string') return;

      /* convert value to plain object if possible */
      if(single[key]?.toObject) single[key] = single[key].toObject();

      if(single[key] == undefined) {
        single[key] = {};
      } 

      return;
    });
  }

  /**
   * Cleans and validates mutation data
   * @param {Shorthand} updates
   * @param {SpawningOptions & MutationOptions} [options]
   */
  static async clean(updates, options = undefined) {

    if(!!updates) {
      /* ensure we are working with raw objects */
      Mutator._cleanInner(updates);

      /* perform cleaning on shorthand embedded updates */
      Object.values(updates.embedded ?? {}).forEach( type => Mutator._cleanInner(type));

      /* if the token is getting an image update, preload it */
      let source;
      if('src' in (updates.token?.texture ?? {})) {
        source = updates.token.texture.src; 
      }
      else if( 'img' in (updates.token ?? {})){
        source = updates.token.img;
      }

      /* load texture if provided */
      try {
        !!source ? await loadTexture(source) : null;
      } catch (err) {
        logger.debug(err);
      }
    }

    if(!!options) {
      /* insert the better ActiveEffect default ONLY IF
       * one wasn't provided in the options object initially
       */
      options.comparisonKeys = foundry.utils.mergeObject(
        options.comparisonKeys ?? {},
        {ActiveEffect: 'label'},
        {overwrite:false, inplace:false});

      /* if `id` is being used as the comparison key, 
       * change it to `_id` and set the option to `keepId=true`
       * if either are present
       */
      options.comparisonKeys ??= {};
      options.updateOpts ??= {};
      Object.keys(options.comparisonKeys).forEach( embName => {

        /* switch to _id if needed */
        if(options.comparisonKeys[embName] == 'id') options.comparisonKeys[embName] = '_id'

        /* flag this update to preserve ids */
        if(options.comparisonKeys[embName] == '_id') {
          foundry.utils.mergeObject(options.updateOpts, {embedded: {[embName]: {keepId: true}}});
        }
      });
      
    }

  }

  static _mergeMutateDelta(actorDoc, delta, updates, options) {

    /* Grab the current stack (or make a new one) */
    let mutateStack = actorDoc.getFlag(MODULE.data.name, 'mutate') ?? [];

    /* create the information needed to revert this mutation and push
     * it onto the stack
     */
    const mutateInfo = Mutator._createMutateInfo( delta, options );
    mutateStack.push(mutateInfo);

    /* Create a new mutation stack flag data and store it in the update object */
    const flags = {warpgate: {mutate: mutateStack}};
    updates.actor = mergeObject(updates.actor ?? {}, {flags});
    
    return mutateInfo;
  }

  /* @return {Promise} */
  static async _update(tokenDoc, updates, options = {}) {

    /* update the token */
    await tokenDoc.update(updates.token ?? {}, options.updateOpts?.token ?? {});

    if(!options.noMoveWait && !!tokenDoc.object) {
      await CanvasAnimation.getAnimation(tokenDoc.object.animationName)?.promise
    }

    /* update the actor */
    return Mutator._updateActor(tokenDoc.actor, updates, options.comparisonKeys ?? {}, options.updateOpts ?? {});
  }

  /**
   * Will peel off the last applied mutation change from the provided token document
   * 
   * @param {TokenDocument} tokenDoc Token document to revert the last applied mutation.
   * @param {String} [mutationName]. Specific mutation name to revert. optional.
   * @param {WorkflowOptions} [options]
   *
   * @return {Promise<MutationData|undefined>} The mutation data (updates) used for this 
   *  revert operation or `undefined` if none occured.
   */
  static async revertMutation(tokenDoc, mutationName = undefined, options = {}) {

    const mutateData = await Mutator._popMutation(tokenDoc?.actor, mutationName);

    if(!mutateData) {
      return;
    }

    if (tokenDoc.actor?.isOwner) {
      if(options.notice && tokenDoc.object) {

        const placement = {
          scene: tokenDoc.object.scene,
          ...tokenDoc.object.center,
        };

        warpgate.plugin.notice(placement, options.notice);
      }

      /* the provided options object will be mangled for our use -- copy it to
       * preserve the user's original input if requested (default).
       */
      if(!options.overrides?.preserveData) {
        options = MODULE.copy(options, 'error.badUpdate.complex');
        if(!options) return;
        options = foundry.utils.mergeObject(options, {overrides: {preserveData: true}}, {inplace: false});
      }

      /* perform the revert with the stored delta */
      MODULE.shimUpdate(mutateData.delta);
      mutateData.updateOpts ??= {};
      mutateData.overrides ??= {};
      foundry.utils.mergeObject(mutateData.updateOpts, options.updateOpts ?? {});
      foundry.utils.mergeObject(mutateData.overrides, options.overrides ?? {});

      await Mutator._update(tokenDoc, mutateData.delta, {
        overrides: mutateData.overrides,
        comparisonKeys: mutateData.comparisonKeys,
        updateOpts: mutateData.updateOpts
      });

      /* notify clients */
      warpgate.event.notify(warpgate.EVENT.REVERT, {
        uuid: tokenDoc.uuid, 
        name: mutateData.name,
        updates: (options.overrides?.includeRawData ?? false) ? mutateData : 'omitted',
        options});

    } else {
      return remoteRevert(tokenDoc, {mutationId: mutateData.name, options});
    }

    return mutateData;
  }

  static async _popMutation(actor, mutationName) {

    let mutateStack = actor?.getFlag(MODULE.data.name, 'mutate') ?? [];

    if (mutateStack.length == 0 || !actor){
      logger.debug(`Provided actor is undefined or has no mutation stack. Cannot pop.`);
      return undefined;
    }

    let mutateData = undefined;

    if (!!mutationName) {
      /* find specific mutation */
      const index = mutateStack.findIndex( mutation => mutation.name === mutationName );

      /* check for no result and log */
      if ( index < 0 ) {
        logger.debug(`Could not locate mutation named ${mutationName} in actor ${actor.name}`);
        return undefined;
      }

      /* otherwise, retrieve and remove */
      mutateData = mutateStack.splice(index, 1)[0];

      for( let i = index; i < mutateStack.length; i++){

        /* get the values stored in our delta and push any overlapping ones to
         * the mutation next in the stack
         */
        const stackUpdate = filterObject(mutateData.delta, mutateStack[i].delta);
        mergeObject(mutateStack[i].delta, stackUpdate);

        /* remove any changes that exist higher in the stack, we have
         * been overriden and should not restore these values
         */
        mutateData.delta = MODULE.unique(mutateData.delta, mutateStack[i].delta)
      }

    } else {
      /* pop the most recent mutation */
      mutateData = mutateStack.pop();
    }

    const newFlags = {[`${MODULE.data.name}.mutate`]: mutateStack};

    /* set the current mutation stack in the mutation data */
    foundry.utils.mergeObject(mutateData.delta, {actor: {flags: newFlags}});

    logger.debug(MODULE.localize('debug.finalRevertUpdate'), mutateData);

    return mutateData;
  }

  /* given a token document and the standard update object,
   * parse the changes that need to be applied to *reverse*
   * the mutate operation
   */
  static _createDelta(tokenDoc, updates, options) {

    /* get token changes */
    let tokenData = tokenDoc.toObject()
    //tokenData.actorData = {};
    
    const tokenDelta = MODULE.strictUpdateDiff(updates.token ?? {}, tokenData);

    /* get the actor changes (no embeds) */
    const actorData = Mutator._getRootActorData(tokenDoc.actor);
    const actorDelta = MODULE.strictUpdateDiff(updates.actor ?? {}, actorData);

    /* get the changes from the embeds */
    let embeddedDelta = {};
    if(updates.embedded) {
      
      for( const embeddedName of Object.keys(updates.embedded) ) {
        const collection = tokenDoc.actor.getEmbeddedCollection(embeddedName);
        const invertedShorthand = Mutator._invertShorthand(collection, updates.embedded[embeddedName], getProperty(options.comparisonKeys, embeddedName) ?? 'name');
        embeddedDelta[embeddedName] = invertedShorthand;
      }
    }

    logger.debug(MODULE.localize('debug.tokenDelta'), tokenDelta, MODULE.localize('debug.actorDelta'), actorDelta, MODULE.localize('debug.embeddedDelta'), embeddedDelta);

    return {token: tokenDelta, actor: actorDelta, embedded: embeddedDelta}
  }

  /* returns the actor data sans ALL embedded collections */
  static _getRootActorData(actorDoc) {
    let actorData = actorDoc.toObject();

    /* get the key NAME of the embedded document type.
     * ex. not 'ActiveEffect' (the class name), 'effect' the collection's field name
     */
    let embeddedFields = Object.values(Actor.implementation.metadata.embedded);

    /* delete any embedded fields from the actor data */
    embeddedFields.forEach( field => { delete actorData[field] } )

    return actorData;
  }
}

export const register = Mutator.register, mutate = Mutator.mutate, revertMutation = Mutator.revertMutation, batchMutate = Mutator.batchMutate, batchRevert = Mutator.batchRevert, clean = Mutator.clean, _updateActor = Mutator._updateActor, _createDelta = Mutator._createDelta;

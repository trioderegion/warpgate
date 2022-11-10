
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

import { logger } from './logger.js'

import { Gateway } from './gateway.js'
import { Mutator } from './mutator.js'
import { MODULE } from './module.js'
import { Comms } from './comms.js'
import { Events } from './events.js'
import { queueUpdate } from './update-queue.js'
import { Crosshairs } from './crosshairs.js'
import { MutationStack } from './mutation-stack.js'

/**
 * string-string key-value pairs indicating which field to use for comparisons for each needed embeddedDocument type. 
 * @typedef {Object<string,string>} ComparisonKeys 
 * @example
 * const comparisonKeys = {
 *  ActiveEffect: 'label',
 *  Item: 'name'
 * }
 */

/**
 * Common 'shorthand' notation describing arbitrary data related to a spawn/mutate/revert process.
 * @typedef {Object} Shorthand
 * @prop {object} [token] Data related to the workflow TokenDocument.
 * @prop {object} [actor] Data related to the workflow Actor.
 * @prop {Object<string, object|string>} [embedded] Keyed by embedded document class name (e.g. `"Item"` or `"ActiveEffect"`)
 */

/**
 * Pre spawn callback. After a location is chosen or provided, but before any
 * spawning for _this iteration_ occurs. Used for modifying the spawning data prior to
 * each spawning iteration and for potentially skipping certain iterations.
 *
 * @typedef {function(Object,Object,number):Promise<boolean>|boolean} PreSpawn
 * @async
 * @param {{x: number, y: number}} location Desired centerpoint of spawned token.
 * @param {Object} updates Current working "updates" object, which is modified for every iteration
 * @param {number} iteration Current iteration number (0-indexed) in the case of 'duplicates'
 *
 * @returns {Promise<boolean>|boolean} Indicating if the _current_ spawning iteration should continue. 
 */

/**
 * Post spawn callback. After a the spawning and updating for _this iteration_ occurs. 
 * Used for modifying the spawning for the next iteration, operations on the TokenDocument directly
 * (such as animations or chat messages), and potentially aborting the spawning process entirely.
 *
 * @typedef {function(Object,TokenDocument,Object,number):Promise|void} PostSpawn
 * @async
 * @param {{x: number, y: number}} location Actual centerpoint of spawned token (affected by collision options).
 * @param {TokenDocument} spawnedToken Resulting token created for this spawning iteration
 * @param {Object} updates Current working "updates" object, which is modified for every iteration
 * @param {number} iteration Current iteration number (0-indexed) in the case of 'duplicates'
 *
 * @returns {Promise<boolean>|boolean} Indicating if this entire spawning process should be aborted (including any remaining duplicates)
 */


/**
 * @typedef {Object} CrosshairsConfig
 * @property {number} [size=1]
 * @property {string} [icon = 'icons/svg/dice-target.svg']
 * @property {string} [label = '']
 * @property {{x:number, y:number}} [labelOffset={x:0,y:0}]
 * @property {*} [tag='crosshairs']
 * @property {boolean} [drawIcon=true]
 * @property {boolean} [drawOutline=true]
 * @property {number} [interval=2]
 * @property {number} [fillAlpha=0]
 * @property {boolean} [tileTexture=false]
 * @property {boolean} [lockSize=true]
 * @property {boolean} [lockPosition=false]
 * @property {boolean} [rememberControlled=false]
 * @property {string} [texture]
 * @property {string} [fillColor=game.user.color]
 */

/**
 * @typedef {Object} SpawningOptions
 * @property {ComparisonKeys} [comparisonKeys] Data paths relative to root document data used for comparisons of embedded
 *  shorthand identifiers
 * @property {Shorthand} [updateOpts] Options for the creation/deletion/updating of (embedded) documents related to this spawning 
 * @property {Actor} [controllingActor] will minimize this actor's open sheet (if any) for a clearer view of the canvas 
 *  during placement. Also flags the created token with this actor's id. Default `null`
 * @property {number} [duplicates=1] will spawn multiple tokens from a single placement. See also {@link SpawningOptions.collision}
 * @property {boolean} [collision=duplicates>1] controls whether the placement of a token collides with any other token 
 *  or wall and finds a nearby unobstructed point (via a radial search) to place the token. If `duplicates` is greater 
 *  than 1, default is `true`; otherwise `false`.
 */

 /**
  * @typedef {SpawningOptions} WarpOptions
  * @prop {CrosshairsConfig} [crosshairs] A crosshairs configuration object to be used for this spawning process
  */

/**
 * @class
 * @private
 */
export class api {

  static register() {
    api.globals();
  }

  static settings() {

  }

  static globals() {
    /**
     * @global
     * @namespace warpgate
     * @property {warpgate.CONST} CONST
     * @property {warpgate.EVENT} EVENT
     * @borrows api._spawn as spawn
     * @borrows api._spawnAt as spawnAt
     * @borrows Gateway.dismissSpawn as dismiss
     * @borrows Mutator.mutate as mutate
     * @borrows Mutator.revertMutation as revert
     * @borrows MODULE.wait as wait
     * @borrows MODULE.dialog as dialog
     * @borrows MODULE.buttonDialog as buttonDialog
     * @borrows MODULE.menu as menu
     */
    window[MODULE.data.name] = {
      spawn : api._spawn,
      spawnAt : api._spawnAt,
      dismiss : Gateway.dismissSpawn,
      mutate : Mutator.mutate,
      revert : Mutator.revertMutation,
      /**
       * Factory method for creating a new mutation stack class from
       * the provided token document
       *
       * @memberof warpgate
       * @static
       * @param {TokenDocument} tokenDoc
       * @return {MutationStack} Locked instance of a token actor's mutation stack.
       *
       * @see {@link MutationStack}
       */
      mutationStack : (tokenDoc) => new MutationStack(tokenDoc),
      wait : MODULE.wait,
      dialog : MODULE.dialog,
      menu: MODULE.menu,
      buttonDialog : MODULE.buttonDialog,
      /**
       * Utility functions
       * @namespace
       * @alias warpgate.util
       * @borrows MODULE.firstGM as firstGM
       * @borrows MODULE.isFirstGM as isFirstGM
       * @borrows MODULE.firstOwner as firstOwner
       * @borrows MODULE.isFirstOwner as isFirstOwner
       */
      util: {
        firstGM : MODULE.firstGM,
        isFirstGM : MODULE.isFirstGM,
        firstOwner : MODULE.firstOwner,
        isFirstOwner : MODULE.isFirstOwner,
      },

      /**
       * Crosshairs API Functions
       * @namespace 
       * @alias warpgate.crosshairs
       * @borrows Gateway.showCrosshairs as show
       * @borrows Crosshairs.getTag as getTag
       * @borrows Gateway.collectPlaceables as collectPlaceables
       */
      crosshairs: {
        show: Gateway.showCrosshairs,
        getTag: Crosshairs.getTag,
        collect: Gateway.collectPlaceables,
      },
      /**
       * APIs intended for warp gate "pylons" (e.g.
       * warp gate dependent modules)
       * @namespace 
       * @alias warpgate.plugin
       */
      plugin: {
        queueUpdate
      },
      /**
       * System specific helpers
       * @namespace 
       * @alias warpgate.dnd5e
       * @borrows Gateway._rollItemGetLevel as rollItem
       */
      dnd5e : {
        rollItem : Gateway._rollItemGetLevel
      },
      /**
       * Constants and enums
       * @alias warpgate.CONST
       * @enum {string}
       */
      CONST : {
        DELETE : 'delete',
      },
      /**
       * Event name constants
       * @alias warpgate.EVENT
       * @enum {string}
       */
      EVENT : {
        /** After placement is chosen */
        PLACEMENT: 'wg_placement',
        SPAWN: 'wg_spawn',
        DISMISS: 'wg_dismiss',
        REVERT: 'wg_revert',
        MUTATE: 'wg_mutate',
        MUTATE_RESPONSE: 'wg_response_mutate',
        REVERT_RESPONSE: 'wg_response_revert'
      },
      /**
       * Event system API functions
       * @namespace 
       * @alias warpgate.event
       * @borrows Events.watch as watch
       * @borrows Events.trigger as trigger
       * @borrows Events.remove as remove
       * @borrows Events.notifyEvent as notify
       *
       */
      event : {
        watch : Events.watch,
        trigger : Events.trigger,
        remove : Events.remove,
        notify : Comms.notifyEvent,
      },
      /**
       * Warp Gate classes suitable for extension
       * @namespace 
       * @alias warpgate.abstract
       * @property {Crosshairs} Crosshairs
       * @property {MutationStack} MutationStack
       */
      abstract : {
        Crosshairs,
        MutationStack
      }
    }
  }

  /** 
   *
   * The primary function of Warp Gate. When executed, it will create a custom MeasuredTemplate
   * that is used to place the spawned token and handle any customizations provided in the `updates` 
   * object. `warpgate#spawn` will return a Promise that can be awaited, which can be used in loops 
   * to spawn multiple tokens, one after another (or use the `duplicates` options). The player spawning
   * the token will also be given Owner permissions for that specific token actor. 
   * This means that players can spawn any creature available in the world.
   *
   * @param {String|PrototypeTokenDocument} spawnName Name of actor to spawn or the actual TokenData 
   *  that should be used for spawning.
   * @param {Shorthand} [updates] - embedded document, actor, and token document updates. embedded updates use 
   *  a "shorthand" notation.
   * @param {Object} [callbacks] The callbacks object as used by spawn and spawnAt provide a way to execute custom 
   *  code during the spawning process. If the callback function modifies updates or location, it is often best 
   *  to do this via `mergeObject` due to pass by reference restrictions.
   * @param {PreSpawn} [callbacks.pre] 
   * @param {PostSpawn} [callbacks.post] 
   * @param {ParallelShow} [callbacks.show]
   * @param {WarpOptions | SpawningOptions} [options]
   *
   * @return {Promise<Array<String>>} list of created token ids
   */
  static async _spawn(spawnName, updates = {}, callbacks = {}, options = {}) {
    
    /* check for needed spawning permissions */
    const neededPerms = MODULE.canSpawn(game.user);
    if(neededPerms.length > 0) {
      logger.warn(MODULE.format('error.missingPerms', {permList: neededPerms.join(', ')}));
      return [];
    }

    /* create permissions for this user */
    const ownershipKey = MODULE.isV10 ? "ownership" : "permission";
    const actorData = {
      [ownershipKey]: {[game.user.id]: CONST.DOCUMENT_PERMISSION_LEVELS.OWNER}
    }

    /* insert token updates to modify token actor permission */
    updates = MODULE.shimUpdate(updates);
    foundry.utils.mergeObject(updates, {token: mergeObject(updates.token ?? {}, {actorData}, {overwrite:false})});

    /* Detect if the protoData is actually a name, and generate token data */
    let protoData;
    if (typeof spawnName == 'string'){
      protoData = await MODULE.getTokenData(spawnName, updates.token);
    } else {
      protoData = spawnName;
      const updateFn = MODULE.isV10 ? protoData.updateSource : protoData.update;
      if(updateFn) updateFn(updates.token);
    }

    if (!protoData) return;
    
    if(options.controllingActor?.sheet?.rendered) options.controllingActor.sheet.minimize();

    const tokenImg = MODULE.isV10 ? protoData.texture.src : protoData.img;
    const templateData = await Gateway.showCrosshairs({size: protoData.width, icon: tokenImg, name: protoData.name, ...options.crosshairs ?? {} }, callbacks);

    await warpgate.event.notify(warpgate.EVENT.PLACEMENT, {templateData, tokenData: protoData.toObject()});

    if (templateData.cancelled) return;

    let spawnLocation = {x: templateData.x, y:templateData.y}

    /* calculate any scaling that may have happened */
    const scale = templateData.size / protoData.width;

    /* insert changes from the template into the updates data */
    mergeObject(updates, {token: {rotation: templateData.direction + (updates.token.rotation ?? 0), width: templateData.size, height: protoData.height*scale}});

    return api._spawnAt(spawnLocation, protoData, updates, callbacks, options);
  }

  /**
   * An alternate, more module friendly spawning function. Will create a token from the provided token data and updates at the designated location. 
   *
   * @param {{x: number, y: number}} spawnLocation Centerpoint of spawned token
   * @param {String|PrototypeTokenData|TokenData|PrototypeTokenDocument} protoData Any token data or the name of a world-actor. Serves as the base data for all operations.
   * @param {Shorthand} [updates] As {@link warpgate.spawn}
   * @param {Object} [callbacks] see {@link warpgate.spawn}
   * @param {PreSpawn} [callbacks.pre] 
   * @param {PostSpawn} [callbacks.post] 
   * @param {SpawningOptions} [options] Modifies behavior of the spawning process.
   *
   * @return {Promise<Array<string>>} list of created token ids
   *
   */
  static async _spawnAt(spawnLocation, protoData, updates = {}, callbacks = {}, options = {}) {

    /* check for needed spawning permissions */
    const neededPerms = MODULE.canSpawn(game.user);
    if(neededPerms.length > 0) {
      logger.warn(MODULE.format('error.missingPerms', {permList: neededPerms.join(', ')}));
      return [];
    }

    updates = MODULE.shimUpdate(updates);

    /* Detect if the protoData is actually a name, and generate token data */
    if (typeof protoData == 'string'){
      protoData = await MODULE.getTokenData(protoData, updates.token ?? {});
    }

    if (!protoData) return [];

    const sourceActor = game.actors.get(protoData.actorId);
    let createdIds = [];

    /* flag this user as the actor's creator */
    const actorFlags = {
      [MODULE.data.name]: {
        control: {user: game.user.id, actor: options.controllingActor?.id},
      }
    }
    updates.actor = mergeObject(updates.actor ?? {} , {flags: actorFlags}, {overwrite: false});

    /* Flag this token with its original actor to work around
     * updating the token properties of a token linked to
     * an unowned actor
     */
    const tokenFlags = { 
      [MODULE.data.name]: {
        sourceActorId: sourceActor.id
      }
    }

    /* create permissions for this user */
    const ownershipKey = MODULE.isV10 ? "ownership" : "permission";
    const actorData = {
      [ownershipKey]: {[game.user.id]: CONST.DOCUMENT_PERMISSION_LEVELS.OWNER}
    }

    updates.token = mergeObject(updates.token ?? {}, {flags: tokenFlags, actorData}, {overwrite: false})

    const duplicates = options.duplicates > 0 ? options.duplicates : 1;
    Mutator.clean(null, options);
    for (let iteration = 0; iteration < duplicates; iteration++) {

      /** pre creation callback */
      if (callbacks.pre) {
        const response = await callbacks.pre(spawnLocation, updates, iteration);

        /* pre create callbacks can skip this spawning iteration */
        if(response === false) continue;
      }
      await Mutator.clean(updates);

      /* merge in changes to the prototoken */
      if(iteration == 0){
        /* first iteration, potentially from a spawn with a determined image,
         * apply our changes to this version */
        MODULE.updateProtoToken(protoData, updates.token);
      } else {
        /* get a fresh copy */
        protoData = await MODULE.getTokenData(game.actors.get(protoData.actorId), updates.token)
      }

      logger.debug(`Spawn iteration ${iteration} using`, protoData, updates);

      /** @type TokenDocument */
      const spawnedTokenDoc = (await Gateway._spawnTokenAtLocation(protoData,
        spawnLocation,
        options.collision ?? (options.duplicates > 1)))[0];

      createdIds.push(spawnedTokenDoc.id);

      logger.debug('Spawned token with data: ', MODULE.isV10 ? spawnedTokenDoc : spawnedTokenDoc.data);

      await Mutator._updateActor(spawnedTokenDoc.actor, updates, options.comparisonKeys ?? {});
      
      await warpgate.event.notify(warpgate.EVENT.SPAWN, {uuid: spawnedTokenDoc.uuid, updates, iteration});

      /* post creation callback */
      if (callbacks.post) {
        const response = await callbacks.post(spawnLocation, spawnedTokenDoc, updates, iteration);
        if(response === false) break;
      }
      
    }

    if (options.controllingActor?.sheet?.rendered) options.controllingActor?.sheet?.maximize();
    return createdIds;
  }

}

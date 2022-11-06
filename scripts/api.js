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

export class api {

  static register() {
    api.globals();
  }

  static settings() {

  }

  static globals() {
    window[MODULE.data.name] = {
      spawn : api._spawn,
      spawnAt : api._spawnAt,
      dismiss : Gateway.dismissSpawn,
      mutate : Mutator.mutate,
      revert : Mutator.revertMutation,
      mutationStack : (tokenDoc) => new MutationStack(tokenDoc),
      // TODO move these utilities to separate file
      wait : MODULE.wait,
      dialog : MODULE.dialog,
      menu: MODULE.menu,
      buttonDialog : MODULE.buttonDialog,
      // \MOVE
      util: {
        firstGM : MODULE.firstGM,
        isFirstGM : MODULE.isFirstGM,
        firstOwner : MODULE.firstOwner,
        isFirstOwner : MODULE.isFirstOwner,
      },
      crosshairs: {
        show: Gateway.showCrosshairs,
        getTag: Crosshairs.getTag,
        collect: Gateway.collectPlaceables,
      },
      plugin: {
        queueUpdate
      },
      dnd5e : {
        rollItem : Gateway._rollItemGetLevel
      },
      CONST : {
        DELETE : 'delete',
      },
      EVENT : {
        PLACEMENT: 'wg_placement',
        SPAWN: 'wg_spawn',
        DISMISS: 'wg_dismiss',
        REVERT: 'wg_revert',
        MUTATE: 'wg_mutate',
        MUTATE_RESPONSE: 'wg_response_mutate',
        REVERT_RESPONSE: 'wg_response_revert'
      },
      event : {
        watch : Events.watch,
        trigger : Events.trigger,
        remove : Events.remove,
        notify : Comms.notifyEvent,
      },
      abstract : {
        Crosshairs,
        MutationStack
      }
    }
  }

  /** Main driver
   * @param {String|PrototypeTokenDocument|PrototypeTokenData} spawnName
   *
   * @param {Object} updates - embedded document, actor, and token document updates. embedded updates use a "shorthand" notation.
   *
   * @param {Object} callbacks - functions to be executed at various stages of the spawning process
   *   pre: async function(templateData, updates). Executed after placement has been decided, but before updates 
   *       have been issued. Used for modifying the updates based on position of the placement
   *   post: async function(templateData, spawnedTokenDoc, updates, iteration). Executed after token has be spawned and updated. 
   *       Good for animation triggers or chat messages. Also used to change the update object for the next iteration 
   *       in case of duplicates being spawned. Iteration is 0 indexed.
   *
   * @param {Object} options
   *   controllingActor: Actor. currently only used to minimize the sheet while placing.
   *   duplicates: Number. Default = 1. Will spawn multiple copies of the chosen actor nearby the spawn point
   *   collision: Boolean. Default = true if using duplicates, false otherwise. Will move spawned token to a nearby square if the chosen point is occupied
   *       by a token or wall.
   *   comparisonKeys: Object. string-string key-value pairs indicating which field to use for comparisons for each needed embeddedDocument type. Ex. From dnd5e: {'ActiveEffect' : 'data.label'}
   *
   *
   * @return Promise<[{String}]> list of created token ids
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

  /* Places a token with provided default protodata at location
   * When using duplicates, a default protodata will be obtained
   * each iteration with all token updates applied.
   *
   * @param {{x: number, y: number}} spawnLocation Centerpoint of spawned token
   * @param {TokenData|String} protoData PrototypeTokenData or the same of the world actor
   *
   * @return {Promise<String[]>} list of created token ids
   *
   * core spawning logic:
   * 0) execute user's pre()
   * 1) Spawn actor with updated prototoken data 
   * 2) Update actor with actor and item changes
   * 3) execute user's post()
   * 4) if more duplicates, get fresh proto data and update it, goto 1
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

    if (!protoData) return;

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

    for (let iteration = 0; iteration < duplicates; iteration++) {

      /** pre creation callback */
      if (callbacks.pre) await callbacks.pre(spawnLocation, updates, iteration);

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

      const spawnedTokenDoc = (await Gateway._spawnTokenAtLocation(protoData,
        spawnLocation,
        options.collision ?? (options.duplicates > 1)))[0];

      createdIds.push(spawnedTokenDoc.id);

      logger.debug('Spawned token with data: ', MODULE.isV10 ? spawnedTokenDoc : spawnedTokenDoc.data);

      await Mutator._updateActor(spawnedTokenDoc.actor, updates, options.comparisonKeys ?? {});
      
      await warpgate.event.notify(warpgate.EVENT.SPAWN, {uuid: spawnedTokenDoc.uuid, updates, iteration});

      /* post creation callback */
      if (callbacks.post) await callbacks.post(spawnLocation, spawnedTokenDoc, updates, iteration);
      
    }

    if (options.controllingActor?.sheet?.rendered) options.controllingActor?.sheet?.maximize();
    return createdIds;
  }

}

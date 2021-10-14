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
      wait : MODULE.wait,
      dialog : MODULE.dialog,
      buttonDialog : MODULE.buttonDialog,
      crosshairs: {
        show: Gateway.showCrosshairs
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
          MUTATE: 'wg_mutate'
      },
      event : {
        watch : Events.watch,
        trigger : Events.trigger,
        remove : Events.remove,
        notify : Comms.notifyEvent,
      },
      abstract : {
        Crosshairs,
      }
    }
  }

  /** Main driver
   * @param {String} spawnName
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

    //get source actor
    const sourceActor = game.actors.getName(spawnName);
    if(!sourceActor) {
      logger.error(`Could not find world actor named "${spawnName}"`);
      return;
    }

    //get prototoken data -- need to prepare potential wild cards for the template preview
    let protoData = (await sourceActor.getTokenData(updates.token));
    if(!protoData) {
      logger.error(`Could not find proto token data for ${spawnName}`);
      return;
    }

    if(options.controllingActor) options.controllingActor.sheet.minimize();

    const templateData = await Gateway.showCrosshairs(protoData.width, protoData.img, protoData.name);

    await warpgate.event.notify(warpgate.EVENT.PLACEMENT, {templateData, tokenData: protoData.toObject()});

    if (templateData.cancelled) return;

    let spawnLocation = {x: templateData.x, y:templateData.y}

    /* calculate any scaling that may have happened */
    const scale = templateData.width / protoData.width;

    /* insert changes from the template into the updates data */
    mergeObject(updates, {token: {rotation: templateData.direction, width: templateData.width, height: protoData.height*scale}});

    return api._spawnAt(spawnLocation, protoData, updates, callbacks, options);
  }

  /* Places a token with provided default protodata at location
   * When using duplicates, a default protodata will be obtained
   * each iteration with all token updates applied.
   *
   * @param {Object} spawnLocation = {x:number, y:number}
   * @param {TokenData} protoData
   *
   * @return Promise<[{String}]> list of created token ids
   *
   * core spawning logic:
   * 0) execute user's pre()
   * 1) Spawn actor with updated prototoken data 
   * 2) Update actor with actor and item changes
   * 3) execute user's post()
   * 4) if more duplicates, get fresh proto data and update it, goto 1
   */
  static async _spawnAt(spawnLocation, protoData, updates = {}, callbacks = {}, options = {}) {

    /* Support legacy fields */
    if (updates.item){
      console.warn('You are using "updates.item" which has been deprecated in favor of "updates.embedded.Item"');
      updates.embedded = mergeObject(updates.embedded ?? {}, {"Item": updates.item})
    }

    const sourceActor = game.actors.get(protoData.actorId);
    let createdIds = [];

    /** pre creation callback */
    if (callbacks.pre) await callbacks.pre(spawnLocation, updates);

    const duplicates = options.duplicates > 0 ? options.duplicates : 1;

    /* Flag this token with its original actor to work around
     * updating the token properties of a token linked to
     * an unowned actor
     */
    const tokenFlags = { 
      [MODULE.data.name]: {
        sourceActorId: sourceActor.id
      }
    }

    updates.token = mergeObject(updates.token ?? {}, {flags: tokenFlags})

    /* merge in changes to the prototoken */
    protoData.update(updates.token);

    for (let iteration = 0; iteration < duplicates; iteration++) {

      logger.debug(`Spawn iteration ${iteration} using`, protoData, updates);

      const spawnedTokenDoc = (await Gateway._spawnTokenAtLocation(protoData,
        spawnLocation,
        options.collision ?? (options.duplicates > 1)))[0];


      createdIds.push(spawnedTokenDoc.id);

      logger.debug('Spawned token with data: ', spawnedTokenDoc.data);

      /* flag this user as the actor's creator */
      const actorFlags = {
        [MODULE.data.name]: {
          control: {user: game.user.id, actor: options.controllingActor?.id},
        }
      }
      updates.actor = mergeObject(updates.actor ?? {} , {flags: actorFlags});

      /* ensure creator owns this token */
      let permissions = { permission: duplicate(spawnedTokenDoc.actor.data.permission) };
      permissions.permission[game.user.id] = 3;

      updates.actor = mergeObject(updates.actor ?? {}, permissions);

      await Mutator._updateActor(spawnedTokenDoc.actor, updates, options.comparisonKeys ?? {});
      
      const actorData = Comms.packToken(spawnedTokenDoc);
      
      await warpgate.event.notify(warpgate.EVENT.SPAWN, {actorData, iteration});

      /** post creation callback -- use iter+1 because this update is referring to the NEXT iteration */
      if (callbacks.post) await callbacks.post(spawnLocation, spawnedTokenDoc, updates, iteration + 1);
      
      /** if we are dealing with duplicates, get a fresh set of proto data for next iteration */
      if (duplicates > 1) {

        /* get a fresh copy */
        protoData = (await sourceActor.getTokenData(updates.token));
        logger.debug('protoData for next loop:',protoData);
      }

      if (options.controllingActor) options.controllingActor.sheet.maximize();
    }

    return createdIds;
  }

}

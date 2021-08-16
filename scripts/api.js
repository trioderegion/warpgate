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
import { MODULE } from './module.js'

export class api {

  static register() {
    api.globals();
  }

  static settings() {

  }

  static globals() {
    window[MODULE.data.name] = {
      spawn : api._spawn,
      dismiss : Gateway.dismissSpawn,
      wait : MODULE.wait,
      dialog : MODULE.dialog,
      buttonDialog : MODULE.buttonDialog,
      dnd5e : {
        rollItem : Gateway._rollItemGetLevel
      },
      CONST : {
        DELETE : 'delete'
      }
    }
  }

  /** Main driver
   * @param {String} spawnName
   *
   * @param {Object} updates - item, actor, and token document updates. item updates use a "shorthand" notation.
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
   */
  static async _spawn(spawnName, updates = {item: {}, actor: {}, token: {}}, callbacks = {pre: null, post: null}, options = {}) {
    //get source actor
    const sourceActor = game.actors.getName(spawnName);
    if(!sourceActor) {
      logger.error(`Could not find world actor named "${spawnName}"`);
      return;
    }

    //get prototoken data
    let protoData = (await sourceActor.getTokenData(updates.token)).toObject();
    if(!protoData) {
      logger.error(`Could not find proto token data for ${spawnName}`);
      return;
    }

    

    if(options.controllingActor) options.controllingActor.sheet.minimize();
    let templateData = await Gateway.drawCrosshairs(protoData);

    mergeObject(protoData, templateData.tokenData);
    await api._runSpawn(templateData, sourceActor.id, updates, callbacks, options);
  }

  /** core spawning logic:
       * execute user's pre()
       * Spawn actor with already modified prototoken data
       * Update actor with changes
       * execute user's post()
       */
  static async _runSpawn(templateData, sourceActorId, updates, callbacks, options) {
    const sourceActor = await game.actors.get(sourceActorId);
    let protoData = (await sourceActor.getTokenData()).toObject();

    /** pre creation callback */
    if (callbacks.pre) await callbacks.pre(templateData, updates);

    const duplicates = options.duplicates > 0 ? options.duplicates : 1;

    for (let iteration = 0; iteration < duplicates; iteration++) {

      logger.debug(`Spawn iteration ${iteration} using`, protoData, updates);

      const spawnedTokenDoc = (await Gateway._spawnActorAtLocation(protoData,
        {x: templateData.x, y: templateData.y},
        options.collision ?? (options.duplicates > 1)))[0];

      logger.debug('Spawned token with data: ', protoData);

      if (updates) {
        await Gateway._updateSummon(spawnedTokenDoc, updates);
      }

      /** flag this user as its creator */
      const control = {user: game.user.id, actor: options.controllingActor?.id}

      logger.debug('Flagging control', control);

      await spawnedTokenDoc.actor.setFlag(MODULE.data.name, 'control', control);

      /** post creation callback -- use iter+1 because this update is referring to the NEXT iteration */
      logger.debug('Firing post callback, if any', callbacks.post);
      if (callbacks.post) await callbacks.post(templateData, spawnedTokenDoc, updates, iteration + 1);
      
      logger.debug('Preparing for next iteration');
      /** if we are dealing with a wild card and need a fresh one for next iteration */
      if (duplicates > 1) {
        if (sourceActor.data.token.randomImg) {
          /* get a fresh copy */
          let newToken = (await sourceActor.getTokenData(updates.token)).toObject();
          mergeObject(protoData, mergeObject(newToken, updates.token))
          
        } else {
          /* update current prototoken */
          mergeObject(protoData, updates.token);
        }
      }
      logger.debug('protoData for next loop:',protoData);

      if (options.controllingActor) options.controllingActor.sheet.maximize();
    }

    return;
  }

}

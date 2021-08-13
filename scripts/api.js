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
   * @param {Object} updates - item, actor, and token document updates. item updates use a "shorthand" notation.
   * @param {Object} callbacks - functions to be executed at various stages of the spawning process
   *   pre: async function(templateData, updates). Executed after placement has been decided, but before updates have been issued. Used for modifying the updates based on position of the placement
   *   post: async function(templateData, spawnedTokenDoc). Executed after token has be spawned and updated. Good for animation triggers or chat messages.
   * @param {Object} options
   *   controllingActor: Actor. currently only used to minimize the sheet while placing.
   */
  static async _spawn(spawnName, updates = {item: {}, actor: {}, token: {}}, callbacks = {pre: null, post: null}, options = {controllingActor: null}) {

    //get prototoken data
    let protoData = await game.actors.getName(spawnName)?.getTokenData(updates.token);
    if(!protoData) {
      logger.error(`Could not find proto token data for ${spawnName}`);
      return;
    }

    /** core spawning logic:
     * execute user's pre()
     * Spawn actor with already modified prototoken data
     * Update actor with changes
     * execute user's post()
     */
    const onPlacement = (templateData) => {
      Gateway.queueUpdate( async () => {

        /** pre creation callback */
        if (callbacks.pre) await callbacks.pre(templateData, updates);

        const spawnedTokenDoc = (await Gateway._spawnActorAtLocation(protoData, templateData))[0];
        if (updates) await Gateway._updateSummon(spawnedTokenDoc, updates);

        /** flag this user as its creator */
        const control = {user: game.user.id, actor: options.controllingActor?.id}
        await spawnedTokenDoc.actor.setFlag(MODULE.data.name, 'control', control);

        /** post creation callback */
        if (callbacks.post) await callbacks.post(templateData, spawnedTokenDoc);

        if(options.controllingActor) options.controllingActor.sheet.maximize();
      });
    }

    if(options.controllingActor) options.controllingActor.sheet.minimize();
    return Gateway.drawCrosshairs(protoData, onPlacement);
  }
}

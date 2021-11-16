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
import {Crosshairs} from './crosshairs.js'
import { Comms } from './comms.js'
import {Propagator} from './propagator.js'

const NAME = "Gateway";

export class Gateway {

  static register() {
    this.settings();
    this.defaults();
  }

  static settings() {
    const config = true;
    const settingsData = {
      openDelete : {
        scope: "world", config, default: false, type: Boolean,
      },
      updateDelay : {
        scope: "client", config, default: 20, type: Number
      }
    };

    MODULE.applySettings(settingsData);
  }

  static defaults() {
    MODULE[NAME] = {
      get crosshairsConfig() {
        return {
          size: 1,
          icon: 'icons/svg/dice-target.svg',
          label: '',
          labelOffset: {
            x: 0,
            y: 0
          },
          tag: 'crosshairs',
          drawIcon: true,
          drawOutline: true,
          interval: 2,
          fillAlpha: 0,
          tileTexture: false,
          lockSize: true,

          //Measured template defaults
          texture: null,
          x: 0,
          y: 0,
          fillColor: game.user.color,
        }
      }
    }
  }

  /** dnd5e helper function
   * @param { Item5e } item
   * @todo abstract further out of core code
   */
  static async _rollItemGetLevel(item) {
    const result = await item.roll();
    // extract the level at which the spell was cast
    if (!result) return 0;
    const content = result.data.content;
    const level = content.charAt(content.indexOf("data-spell-level") + 18);
    return parseInt(level);
  }

  /* Displays a circular template attached to the mouse cursor that snaps to grid centers
   * and grid intersections
   * @param {Number} gridUnits: How large to draw the circular template in grid squares
   * @param {String} icon: Icon to display in the center of the template
   * @param {String} label: Text to display under the template
   */
  static async showCrosshairs(...args) {
    let config = args[0] ?? {};
    let callbacks = args[1] ?? {};

    if( (typeof args[0] == 'number') || (args.length > 1 && typeof args[1] !== 'object')) {
      console.warn('You are using show(gridUnits, icon, label) which has been deprecated in favor of show(config, callbacks)');
      config = {size: args[0] ?? 1, icon: args[1] ?? 'icons/svg/dice-target.svg', label: args[2] ?? ''};
    }
    
    return Gateway._showCrosshairs(config, callbacks);
  }

  static async _showCrosshairs(config = {}, callbacks = {}) {

    let mergedConfig = mergeObject(MODULE[NAME].crosshairsConfig, config, {inplace:false}); 

    /* if a specific initial location is not provided, grab the current mouse location */
    if(!config.hasOwnProperty('x') && !config.hasOwnProperty('y')) {
      let mouseLoc = MODULE.getMouseStagePos();
      mouseLoc = canvas.grid.getSnappedPosition(mouseLoc.x, mouseLoc.y, mergedConfig.interval);
      mergedConfig.x = mouseLoc.x;
      mergedConfig.y = mouseLoc.y;
    }

    const template = new Crosshairs(mergedConfig, callbacks);
    await template.drawPreview();
    let dataObj = template.data.toObject();

    /** @todo temporary workaround */
    dataObj.cancelled = template.cancelled;
    dataObj.parent = template.document.parent;
    dataObj.radius = template.radius;

    /* mirror the input variables for the output as well */
    dataObj.size = dataObj.width

    return dataObj;
  }

  /*
   * Returns desired types of placeables whose center point
   * is within the crosshairs radius.
   *
   * @param crosshairsData {Object}. Requires at least {x,y,radius,parent} (all in pixels, parent is a Scene)
   * @param types {Array<String>} (['Token']). Collects the desired embedded placeable types.
   *
   * @return {Object<embeddedName: collected>} List of collected placeables keyed by embeddedName
   */
  static collectPlaceables( crosshairsData, types = ['Token'] ) {

    const calcDistance = (A, B) => { return Math.hypot(A.x-B.x, A.y-B.y) };
    
    const result = types.reduce( (acc, embeddedName) => {
      const collection = crosshairsData.parent.getEmbeddedCollection(embeddedName);
      const contained = collection.filter( (document) => {
        const distance = calcDistance(document.object.center, crosshairsData);
        return distance <= crosshairsData.radius;
      });
      acc[embeddedName] = contained;
      return acc;
    }, {});

    return result;
  }

  static async dismissSpawn(tokenId, sceneId = canvas.scene?.id, onBehalf = game.user.id) {

    if (!tokenId || !sceneId){
      logger.debug("Cannot dismiss null token or from a null scene.", tokenId, sceneId);
      return;
    }

    /* check for permission to delete freely */
    if (!MODULE.setting('openDelete')) {
      /* check permissions on token */
      const tokenData = game.scenes.get(sceneId)?.getEmbeddedDocument("Token",tokenId);
      if (!tokenData.isOwner) {
        logger.error(MODULE.localize('error.unownedDelete'));
        return;
      }
    }

    
    logger.debug("Deleting token =>", tokenId, "from scene =>", sceneId);

    if (!MODULE.firstGM()){
      logger.error('error.noGm');
      return;
    }

    /** first gm drives */
    if (MODULE.isFirstGM()) {
      const tokenDocs = await game.scenes.get(sceneId).deleteEmbeddedDocuments("Token",[tokenId]);
      const actorData = Comms.packToken(tokenDocs[0]);
      await warpgate.event.notify(warpgate.EVENT.DISMISS, {actorData}, onBehalf);
    } else {
      /** otherwise, we need to send a request for deletion */
      await Comms.requestDismissSpawn(tokenId, sceneId);
    }
    
    return;
  }

  /* returns promise of token creation */
  static async _spawnTokenAtLocation(protoToken, spawnPoint, collision) {

    // Increase this offset for larger summons
    let internalSpawnPoint = {x: spawnPoint.x - (canvas.scene.data.grid  * (protoToken.width/2)),
        y:spawnPoint.y - (canvas.scene.data.grid  * (protoToken.height/2))}
    
    /* call ripper's placement algorithm for collision checks
     * which will try to avoid tokens and walls
     */
    if (collision) {
      const openPosition = Propagator.getFreePosition(protoToken, internalSpawnPoint);  
      if(!openPosition) {
        logger.info(MODULE.localize('error.noOpenLocation'));
      } else {
        internalSpawnPoint = openPosition
      }
    }

    protoToken.update(internalSpawnPoint);

    return canvas.scene.createEmbeddedDocuments("Token", [protoToken])
  }

  

}

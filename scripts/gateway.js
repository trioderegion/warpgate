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

import { MODULE, logger } from "./module.js";
import { Crosshairs } from "./crosshairs.js";
import { packToken, requestDismissSpawn } from "./comms.js";

const NAME = "Gateway";

/** @typedef {import('./api.js').CrosshairsConfig} CrosshairsConfig */
/** @typedef {import('./crosshairs.js').CrosshairsData} CrosshairsData */
/** @typedef {import('./lib/PlaceableFit.mjs').PlaceableFit} PlaceableFit */

/**
 * Callback started just prior to the crosshairs template being drawn. Is not awaited. Used for modifying
 * how the crosshairs is displayed and for responding to its displayed position
 *
 * All of the fields in the {@link CrosshairsConfig} object can be modified directly. Any fields owned by
 * MeasuredTemplate must be changed via `update|updateSource` as other DocumentData|DataModel classes.
 * Async functions will run in parallel while the user is moving the crosshairs. Serial functions will
 * block detection of the left and right click operations until return.
 *
 * @typedef {function(Crosshairs):any} ParallelShow
 * @param {Crosshairs} crosshairs The live Crosshairs instance associated with this callback
 *
 * @returns {any}
 */

/**
 * @class
 * @private
 */
class Gateway {
  static register() {
    Gateway.settings();
    Gateway.defaults();
  }

  static settings() {
    const config = true;
    const settingsData = {
      openDelete: {
        scope: "world",
        config,
        default: false,
        type: Boolean,
      },
      updateDelay: {
        scope: "client",
        config,
        default: 0,
        type: Number,
      },
    };

    MODULE.applySettings(settingsData);
  }

  static defaults() {
    MODULE[NAME] = {
      /**
       * type {CrosshairsConfig}
       * @const
       */
      get crosshairsConfig() {
        return {
          size: 1,
          icon: "icons/svg/dice-target.svg",
          label: "",
          labelOffset: {
            x: 0,
            y: 0,
          },
          tag: "crosshairs",
          drawIcon: true,
          drawOutline: true,
          interval: 2,
          fillAlpha: 0,
          tileTexture: false,
          lockSize: true,
          lockPosition: false,
          rememberControlled: false,

          //Measured template defaults
          texture: null,
          //x: 0,
          //y: 0,
          direction: 0,
          fillColor: game.user.color,
        };
      },
    };
  }

  /**
   * dnd5e helper function
   * @param { Item5e } item
   * @param {Object} [options={}]
   * @param {Object} [config={}] V10 Only field
   * @todo abstract further out of core code
   */
  static async _rollItemGetLevel(item, options = {}, config = {}) {
    const result = await item.use(config, options);
    // extract the level at which the spell was cast
    if (!result) return 0;
    const content = result.content;
    const level = content.charAt(content.indexOf("data-spell-level") + 18);
    return parseInt(level);
  }

  /**
   * Displays a circular template attached to the mouse cursor that snaps to grid centers
   * and grid intersections.
   *
   * Its size is in grid squares/hexes and can be scaled up and down via shift+mouse scroll.
   * Resulting data indicates the final position and size of the template. Note: Shift+Scroll
   * will increase/decrease the size of the crosshairs outline, which increases or decreases
   * the size of the token spawned, independent of other modifications.
   *
   * @param {CrosshairsConfig} [config] Configuration settings for how the crosshairs template should be displayed.
   * @param {Object} [callbacks] Functions executed at certain stages of the crosshair display process.
   * @param {ParallelShow} [callbacks.show]
   *
   * @returns {Promise<CrosshairsData>} All fields contained by `MeasuredTemplateDocument#toObject`. Notably `x`, `y`,
   * `width` (in pixels), and the addition of `size` (final size, in grid units, e.g. "2" for a final diameter of 2 squares).
   *
   */
  static async showCrosshairs(config = {}, callbacks = {}) {
    /* add in defaults */
    mergeObject(config, MODULE[NAME].crosshairsConfig, { overwrite: false });

    /* store currently controlled tokens */
    let controlled = [];
    if (config.rememberControlled) {
      controlled = canvas.tokens.controlled;
    }

    /* if a specific initial location is not provided, grab the current mouse location */
    if (!config.hasOwnProperty("x") && !config.hasOwnProperty("y")) {
      let mouseLoc = MODULE.getMouseStagePos();
      mouseLoc = Crosshairs.getSnappedPosition(mouseLoc, config.interval);
      config.x = mouseLoc.x;
      config.y = mouseLoc.y;
    }

    const template = new Crosshairs(config, callbacks);
    await template.drawPreview();

    const dataObj = template.toObject();

    /* if we have stored any controlled tokens,
     * restore that control now
     */
    for (const token of controlled) {
      token.control({ releaseOthers: false });
    }

    return dataObj;
  }

  /* tests if a placeable's center point is within
   * the radius of the crosshairs
   */
  static _containsCenter(placeable, crosshairsData) {
    const calcDistance = (A, B) => {
      return Math.hypot(A.x - B.x, A.y - B.y);
    };

    const distance = calcDistance(placeable.center, crosshairsData);
    return distance <= crosshairsData.radius;
  }

  /**
   * Returns desired types of placeables whose center point
   * is within the crosshairs radius.
   *
   * @param {Object} crosshairsData Requires at least {x,y,radius,parent} (all in pixels, parent is a Scene)
   * @param {String|Array<String>} [types='Token'] Collects the desired embedded placeable types.
   * @param {Function} [containedFilter=Gateway._containsCenter]. Optional function for determining if a placeable
   *   is contained by the crosshairs. Default function tests for centerpoint containment. {@link Gateway._containsCenter}
   *
   * @return {Object<String,PlaceableObject>} List of collected placeables keyed by embeddedName
   */
  static collectPlaceables(
    crosshairsData,
    types = "Token",
    containedFilter = Gateway._containsCenter
  ) {
    const isArray = types instanceof Array;

    types = isArray ? types : [types];

    const result = types.reduce((acc, embeddedName) => {
      const collection =
        crosshairsData.scene.getEmbeddedCollection(embeddedName);

      let contained = collection.filter((document) => {
        return containedFilter(document.object, crosshairsData);
      });

      acc[embeddedName] = contained;
      return acc;
    }, {});

    /* if we are only collecting one kind of placeable, only return one kind of placeable */
    return isArray ? result : result[types[0]];
  }

  static async handleDismissSpawn({ tokenId, sceneId, userId, ...rest }) {
    /* let the first GM handle all dismissals */
    if (MODULE.isFirstGM())
      await Gateway.dismissSpawn(tokenId, sceneId, userId);
  }

  /**
   * Deletes the specified token from the specified scene. This function allows anyone
   * to delete any specified token unless this functionality is restricted to only
   * owned tokens in Warp Gate's module settings. This is the same function called
   * by the "Dismiss" header button on owned actor sheets.
   *
   * @param {string} tokenId
   * @param {string} [sceneId = canvas.scene.id] Needed if the dismissed token does not reside
   *  on the currently viewed scene
   * @param {string} [onBehalf = game.user.id] Impersonate another user making this request
   */
  static async dismissSpawn(
    tokenId,
    sceneId = canvas.scene?.id,
    onBehalf = game.user.id
  ) {
    if (!tokenId || !sceneId) {
      logger.debug(
        "Cannot dismiss null token or from a null scene.",
        tokenId,
        sceneId
      );
      return;
    }

    const tokenData = game.scenes
      .get(sceneId)
      ?.getEmbeddedDocument("Token", tokenId);
    if (!tokenData) {
      logger.debug(`Token [${tokenId}] no longer exists on scene [${sceneId}]`);
      return;
    }

    /* check for permission to delete freely */
    if (!MODULE.setting("openDelete")) {
      /* check permissions on token */
      if (!tokenData.isOwner) {
        logger.error(MODULE.localize("error.unownedDelete"));
        return;
      }
    }

    logger.debug("Deleting token =>", tokenId, "from scene =>", sceneId);

    if (!MODULE.firstGM()) {
      logger.error(MODULE.localize("error.noGm"));
      return;
    }

    /** first gm drives */
    if (MODULE.isFirstGM()) {
      const tokenDocs = await game.scenes
        .get(sceneId)
        .deleteEmbeddedDocuments("Token", [tokenId]);
      const actorData = packToken(tokenDocs[0]);
      await warpgate.event.notify(
        warpgate.EVENT.DISMISS,
        { actorData },
        onBehalf
      );
    } else {
      /** otherwise, we need to send a request for deletion */
      requestDismissSpawn(tokenId, sceneId);
    }

    return;
  }

  /**
   * returns promise of token creation
   * @param {TokenData} protoToken
   * @param {{ x: number, y: number }} spawnPoint
   * @param {boolean} collision
   */
  static async _spawnTokenAtLocation(protoToken, spawnPoint, collision) {
    // Increase this offset for larger summons
    const gridSize = canvas.scene.grid.size;
    let loc = {
      x: spawnPoint.x - gridSize * (protoToken.width / 2),
      y: spawnPoint.y - gridSize * (protoToken.height / 2),
    };

    /* call ripper's placement algorithm for collision checks
     * which will try to avoid tokens and walls
     */
    if (collision) {
      /** @type PlaceableFit */
      const PFit = warpgate.abstract.PlaceableFit;
      const fitter = new PFit({...loc, width: gridSize * protoToken.width, height: gridSize * protoToken.height});
      const openPosition = fitter.find();
      if (!openPosition) {
        logger.info(MODULE.localize("error.noOpenLocation"));
      } else {
        loc = openPosition;
      }
    }

    protoToken.updateSource(loc);

    return canvas.scene.createEmbeddedDocuments("Token", [protoToken]);
  }
}

export const register = Gateway.register,
  dismissSpawn = Gateway.dismissSpawn,
  showCrosshairs = Gateway.showCrosshairs,
  collectPlaceables = Gateway.collectPlaceables,
  _rollItemGetLevel = Gateway._rollItemGetLevel,
  handleDismissSpawn = Gateway.handleDismissSpawn,
  _spawnTokenAtLocation = Gateway._spawnTokenAtLocation;

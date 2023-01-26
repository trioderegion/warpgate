
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

/** @typedef {import('./crosshairs.js').CrosshairsData} CrosshairsData */
/** @typedef {import('./mutator.js').WorkflowOptions} WorkflowOptions */
/** @typedef {import('./gateway.js').ParallelShow} ParallelShow */

/**
 * string-string key-value pairs indicating which field to use for comparisons for each needed embeddedDocument type. 
 * @typedef {Object<string,string>} ComparisonKeys 
 * @example
 * const comparisonKeys = {
 *  ActiveEffect: 'label',
 *  Item: 'name'
 * }
 */

/* 
 * @private
 * @ignore
 * @todo Creating proper type and use in warpgate.dismiss
 * @typedef {{overrides: ?{includeRawData: ?WorkflowOptions['overrides']['includeRawData']}}} DismissOptions
 */

/**
 * Configuration obect for pan and ping (i.e. Notice) operations
 * @typedef {Object} NoticeConfig
 * @prop {boolean|string} [ping] Creates an animated ping at designated location if a valid
 *  ping style from the values contained in `CONFIG.Canvas.pings.types` is provided, or `'pulse'` if `true`
 * @prop {boolean|Number} [pan] Pans all receivers to designated location if value is `true`
 *   using the configured default pan duration of `CONFIG.Canvas.pings.pullSpeed`. If a Number is 
 *   provided, it is used as the duration of the pan.
 * @prop {Number} [zoom] Alters zoom level of all receivers, independent of pan/ping
 * @prop {string} [sender = game.userId] The user who triggered the notice
 * @prop {Array<string>} [receivers = warpgate.USERS.SELF] An array of user IDs to send the notice to. If not
 *   provided, the notice is only sent to the current user.
 */

/**
 * Common 'shorthand' notation describing arbitrary data related to a spawn/mutate/revert process.
 *
 * The `token` and `actor` key values are standard update or options objects as one would use in 
 * `Actor#update` and `TokenDocument#update`.
 *
 * The `embedded` key uses a shorthand notation to make creating the updates for embedded documents
 * (such as items) easier. Notably, it does not require the `_id` field to be part of the update object 
 * for a given embedded document type.  
 *
 * @typedef {Object} Shorthand
 * @prop {object} [token] Data related to the workflow TokenDocument.
 * @prop {object} [actor] Data related to the workflow Actor.
 * @prop {Object<string, object|string>} [embedded] Keyed by embedded document class name (e.g. `"Item"` or `"ActiveEffect"`), there are three operations that this object controls -- adding, updating, deleting (in that order).
 *
 * | Operation | Value Interpretation |
 * | :-- | :-- |
 * | Add | Given the identifier of a **non-existing** embedded document, the value contains the data object for document creation compatible with `createEmbeddedDocuments`. This object can be constructed in-place by hand, or gotten from a template document and modified using `"Item To Add": game.items.getName("Name of Item").data`. As an example. Note: the name contained in the key will override the corresponding identifier field in the final creation data. |
 * | Update | Given a key of an existing document, the value contains the data object compatible with `updateEmbeddedDocuments`|
 * | Delete | A value of {@link warpgate.CONST.DELETE} will remove this document (if it exists) from the spawned actor. e.g. `{"Item Name To Delete": warpgate.CONST.DELETE}`|
 *
 * @see ComparisonKeys
 */

/**
 * Pre spawn callback. After a location is chosen or provided, but before any
 * spawning for _this iteration_ occurs. Used for modifying the spawning data prior to
 * each spawning iteration and for potentially skipping certain iterations.
 *
 * @typedef {(function(Object,Object,number):Promise<boolean>|boolean)} PreSpawn
 * @param {{x: number, y: number}} location Desired centerpoint of spawned token.
 * @param {Object} updates Current working "updates" object, which is modified for every iteration
 * @param {number} iteration Current iteration number (0-indexed) in the case of 'duplicates'
 *
 * @returns {Promise<boolean>|boolean} Indicating if the _current_ spawning iteration should continue. 
 */

/**
 * Post spawn callback. After the spawning and updating for _this iteration_ occurs.
 * Used for modifying the spawning for the next iteration, operations on the TokenDocument directly
 * (such as animations or chat messages), and potentially aborting the spawning process entirely.
 *
 * @typedef {(function(Object,TokenDocument,Object,number):Promise|void)} PostSpawn
 * @param {{x: number, y: number}} location Actual centerpoint of spawned token (affected by collision options).
 * @param {TokenDocument} spawnedToken Resulting token created for this spawning iteration
 * @param {Object} updates Current working "updates" object, which is modified for every iteration
 * @param {number} iteration Current iteration number (0-indexed) in the case of 'duplicates'
 *
 * @returns {Promise<boolean>|boolean} Indicating if this entire spawning process should be aborted (including any remaining duplicates)
 */


/**
 * This object controls how the crosshairs will be displayed and decorated. 
 * Each field is optional with its default value listed.
 *
 * @typedef {Object} CrosshairsConfig
 * @property {number} [x=currentMousePosX] Initial x location for display
 * @property {number} [y=currentMousePosY] Initial y location for display
 * @property {number} [size=1] The initial diameter of the crosshairs outline in grid squares
 * @property {string} [icon = 'icons/svg/dice-target.svg'] The icon displayed in the center of the crosshairs
 * @property {number} [direction = 0] Initial rotation angle (in degrees) of the displayed icon (if any). 0 degrees corresponds to <0, 1> unit vector (y+ in screen space, or 'down' in "monitor space"). If this is included within a {@link WarpOptions} object, it is treated as a delta change to the token/update's current rotation value. Positive values rotate clockwise; negative values rotate counter-clockwise. 
 * @property {string} [label = ''] The text to display below the crosshairs outline
 * @property {{x:number, y:number}} [labelOffset={x:0,y:0}] Pixel offset from the label's initial relative position below the outline
 * @property {*} [tag='crosshairs'] Arbitrary value used to identify this crosshairs object
 * @property {boolean} [drawIcon=true] Controls the display of the center icon of the crosshairs
 * @property {boolean} [drawOutline=true] Controls the display of the outline circle of the crosshairs
 * @property {number} [interval=2] Sub-grid granularity per square. Snap points will be created every 1/`interval` 
 *  grid spaces. Positive values begin snapping at grid intersections. Negative values begin snapping at the 
 *  center of the square. Ex. the default value of 2 produces two snap points -- one at the edge and one at the 
 *  center; `interval` of 1 will snap to grid intersections; `interval` of -1 will snap to grid centers. 
 *  Additionally, a value of `0` will turn off grid snapping completely for this instance of crosshairs.
 * @property {number} [fillAlpha=0] Alpha (opacity) of the template's fill color (if any).
 * @property {string} [fillColor=game.user.color] Color of the template's fill when no texture is used. 
 * @property {boolean} [rememberControlled=false] Will restore the previously selected tokens after using crosshairs.
 * @property {boolean} [tileTexture=false] Indicates if the texture is tileable and does not need specific
 *  offset/scaling to be drawn correctly. By default, the chosen texture will be position and scaled such 
 *  that the center of the texture image resides at the center of the crosshairs template.
 * @property {boolean} [lockSize=true] Controls the ability of the user to scale the size of the crosshairs 
 *  using shift+scroll. When locked, shift+scroll acts as a "coarse rotation" step for rotating the center icon.
 * @property {boolean} [lockPosition=false] Prevents updating the position of the crosshair based on mouse movement. Typically used in combination with the `show` callback to lock position conditionally.
 * @property {string} [texture] Asset path of the texture to draw inside the crosshairs border.
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
 * @property {NoticeConfig} [notice] will pan or ping the canvas to the token's position after spawning.
 * @property {object} [overrides] See corresponding property descriptions in {@link WorkflowOptions}
 * @property {boolean} [overrides.includeRawData = false] 
 * @property {boolean} [overrides.preserveData = false]
 */

 /**
  * @typedef {Object} WarpOptions
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
     * @summary Top level (global) symbol providing access to all Warp Gate API functions
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
       * @summary Utility functions for common queries and operations
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
       * @summary Crosshairs API Functions
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
       * @summary APIs intended for warp gate "pylons" (e.g. Warp Gate-dependent modules)
       * @namespace 
       * @alias warpgate.plugin
       */
      plugin: {
        queueUpdate,
        notice: api._notice,
        batchMutate: Mutator.batchMutate,
        batchRevert: Mutator.batchRevert,
      },
      /**
       * @summary System specific helpers
       * @namespace 
       * @alias warpgate.dnd5e
       * @borrows Gateway._rollItemGetLevel as rollItem
       */
      dnd5e : {
        rollItem : Gateway._rollItemGetLevel
      },
      /**
       * @description Constants and enums for use in embedded shorthand fields
       * @alias warpgate.CONST
       * @enum {string}
       */
      CONST : {
        /** Instructs warpgate to delete the identified embedded document. Used in place of the update or create data objects. */
        DELETE : 'delete',
      },
      /**
       * @description Helper enums for retrieving user IDs
       * @alias warpgate.USERS
       * @enum {Array<string>}
       */
      USERS: {
        /** All online users */
        get ALL() { return game.users.filter(user => user.active).map( user => user.id ) },
        /** The current user */
        get SELF() { return [game.userId] },
        /** All online GMs */
        get GM() { return game.users.filter(user => user.active && user.isGM).map( user => user.id ) },
        /** All online players */
        get PLAYERS() { return game.users.filter(user => user.active && !user.isGM).map( user => user.id ) }
      },
      /**
       *
       * The following table describes the stock event type payloads that are broadcast during {@link warpgate.event.notify}
       * 
       * | Event | Payload | Notes |
       * | :-- | -- | -- |
       * | `<any>` | `{sceneId: string, userId: string}` | userId is the initiator |
       * | {@link warpgate.EVENT.PLACEMENT} | `{templateData: {@link CrosshairsData}|Object, tokenData: TokenData|String('omitted'), options: {@link WarpOptions}} | The final Crosshairs data used to spawn the token, and the final token data that will be spawned. There is no actor data provided. In the case of omitting raw data, `template` data will be of type `{x: number, y: number, size: number, cancelled: boolean}`  |
       * | SPAWN | `{uuid: string, updates: {@link Shorthand}|String('omitted'), options: {@link WarpOptions}|{@link SpawningOptions}, iteration: number}` | UUID of created token, updates applied to the token, options used for spawning, and iteration this token was spawned on.|
       * | DISMISS | `{actorData: {@link PackedActorData}|string}` | `actorData` is a customized version of `Actor#toObject` with its `token` field containing the actual token document data dismissed, instead of its prototype data. |
       * | MUTATE | `{uuid: string, updates: {@link Shorthand}, options: {@link WorkflowOptions} & {@link MutationOptions}` | UUID of modified token, updates applied to the token, options used for mutation. When raw data is omitted, `updates` will be `String('omitted')`|
       * | REVERT | `{uuid: string, updates: {@link Shorthand}, options: {@link WorkflowOptions}} | UUID is that of reverted token and updates applied to produce the final reverted state (or `String('omitted') if raw data is omitted). |
       * | REVERT\_RESPONSE | `{accepted: bool, tokenId: string, mutationId: string, options: {@link WorkflowOptions}` | Indicates acceptance/rejection of the remote revert request, including target identifiers and options |
       * | MUTATE\_RESPONSE | `{accepted: bool, tokenId: string, mutationId: string, options: {@link WorkflowOptions}` | `mutationId` is the name provided in `options.name` OR a randomly assigned ID if not provided. Callback functions provided for remote mutations will be internally converted to triggers for this event and do not need to be registered manually by the user. `accepted` is a bool field that indicates if the remote user accepted the mutation. |
       *
       * @description Event name constants for use with the {@link warpgate.event} system.
       * @alias warpgate.EVENT
       * @enum {string}
       */
      EVENT : {
        /** After placement is chosen */
        PLACEMENT: 'wg_placement',
        /** After each token has been spawned and fully updated */
        SPAWN: 'wg_spawn',
        /** After a token has been dismissed via warpgate */
        DISMISS: 'wg_dismiss',
        /** After a token has been fully reverted */
        REVERT: 'wg_revert',
        /** After a token has been fully modified */
        MUTATE: 'wg_mutate',
        /** Feedback of mutation acceptance/rejection from the remote owning player in
         * the case of an "unowned" or remote mutation operation
         */
        MUTATE_RESPONSE: 'wg_response_mutate',
        /** Feedback of mutation revert acceptance/rejection from the remote owning player in
         * the case of an "unowned" or remote mutation operation
         */
        REVERT_RESPONSE: 'wg_response_revert'
      },
      /**
       * Warp Gate includes a hook-like event system that can be used to respond to stages of the
       * spawning and mutation process. Additionally, the event system is exposed so that users 
       * and module authors can create custom events in any context.
       *
       * @summary Event system API functions.
       * @see warpgate.event.notify
       *
       * @namespace 
       * @alias warpgate.event
       * @borrows Events.watch as watch
       * @borrows Events.trigger as trigger
       * @borrows Events.remove as remove
       * @borrows Comms.notifyEvent as notify
       *
       */
      event : {
        watch : Events.watch,
        trigger : Events.trigger,
        remove : Events.remove,
        notify : Comms.notifyEvent,
      },
      /**
       * @summary Warp Gate classes suitable for extension
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
   * @param {WarpOptions & SpawningOptions} [options]
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

    /* the provided update object will be mangled for our use -- copy it to
     * preserve the user's original input if requested (default).
     */
    if(!options.overrides?.preserveData) {
      updates = MODULE.copy(updates, 'error.badUpdate.complex');
      if(!updates) return [];
      options = foundry.utils.mergeObject(options, {overrides: {preserveData: true}}, {inplace: false});
    }

    /* insert token updates to modify token actor permission */
    MODULE.shimUpdate(updates);
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

    /* gather data needed for configuring the display of the crosshairs */
    const tokenImg = MODULE.isV10 ? protoData.texture.src : protoData.img;
    const rotation = updates.token?.rotation ?? protoData.rotation ?? 0;
    const crosshairsConfig = foundry.utils.mergeObject(options.crosshairs ?? {}, {
      size: protoData.width,
      icon: tokenImg,
      name: protoData.name,
      direction: 0,
    }, {inplace: true, overwrite: false});

    crosshairsConfig.direction += rotation;

    /** @type {CrosshairsData} */
    const templateData = await Gateway.showCrosshairs(crosshairsConfig, callbacks);

    const eventPayload = {
      templateData: (options.overrides?.includeRawData ?? false) ? templateData : {x: templateData.x, y: templateData.y, size: templateData.size, cancelled: templateData.cancelled},
      tokenData: (options.overrides?.includeRawData ?? false) ? protoData.toObject() : 'omitted',
      options,
    }

    await warpgate.event.notify(warpgate.EVENT.PLACEMENT, eventPayload);

    if (templateData.cancelled) return;

    let spawnLocation = {x: templateData.x, y:templateData.y}

    /* calculate any scaling that may have happened */
    const scale = templateData.size / protoData.width;

    /* insert changes from the template into the updates data */
    mergeObject(updates, {token: {rotation: templateData.direction, width: templateData.size, height: protoData.height*scale}});

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

    /* the provided update object will be mangled for our use -- copy it to
     * preserve the user's original input if requested (default).
     */
    if(!options.overrides?.preserveData) {
      updates = MODULE.copy(updates, 'error.badUpdate.complex');
      if(!updates) return [];
      options = foundry.utils.mergeObject(options, {overrides: {preserveData: true}}, {inplace: false});
    }

    MODULE.shimUpdate(updates);

    /* Detect if the protoData is actually a name, and generate token data */
    if (typeof protoData == 'string'){
      protoData = await MODULE.getTokenData(protoData, updates.token ?? {});
    }

    if (!protoData) return [];

    const sourceActor = game.actors.get(protoData.actorId);
    let createdIds = [];

    /* flag this user as the tokens's creator */
    const tokenFlags = {
      [MODULE.data.name]: {
        control: {user: game.user.id, actor: options.controllingActor?.uuid},
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

    if(options.notice) warpgate.plugin.notice({...spawnLocation, scene: canvas.scene}, options.notice); 

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
        await MODULE.updateProtoToken(protoData, updates.token);
      } else {
        /* get a fresh copy */
        protoData = await MODULE.getTokenData(game.actors.get(protoData.actorId), updates.token)
      }

      logger.debug(`Spawn iteration ${iteration} using`, protoData, updates);

      /* pan to token if first iteration */
      //TODO integrate into stock event data instead of hijacking mutate events

      /** @type Object */
      const spawnedTokenDoc = (await Gateway._spawnTokenAtLocation(protoData,
        spawnLocation,
        options.collision ?? (options.duplicates > 1)))[0];

      createdIds.push(spawnedTokenDoc.id);

      logger.debug('Spawned token with data: ', MODULE.isV10 ? spawnedTokenDoc : spawnedTokenDoc.data);

      await Mutator._updateActor(spawnedTokenDoc.actor, updates, options.comparisonKeys ?? {});

      const eventPayload = {
        uuid: spawnedTokenDoc.uuid,
        updates: (options.overrides?.includeRawData ?? false) ? updates : 'omitted',
        options,
        iteration
      } 

      await warpgate.event.notify(warpgate.EVENT.SPAWN, eventPayload);

      /* post creation callback */
      if (callbacks.post) {
        const response = await callbacks.post(spawnLocation, spawnedTokenDoc, updates, iteration);
        if(response === false) break;
      }
      
    }

    if (options.controllingActor?.sheet?.rendered) options.controllingActor?.sheet?.maximize();
    return createdIds;
  }

  /**
   * Helper function for displaying pings for or panning the camera of specific users.
   *
   * @param {{x: Number, y: Number, scene: Scene} | CrosshairsData} placement Information for the physical placement of the notice 
   * @param {NoticeConfig} [config] Configuration for the notice
   */
  static _notice({x, y, scene}, config = {}){

    config.sender ??= game.userId;
    config.receivers ??= warpgate.USERS.SELF;
    scene ??= canvas.scene;

    return Comms.requestNotice({x,y}, scene.id, config);
  }

}

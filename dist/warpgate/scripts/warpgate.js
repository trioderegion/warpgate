/** MIT (c) 2021 DnD5e Helpers */

/** @typedef {import('./api.js').NoticeConfig} NoticeConfig */

/** @ignore */
const NAME$3 = "warpgate";
/** @ignore */
const PATH = `/modules/${NAME$3}`;

class MODULE {
  static data = {
    name: NAME$3,
    path: PATH,
    title: "Warp Gate",
  };

  /**
   *
   *
   * @static
   * @param {*} shimId
   * @param {globalThis|*} [root=globalThis]
   * @returns {*|null}
   * @memberof MODULE
   */
  static compat(shimId, root = globalThis) {
    const gen = game.release?.generation;
    switch (shimId) {
      case "interaction.pointer":
        return (
          {
            10: root.canvas.app.renderer.plugins.interaction.mouse,
          }[gen] ?? canvas.app.renderer.events.pointer
        );
      case "crosshairs.computeShape":
        return (
          {
            10: () => {
              if (root.document.t != "circle") {
                logger$1.error("Non-circular Crosshairs is unsupported!");
              }
              return root._getCircleShape(root.ray.distance);
            },
          }[gen] ?? (() => root._computeShape())
        )();
      case "token.delta":
        return (
          {
            10: "actorData",
          }[gen] ?? "delta"
        );
      default:
        return null;
    }
  }

  static async register() {
    logger$1.info("Initializing Module");
    MODULE.settings();
  }

  static setting(key) {
    return game.settings.get(MODULE.data.name, key);
  }

  /**
   * Returns the localized string for a given warpgate scoped i18n key
   *
   * @ignore
   * @static
   * @param {*} key
   * @returns {string}
   * @memberof MODULE
   */
  static localize(key) {
    return game.i18n.localize(`warpgate.${key}`);
  }

  static format(key, data) {
    return game.i18n.format(`warpgate.${key}`, data);
  }

  static canSpawn(user) {
    const reqs = ["TOKEN_CREATE", "TOKEN_CONFIGURE", "FILES_BROWSE"];

    return MODULE.canUser(user, reqs);
  }

  static canMutate(user) {
    const reqs = ["TOKEN_CONFIGURE", "FILES_BROWSE"];

    return MODULE.canUser(user, reqs);
  }

  /**
   * Handles notice request from spawns and mutations
   *
   * @static
   * @param {{x: Number, y: Number}} location
   * @param {string} sceneId
   * @param {NoticeConfig} config
   * @memberof MODULE
   */
  static async handleNotice({ x, y }, sceneId, config) {
    /* can only operate if the user is on the scene requesting notice */
    if (
      canvas.ready &&
      !!sceneId &&
      !!config &&
      config.receivers.includes(game.userId) &&
      canvas.scene?.id === sceneId
    ) {
      const panSettings = {};
      const hasLoc = x !== undefined && y !== undefined;
      const doPan = !!config.pan;
      const doZoom = !!config.zoom;
      const doPing = !!config.ping;

      if (hasLoc) {
        panSettings.x = x;
        panSettings.y = y;
      }

      if (doPan) {
        panSettings.duration =
          Number.isNumeric(config.pan) && config.pan !== true
            ? Number(config.pan)
            : CONFIG.Canvas.pings.pullSpeed;
      }

      if (doZoom) {
        panSettings.scale = Math.min(CONFIG.Canvas.maxZoom, config.zoom);
      }

      if (doPan) {
        await canvas.animatePan(panSettings);
      }

      if (doPing && hasLoc) {
        const user = game.users.get(config.sender);
        const location = { x: panSettings.x, y: panSettings.y };

        /* draw the ping, either onscreen or offscreen */
        canvas.isOffscreen(location)
          ? canvas.controls.drawOffscreenPing(location, {
              scene: sceneId,
              style: CONFIG.Canvas.pings.types.ARROW,
              user,
            })
          : canvas.controls.drawPing(location, {
              scene: sceneId,
              style: config.ping,
              user,
            });
      }
    }
  }

  /**
   * @return {Array<String>} missing permissions for this operation
   */
  static canUser(user, requiredPermissions) {
    if (MODULE.setting("disablePermCheck")) return [];
    const { role } = user;
    const permissions = game.settings.get("core", "permissions");
    return requiredPermissions
      .filter((req) => !permissions[req].includes(role))
      .map((missing) =>
        game.i18n.localize(CONST.USER_PERMISSIONS[missing].label)
      );
  }

  /**
   * A helper functions that returns the first active GM level user.
   * @returns {User|undefined} First active GM User
   */
  static firstGM() {
    return game.users?.find((u) => u.isGM && u.active);
  }

  /**
   * Checks whether the user calling this function is the user returned
   * by {@link warpgate.util.firstGM}. Returns true if they are, false if they are not.
   * @returns {boolean} Is the current user the first active GM user?
   */
  static isFirstGM() {
    return game.user?.id === MODULE.firstGM()?.id;
  }

  static emptyObject(obj) {
    // @ts-ignore
    return foundry.utils.isEmpty(obj);
  }

  static removeEmptyObjects(obj) {
    let result = foundry.utils.flattenObject(obj);
    Object.keys(result).forEach((key) => {
      if (typeof result[key] == "object" && MODULE.emptyObject(result[key])) {
        delete result[key];
      }
    });

    return foundry.utils.expandObject(result);
  }

  /**
   * Duplicates a compatible object (non-complex).
   *
   * @returns {Object}
   */
  static copy(source, errorString = "error.unknown") {
    try {
      return foundry.utils.deepClone(source, { strict: true });
    } catch (err) {
      logger$1.catchThrow(err, MODULE.localize(errorString));
    }

    return;
  }

  /**
   * Removes top level empty objects from the provided object.
   *
   * @static
   * @param {object} obj
   * @memberof MODULE
   */
  static stripEmpty(obj, inplace = true) {
    const result = inplace ? obj : MODULE.copy(obj);

    Object.keys(result).forEach((key) => {
      if (typeof result[key] == "object" && MODULE.emptyObject(result[key])) {
        delete result[key];
      }
    });

    return result;
  }

  static ownerSublist(docList) {
    /* break token list into sublists by first owner */
    const subLists = docList.reduce((lists, doc) => {
      if (!doc) return lists;
      const owner = MODULE.firstOwner(doc)?.id ?? "none";
      lists[owner] ??= [];
      lists[owner].push(doc);
      return lists;
    }, {});

    return subLists;
  }

  /**
   * Returns the first active user with owner permissions for the given document,
   * falling back to the firstGM should there not be any. Returns false if the
   * document is falsey. In the case of token documents it checks the permissions
   * for the token's actor as tokens themselves do not have a permission object.
   *
   * @param {{ actor: Actor } | { document: { actor: Actor } } | Actor} doc
   *
   * @returns {User|undefined}
   */
  static firstOwner(doc) {
    /* null docs could mean an empty lookup, null docs are not owned by anyone */
    if (!doc) return undefined;

    /* while conceptually correct, tokens derive permissions from their
     * (synthetic) actor data.
     */
    const corrected =
      doc instanceof TokenDocument
        ? doc.actor
        : // @ts-ignore 2589
        doc instanceof Token
        ? doc.document.actor
        : doc;

    const permissionObject = getProperty(corrected ?? {}, "ownership") ?? {};

    const playerOwners = Object.entries(permissionObject)
      .filter(
        ([id, level]) =>
          !game.users.get(id)?.isGM && game.users.get(id)?.active && level === 3
      )
      .map(([id]) => id);

    if (playerOwners.length > 0) {
      return game.users.get(playerOwners[0]);
    }

    /* if no online player owns this actor, fall back to first GM */
    return MODULE.firstGM();
  }

  /**
   * Checks whether the user calling this function is the user returned by
   * {@link warpgate.util.firstOwner} when the function is passed the
   * given document. Returns true if they are the same, false if they are not.
   *
   * As `firstOwner`, biases towards players first.
   *
   * @returns {boolean} the current user is the first player owner. If no owning player, first GM.
   */
  static isFirstOwner(doc) {
    return game.user.id === MODULE.firstOwner(doc).id;
  }

  /**
   * Helper function. Waits for a specified amount of time in milliseconds (be sure to await!).
   * Useful for timings with animations in the pre/post callbacks.
   *
   * @param {Number} ms Time to delay, in milliseconds
   * @returns Promise
   */
  static async wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static async waitFor(fn, maxIter = 600, iterWaitTime = 100, i = 0) {
    const continueWait = (current, max) => {
      /* negative max iter means wait forever */
      if (maxIter < 0) return true;

      return current < max;
    };

    while (!fn(i, (i * iterWaitTime) / 100) && continueWait(i, maxIter)) {
      i++;
      await MODULE.wait(iterWaitTime);
    }
    return i === maxIter ? false : true;
  }

  static settings() {
    const data = {
      disablePermCheck: {
        config: true,
        scope: "world",
        type: Boolean,
        default: false,
      },
    };

    MODULE.applySettings(data);
  }

  static applySettings(settingsData) {
    Object.entries(settingsData).forEach(([key, data]) => {
      game.settings.register(MODULE.data.name, key, {
        name: MODULE.localize(`setting.${key}.name`),
        hint: MODULE.localize(`setting.${key}.hint`),
        ...data,
      });
    });
  }

  /**
   * @param {string|Actor} actorNameDoc
   * @param {object} tokenUpdates
   *
   * @returns {Promise<TokenDocument|false>}
   */
  static async getTokenData(actorNameDoc, tokenUpdates) {
    let sourceActor = actorNameDoc;
    if (typeof actorNameDoc == "string") {
      /* lookup by actor name */
      sourceActor = game.actors.getName(actorNameDoc);
    }

    //get source actor
    if (!sourceActor) {
      logger$1.error(
        `Could not find world actor named "${actorNameDoc}" or no souce actor document provided.`
      );
      return false;
    }

    //get prototoken data -- need to prepare potential wild cards for the template preview
    let protoData = await sourceActor.getTokenDocument(tokenUpdates);
    if (!protoData) {
      logger$1.error(`Could not find proto token data for ${sourceActor.name}`);
      return false;
    }

    await loadTexture(protoData.texture.src);

    return protoData;
  }

  static async updateProtoToken(protoToken, changes) {
    protoToken.updateSource(changes);
    const img = getProperty(changes, "texture.src");
    if (img) await loadTexture(img);
  }

  static getMouseStagePos() {
    const mouse = MODULE.compat("interaction.pointer");
    return mouse.getLocalPosition(canvas.app.stage);
  }

  /**
   * @returns {undefined} provided updates object modified in-place
   */
  static shimUpdate(updates) {
    updates.token = MODULE.shimClassData(
      TokenDocument.implementation,
      updates.token
    );
    updates.actor = MODULE.shimClassData(Actor.implementation, updates.actor);

    Object.keys(updates.embedded ?? {}).forEach((embeddedName) => {
      const cls = CONFIG[embeddedName].documentClass;

      Object.entries(updates.embedded[embeddedName]).forEach(
        ([shortId, data]) => {
          updates.embedded[embeddedName][shortId] =
            typeof data == "string" ? data : MODULE.shimClassData(cls, data);
        }
      );
    });
  }

  static shimClassData(cls, change) {
    if (!change) return change;

    if (!!change && !foundry.utils.isEmpty(change)) {
      /* shim data if needed */
      return cls.migrateData(foundry.utils.expandObject(change));
    }

    return foundry.utils.expandObject(change);
  }

  static getFeedbackSettings({
    alwaysAccept = false,
    suppressToast = false,
  } = {}) {
    const acceptSetting =
      MODULE.setting("alwaysAcceptLocal") == 0
        ? MODULE.setting("alwaysAccept")
        : { 1: true, 2: false }[MODULE.setting("alwaysAcceptLocal")];

    const accepted = !!alwaysAccept ? true : acceptSetting;

    const suppressSetting =
      MODULE.setting("suppressToastLocal") == 0
        ? MODULE.setting("suppressToast")
        : { 1: true, 2: false }[MODULE.setting("suppressToastLocal")];

    const suppress = !!suppressToast ? true : suppressSetting;

    return { alwaysAccept: accepted, suppressToast: suppress };
  }

  /**
   * Collects the changes in 'other' compared to 'base'.
   * Also includes "delete update" keys for elements in 'base' that do NOT
   * exist in 'other'.
   */
  static strictUpdateDiff(base, other) {
    /* get the changed fields */
    const diff = foundry.utils.flattenObject(
      foundry.utils.diffObject(base, other, { inner: true })
    );

    /* get any newly added fields */
    const additions = MODULE.unique(flattenObject(base), flattenObject(other));

    /* set their data to null */
    Object.keys(additions).forEach((key) => {
      if (typeof additions[key] != "object") diff[key] = null;
    });

    return foundry.utils.expandObject(diff);
  }

  static unique(object, remove) {
    // Validate input
    const ts = getType(object);
    const tt = getType(remove);
    if (ts !== "Object" || tt !== "Object")
      throw new Error("One of source or template are not Objects!");

    // Define recursive filtering function
    const _filter = function (s, t, filtered) {
      for (let [k, v] of Object.entries(s)) {
        let has = t.hasOwnProperty(k);
        let x = t[k];

        // Case 1 - inner object
        if (has && getType(v) === "Object" && getType(x) === "Object") {
          filtered[k] = _filter(v, x, {});
        }

        // Case 2 - inner key
        else if (!has) {
          filtered[k] = v;
        }
      }
      return filtered;
    };

    // Begin filtering at the outer-most layer
    return _filter(object, remove, {});
  }

  /**
   * Helper function for quickly creating a simple dialog with labeled buttons and associated data.
   * Useful for allowing a choice of actors to spawn prior to `warpgate.spawn`.
   *
   * @param {Object} data
   * @param {Array<{label: string, value:*}>} data.buttons
   * @param {string} [data.title]
   * @param {string} [data.content]
   * @param {Object} [data.options]
   *
   * @param {string} [direction = 'row'] 'column' or 'row' accepted. Controls layout direction of dialog.
   */
  static async buttonDialog(data, direction = "row") {
    return await new Promise(async (resolve) => {
      /** @type Object<string, object> */
      let buttons = {},
        dialog;

      data.buttons.forEach((button) => {
        buttons[button.label] = {
          label: button.label,
          callback: () => resolve(button.value),
        };
      });

      dialog = new Dialog(
        {
          title: data.title ?? "",
          content: data.content ?? "",
          buttons,
          close: () => resolve(false),
        },
        {
          /*width: '100%',*/
          height: "100%",
          ...data.options,
        }
      );

      await dialog._render(true);
      dialog.element.find(".dialog-buttons").css({
        "flex-direction": direction,
      });
    });
  }

  static dialogInputs = (data) => {
    /* correct legacy input data */
    data.forEach((inputData) => {
      if (inputData.type === "select") {
        inputData.options.forEach((e, i) => {
          switch (typeof e) {
            case "string":
              /* if we are handed legacy string values, convert them to objects */
              inputData.options[i] = { value: e, html: e };
            /* fallthrough to tweak missing values from object */

            case "object":
              /* if no HMTL provided, use value */
              inputData.options[i].html ??= inputData.options[i].value;

              /* sanity check */
              if (
                !!inputData.options[i].html &&
                inputData.options[i].value != undefined
              ) {
                break;
              }

            /* fallthrough to throw error if all else fails */

            default: {
              const emsg = MODULE.format("error.badSelectOpts", {
                fnName: "menu",
              });
              logger$1.error(emsg);
              throw new Error(emsg);
            }
          }
        });
      }
    });

    const mapped = data
      .map(({ type, label, value, options }, i) => {
        type = type.toLowerCase();
        switch (type) {
          case "header":
            return `<tr><td colspan = "2"><h2>${label}</h2></td></tr>`;
          case "button":
            return "";
          case "info":
            return `<tr><td colspan="2">${label}</td></tr>`;
          case "select": {
            const optionString = options
              .map((e, i) => {
                return `<option value="${i}">${e.html}</option>`;
              })
              .join("");

            return `<tr><th style="width:50%"><label>${label}</label></th><td style="width:50%"><select id="${i}qd">${optionString}</select></td></tr>`;
          }
          case "radio":
            return `<tr><th style="width:50%"><label>${label}</label></th><td style="width:50%"><input type="${type}" id="${i}qd" ${
              (options instanceof Array ? options[1] : false )
                ? "checked"
                : ""
            } value="${value ?? label}" name="${
              options instanceof Array ? options[0] : options ?? "radio"
            }"/></td></tr>`;
          case "checkbox":
            return `<tr><th style="width:50%"><label>${label}</label></th><td style="width:50%"><input type="${type}" id="${i}qd" ${
              (options instanceof Array ? options[0] : options ?? false)
                ? "checked"
                : ""
            } value="${value ?? label}"/></td></tr>`;
          default:
            return `<tr><th style="width:50%"><label>${label}</label></th><td style="width:50%"><input type="${type}" id="${i}qd" value="${
              options instanceof Array ? options[0] : options
            }"/></td></tr>`;
        }
      })
      .join(``);

    const content = `
<table style="width:100%">
  ${mapped}
</table>`;

    return content;
  };

  static async dialog(data = {}, title = "Prompt", submitLabel = "Ok") {
    logger$1.warn(
      `'warpgate.dialog' is deprecated and will be removed in version 1.17.0. See 'warpgate.menu' as a replacement.`
    );
    data = data instanceof Array ? data : [data];

    const results = await warpgate.menu(
      { inputs: data },
      { title, defaultButton: submitLabel }
    );
    if (results.buttons === false) return false;
    return results.inputs;
  }

  /**
   * Advanced dialog helper providing multiple input type options as well as user defined buttons.
   *
   * | `type` | `options` | Return Value | Notes |
   * |--|--|--|--|
   * | header | none | undefined | Shortcut for `info | <h2>text</h2>`. |
   * | info   | none | undefined | Inserts a line of text for display/informational purposes. |
   * | text | default value | {String} final value of text field | |
   * | password | (as `text`) | (as `text`) | Characters are obscured for security. |
   * | radio | [group name, default state (`false`)] {Array of Bool} | {Boolean} selected | For a given group name, only one radio button can be selected. |
   * | checkbox | default state (`false`) {Boolean} | {Boolean} checked | `label` is used for the HTML element's `name` property |
   * | number | (as `text`) | {Number} final value of text field converted to a number |
   * | select | array of option labels or objects {value, html} | `value` property of selected option. If values not provided, numeric index of option in original list | |
   * @static
   * @param {object} [prompts]
   * @param {Array<{label: string, type: string, options: any|Array<any>} >} [prompts.inputs=[]] follow the same structure as dialog
   * @param {Array<{label: string, value: any, default: false, callback: Function }>} [prompts.buttons=[]] as {@link buttonDialog} with an optional 'default' field where any truthy value sets the button as default for the 'submit' or 'ENTER' event; if none specified, the last button provided will be set as default
   * @param {object} [config]
   * @param {string} [config.title='Prompt'] Title of dialog
   * @param {string} [config.defaultButton='Ok'] default button label if no buttons provided
   * @param {function(HTMLElement) : void} [config.render=undefined]
   * @param {Function} [config.close = (resolve) => resolve({buttons: false})]
   * @param {object} [config.options = {}] Options passed to the Dialog constructor
   *
   * @return {Promise<{ inputs: Array<any>, buttons: any}>} Object with `inputs` containing the chosen values for each provided input,
   *   in order, and the provided `value` of the pressed button, or `false` if closed.
   *
   * @example
   * await warpgate.menu({
   *  inputs: [{
   *    label: 'My Way',
   *    type: 'radio',
   *    options: 'group1'
   *  }, {
   *    label: 'The Highway',
   *    type: 'radio',
   *    options: 'group1'
   *  }],
   *  buttons: [{
   *    label: 'Yes',
   *    value: 1,
   *    default: true
   *  }, {
   *    label: 'No',
   *    value: 2
   *  }, {
   *    label: 'Maybe',
   *    value: 3
   *  }, {
   *    label: 'Eventually',
   *    value: 4
   *  }]
   * }, {
   *  options: {
   *    width: '100px',
   *    height: '100%'
   *  }
   * })
   *
   */
  static async menu(prompts = {}, config = {}) {
    /* apply defaults to optional params */
    const configDefaults = {
      title: "Prompt",
      defaultButton: "Ok",
      render: null,
      close: (resolve) => resolve({ buttons: false }),
      options: {},
    };

    const { title, defaultButton, render, close, options } =
      foundry.utils.mergeObject(configDefaults, config);
    const { inputs, buttons } = foundry.utils.mergeObject(
      { inputs: [], buttons: [] },
      prompts
    );

    return await new Promise((resolve) => {
      let content = MODULE.dialogInputs(inputs);
      /** @type Object<string, object> */
      let buttonData = {};
      let def = buttons.at(-1)?.label;
      buttons.forEach((button) => {
        if ("default" in button) def = button.label;
        buttonData[button.label] = {
          label: button.label,
          callback: async (html) => {
            const results = {
              inputs: MODULE._innerValueParse(inputs, html),
              buttons: button.value,
            };
            if (button.callback instanceof Function)
              await button.callback(results, button, html);
            resolve(results);
          },
        };
      });

      /* insert standard submit button if none provided */
      if (buttons.length < 1) {
        def = defaultButton;
        buttonData = {
          [defaultButton]: {
            label: defaultButton,
            callback: (html) =>
              resolve({
                inputs: MODULE._innerValueParse(inputs, html),
                buttons: true,
              }),
          },
        };
      }

      new Dialog(
        {
          title,
          content,
          default: def,
          close: (...args) => close(resolve, ...args),
          buttons: buttonData,
          render,
        },
        { focus: true, ...options }
      ).render(true);
    });
  }

  static _innerValueParse(data, html) {
    return Array(data.length)
      .fill()
      .map((e, i) => {
        let { type } = data[i];
        if (type.toLowerCase() === `select`) {
          return data[i].options[html.find(`select#${i}qd`).val()].value;
        } else {
          switch (type.toLowerCase()) {
            case `text`:
            case `password`:
              return html.find(`input#${i}qd`)[0].value;
            case `radio`:
            case `checkbox`:
              return html.find(`input#${i}qd`)[0].checked;
            case `number`:
              return html.find(`input#${i}qd`)[0].valueAsNumber;
          }
        }
      });
  }
}

/** @ignore */
let logger$1 = class logger {
  static info(...args) {
    console.log(`${MODULE?.data?.title ?? ""}  | `, ...args);
  }
  static debug(...args) {
    if (MODULE.setting("debug"))
      console.debug(`${MODULE?.data?.title ?? ""}  | `, ...args);
  }

  static warn(...args) {
    console.warn(`${MODULE?.data?.title ?? ""} | WARNING | `, ...args);
    ui.notifications.warn(
      `${MODULE?.data?.title ?? ""} | WARNING | ${args[0]}`
    );
  }

  static error(...args) {
    console.error(`${MODULE?.data?.title ?? ""} | ERROR | `, ...args);
    ui.notifications.error(`${MODULE?.data?.title ?? ""} | ERROR | ${args[0]}`);
  }

  static catchThrow(thrown, toastMsg = undefined) {
    console.warn(thrown);
    if (toastMsg) logger.error(toastMsg);
  }

  static register() {
    this.settings();
  }

  static settings() {
    const config = true;
    const settingsData = {
      debug: {
        scope: "client",
        config,
        default: false,
        type: Boolean,
      },
    };

    MODULE.applySettings(settingsData);
  }
};

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


/** @typedef {import('@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/measuredTemplateData.js').MeasuredTemplateDataProperties} MeasuredTemplateProperties */

/**
 * Contains all fields from `MeasuredTemplate#toObject`, plus the following.
 * 
 * @typedef {Object} CrosshairsData
 * @borrows MeasuredTemplateProperties
 * @prop {boolean} cancelled Workflow cancelled via right click (true)
 * @prop {Scene} scene Scene on this crosshairs was last active
 * @prop {number} radius Final radius of template, in pixels
 * @prop {number} size Final diameter of template, in grid units
 */

/**
 * @class
 */
class Crosshairs extends MeasuredTemplate {

  //constructor(gridSize = 1, data = {}){
  constructor(config, callbacks = {}) {
    const templateData = {
      t: config.t ?? "circle",
      user: game.user.id,
      distance: config.size,
      x: config.x,
      y: config.y,
      fillColor: config.fillColor,
      width: 1,
      texture: config.texture,
      direction: config.direction,
    };

    const template = new CONFIG.MeasuredTemplate.documentClass(templateData, {parent: canvas.scene});
    super(template);

    /** @TODO all of these fields should be part of the source data schema for this class **/
    /**  image path to display in the center (under mouse cursor) */
    this.icon = config.icon ?? Crosshairs.ERROR_TEXTURE;

    /** text to display below crosshairs' circle */
    this.label = config.label;

    /** Offsets the default position of the label (in pixels) */
    this.labelOffset = config.labelOffset;

    /**
     * Arbitrary field used to identify this instance
     * of a Crosshairs in the canvas.templates.preview
     * list
     */
    this.tag = config.tag;

    /** Should the center icon be shown? */
    this.drawIcon = config.drawIcon;

    /** Should the outer circle be shown? */
    this.drawOutline = config.drawOutline;

    /** Opacity of the fill color */
    this.fillAlpha = config.fillAlpha;

    /** Should the texture (if any) be tiled
     * or scaled and offset? */
    this.tileTexture = config.tileTexture;

    /** locks the size of crosshairs (shift+scroll) */
    this.lockSize = config.lockSize;

    /** locks the position of crosshairs */
    this.lockPosition = config.lockPosition;

    /** Number of quantization steps along
     * a square's edge (N+1 snap points 
     * along each edge, conting endpoints)
     */
    this.interval = config.interval;

    /** Callback functions to execute
     * at particular times
     */
    this.callbacks = callbacks;

    /** Indicates if the user is actively 
     * placing the crosshairs.
     * Setting this to true in the show
     * callback will stop execution
     * and report the current mouse position
     * as the chosen location
     */
    this.inFlight = false;

    /** indicates if the placement of
     * crosshairs was canceled (with
     * a right click)
     */
    this.cancelled = true;

    /**
     * Indicators on where cancel was initiated
     * for determining if it was a drag or a cancel
     */
    this.rightX = 0;
    this.rightY = 0;

    /** @type {number} */
    this.radius = this.document.distance * this.scene.grid.size / 2;
  }

  /**
   * @returns {CrosshairsData} Current Crosshairs class data
   */
  toObject() {

    /** @type {CrosshairsData} */
    const data = foundry.utils.mergeObject(this.document.toObject(), {
      cancelled: this.cancelled,
      scene: this.scene,
      radius: this.radius,
      size: this.document.distance,
    });
    delete data.width;
    return data;
  }

  static ERROR_TEXTURE = 'icons/svg/hazard.svg'

  /**
   * Will retrieve the active crosshairs instance with the defined tag identifier.
   * @param {string} key Crosshairs identifier. Will be compared against the Crosshairs `tag` field for strict equality.
   * @returns {PIXI.DisplayObject|undefined}
   */
  static getTag(key) {
    return canvas.templates.preview.children.find( child => child.tag === key )
  }

  static getSnappedPosition({x,y}, interval){
    const offset = interval < 0 ? canvas.grid.size/2 : 0;
    const snapped = canvas.grid.getSnappedPosition(x - offset, y - offset, interval);
    return {x: snapped.x + offset, y: snapped.y + offset};
  }

  /* -----------EXAMPLE CODE FROM MEASUREDTEMPLATE.JS--------- */
  /* Portions of the core package (MeasuredTemplate) repackaged 
   * in accordance with the "Limited License Agreement for Module 
   * Development, found here: https://foundryvtt.com/article/license/ 
   * Changes noted where possible
   */

  /**
   * Set the displayed ruler tooltip text and position
   * @private
   */
  //BEGIN WARPGATE
  _setRulerText() {
    this.ruler.text = this.label;
    /** swap the X and Y to use the default dx/dy of a ray (pointed right)
    //to align the text to the bottom of the template */
    this.ruler.position.set(-this.ruler.width / 2 + this.labelOffset.x, this.template.height / 2 + 5 + this.labelOffset.y);
    //END WARPGATE
  }

  /** @override */
  async draw() {
    this.clear();

    // Load the texture
    const texture = this.document.texture;
    if ( texture ) {
      this._texture = await loadTexture(texture, {fallback: 'icons/svg/hazard.svg'});
    } else {
      this._texture = null;
    }

    // Template shape
    this.template = this.addChild(new PIXI.Graphics());

    // Rotation handle
    //BEGIN WARPGATE
    //this.handle = this.addChild(new PIXI.Graphics());
    //END WARPGATE

    // Draw the control icon
    //if(this.drawIcon) 
    this.controlIcon = this.addChild(this._drawControlIcon());

    // Draw the ruler measurement
    this.ruler = this.addChild(this._drawRulerText());

    // Update the shape and highlight grid squares
    this.refresh();
    //BEGIN WARPGATE
    this._setRulerText();
    //this.highlightGrid();
    //END WARPGATE

    // Enable interactivity, only if the Tile has a true ID
    if ( this.id ) this.activateListeners();
    return this;
  }

  /**
   * Draw the Text label used for the MeasuredTemplate
   * @return {PreciseText}
   * @protected
   */
  _drawRulerText() {
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = Math.max(Math.round(canvas.dimensions.size * 0.36 * 12) / 12, 36);
    const text = new PreciseText(null, style);
    //BEGIN WARPGATE
    //text.anchor.set(0.5, 0);
    text.anchor.set(0, 0);
    //END WARPGATE
    return text;
  }

  /**
   * Draw the ControlIcon for the MeasuredTemplate
   * @return {ControlIcon}
   * @protected
   */
  _drawControlIcon() {
    const size = Math.max(Math.round((canvas.dimensions.size * 0.5) / 20) * 20, 40);

    //BEGIN WARPGATE
    let icon = new ControlIcon({texture: this.icon, size: size});
    icon.visible = this.drawIcon;
    //END WARPGATE

    icon.pivot.set(size*0.5, size*0.5);
    //icon.x -= (size * 0.5);
    //icon.y -= (size * 0.5);
    icon.angle = this.document.direction;
    return icon;
  }

  /** @override */
  refresh() {
    if (!this.template) return;
    let d = canvas.dimensions;
    const document = this.document;
    this.position.set(document.x, document.y);

    // Extract and prepare data
    let {direction, distance} = document;
    distance *= (d.size/2);
    //BEGIN WARPGATE
    //width *= (d.size / d.distance);
    //END WARPGATE
    direction = Math.toRadians(direction);

    // Create ray and bounding rectangle
    this.ray = Ray.fromAngle(document.x, document.y, direction, distance);

    // Get the Template shape
    this.shape = MODULE.compat('crosshairs.computeShape', this);

    // Draw the Template outline
    this.template.clear()
      .lineStyle(this._borderThickness, this.borderColor, this.drawOutline ? 0.75 : 0);

    // Fill Color or Texture

    if (this._texture) {
      /* assume 0,0 is top left of texture
       * and scale/offset this texture (due to origin
       * at center of template). tileTexture indicates
       * that this texture is tilable and does not 
       * need to be scaled/offset */
      const scale = this.tileTexture ? 1 : distance * 2 / this._texture.width;
      const offset = this.tileTexture ? 0 : distance;
      this.template.beginTextureFill({
        texture: this._texture,
        matrix: new PIXI.Matrix().scale(scale, scale).translate(-offset, -offset)
      });
    } else {
      this.template.beginFill(this.fillColor, this.fillAlpha);
    }

    // Draw the shape
    this.template.drawShape(this.shape);

    // Draw origin and destination points
    //BEGIN WARPGATE
    //this.template.lineStyle(this._borderThickness, 0x000000, this.drawOutline ? 0.75 : 0)
    //  .beginFill(0x000000, 0.5)
    //.drawCircle(0, 0, 6)
    //.drawCircle(this.ray.dx, this.ray.dy, 6);
    //END WARPGATE

    // Update visibility
    if (this.drawIcon) {
      this.controlIcon.visible = true;
      this.controlIcon.border.visible = this._hover;
      this.controlIcon.angle = document.direction;
    }

    // Draw ruler text
    //BEGIN WARPGATE
    this._setRulerText();
    //END WARPGATE
    return this;
  }

  /* END MEASUREDTEMPLATE.JS USAGE */


  /* -----------EXAMPLE CODE FROM ABILITY-TEMPLATE.JS--------- */
  /* Foundry VTT 5th Edition
   * Copyright (C) 2019  Foundry Network
   *
   * This program is free software: you can redistribute it and/or modify
   * it under the terms of the GNU General Public License as published by
   * the Free Software Foundation, either version 3 of the License, or
   * (at your option) any later version.
   *
   * This program is distributed in the hope that it will be useful,
   * but WITHOUT ANY WARRANTY; without even the implied warranty of
   * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   * GNU General Public License for more details.
   *
   * Original License: 
   * https://gitlab.com/foundrynet/dnd5e/-/blob/master/LICENSE.txt
   */

  /**
   * Creates a preview of the spell template
   */
  async drawPreview() {
    // Draw the template and switch to the template layer
    this.initialLayer = canvas.activeLayer;
    this.layer.activate();
    this.draw();
    this.layer.preview.addChild(this);
    this.layer.interactiveChildren = false;

    // Hide the sheet that originated the preview
    //BEGIN WARPGATE
    this.inFlight = true;

    // Activate interactivity
    this.activatePreviewListeners();

    // Callbacks
    this.callbacks?.show?.(this);

    /* wait _indefinitely_ for placement to be decided. */
    await MODULE.waitFor(() => !this.inFlight, -1);
    if (this.activeHandlers) {
      this.clearHandlers();
    }

    //END WARPGATE
    return this;
  }

  /* -------------------------------------------- */

  _mouseMoveHandler(event) {
    event.stopPropagation();

    /* if our position is locked, do not update it */
    if (this.lockPosition) return;

    // Apply a 20ms throttle
    let now = Date.now();
    if (now - this.moveTime <= 20) return;

    const center = event.data.getLocalPosition(this.layer);
    const {x,y} = Crosshairs.getSnappedPosition(center, this.interval);
    this.document.updateSource({x, y});
    this.refresh();
    this.moveTime = now;

    if(now - this.initTime > 1000){
      logger.debug(`1 sec passed (${now} - ${this.initTime}) - panning`);
      canvas._onDragCanvasPan(event.data.originalEvent);
    }
  }

  _leftClickHandler(event) {
    const document = this.document;
    const thisSceneSize = this.scene.grid.size;

    const destination = Crosshairs.getSnappedPosition(this.document, this.interval);
    this.radius = document.distance * thisSceneSize / 2;
    this.cancelled = false;

    this.document.updateSource({ ...destination });
    
    this.clearHandlers(event);
  }

  // Rotate the template by 3 degree increments (mouse-wheel)
  // none = rotate 5 degrees
  // shift = scale size
  // ctrl = rotate 30 or 15 degrees (square/hex)
  // alt = zoom canvas
  _mouseWheelHandler(event) {

    if (event.ctrlKey) event.preventDefault(); // Avoid zooming the browser window
    if (!event.altKey) event.stopPropagation();

    const delta = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 30 : 15;
    const snap = event.ctrlKey ? delta : 5;
    //BEGIN WARPGATE
    const document = this.document;
    const thisSceneSize = this.scene.grid.size;
    if (event.shiftKey && !this.lockSize) {
      let distance = document.distance + 0.25 * (Math.sign(event.deltaY));
      distance = Math.max(distance, 0.25);
      this.document.updateSource({ distance });
      this.radius = document.distance * thisSceneSize / 2;
    } else if (!event.altKey) {
      const direction = document.direction + (snap * Math.sign(event.deltaY));
      this.document.updateSource({ direction });
    }
    //END WARPGATE
    this.refresh();
  }

  _rightDownHandler(event) {
    if (event.button !== 2) return;

    this.rightX = event.screenX;
    this.rightY = event.screenY;
  }

  _rightUpHandler(event) {
    if (event.button !== 2) return;

    const isWithinThreshold = (current, previous) => Math.abs(current - previous) < 10;
    if (isWithinThreshold(this.rightX, event.screenX)
      && isWithinThreshold(this.rightY, event.screenY)
    ) {
      this.cancelled = true;
      this.clearHandlers(event);
    }
  }

  _clearHandlers(event) {
    //WARPGATE BEGIN
    /* destroy ourselves */
    this.document.object.destroy();
    this.template.destroy();
    this.layer.preview.removeChild(this);
    this._destroyed = true;
    
    canvas.stage.off("mousemove", this.activeMoveHandler);
    canvas.stage.off("mousedown", this.activeLeftClickHandler);
    canvas.app.view.onmousedown = null;
    canvas.app.view.onmouseup = null;
    canvas.app.view.onwheel = null;

    // Show the sheet that originated the preview
    if (this.actorSheet) this.actorSheet.maximize();
    this.activeHandlers = false;
    this.inFlight = false;
	//WARPGATE END
    
    /* re-enable interactivity on this layer */
    this.layer.interactiveChildren = true;

    /* moving off this layer also deletes ALL active previews?
     * unexpected, but manageable
     */
    if (this.layer.preview.children.length == 0) {
      this.initialLayer.activate();
    }
  }

  /**
   * Activate listeners for the template preview
   */
  activatePreviewListeners() {
    this.moveTime =  0;
    this.initTime = Date.now();
    //BEGIN WARPGATE
    this.activeHandlers = true;

    /* Activate listeners */
    this.activeMoveHandler = this._mouseMoveHandler.bind(this);
    this.activeLeftClickHandler = this._leftClickHandler.bind(this);
    this.rightDownHandler = this._rightDownHandler.bind(this);
    this.rightUpHandler = this._rightUpHandler.bind(this);
    this.activeWheelHandler = this._mouseWheelHandler.bind(this);

    this.clearHandlers = this._clearHandlers.bind(this);

    // Update placement (mouse-move)
    canvas.stage.on("mousemove", this.activeMoveHandler);

    // Confirm the workflow (left-click)
    canvas.stage.on("mousedown", this.activeLeftClickHandler);

    // Mouse Wheel rotate
    canvas.app.view.onwheel = this.activeWheelHandler;

    // Right click cancel
    canvas.app.view.onmousedown = this.rightDownHandler;
    canvas.app.view.onmouseup = this.rightUpHandler;

    // END WARPGATE
  }

  /** END ABILITY-TEMPLATE.JS USAGE */
}

const NAME$2 = 'Events';

let watches = {};
let triggers = {};
let id = 0;

Array.prototype.removeIf = function (callback) {
  let i = this.length;
  while (i--) {
    if (callback(this[i], i)) {
      this.splice(i, 1);
      return true;
    }
  }

  return false;
};

class Events {

  /**
   * Similar in operation to `Hooks.on`, with two exceptions. First, the provided function 
   * can be asynchronous and will be awaited. Second, an optional `conditionFn` parameter 
   * is added to help compartmentalize logic between detecting the desired event and responding to said event.
   *
   * @param {String} name Event name to watch for; It is recommended to use the enums found in {@link warpgate.EVENT}
   * @param {function(object):Promise|void} fn Function to execute when this event has passed the condition function. Will be awaited
   * @param {function(object):boolean} [condition = ()=>true] Optional. Function to determine if the event function should 
   *  be executed. While not strictly required, as the `fn` function could simply return as a NOOP, providing this 
   *  parameter may help compartmentalize "detection" vs "action" processing.
   *
   * @returns {number} Function id assigned to this event, for use with {@link warpgate.event.remove}
   */
  static watch(name, fn, condition = () => {
    return true;
  }) {
    if (!watches[name]) watches[name] = [];
    id++;
    watches[name].push({
      fn,
      condition,
      id
    });
    return id;
  }

  /**
   * Identical to {@link warpgate.event.watch}, except that this function will only be called once, after the condition is met.
   *
   * @see {@link warpgate.event.watch}
   */
  static trigger(name, fn, condition = () => {
    return true;
  }) {
    if (!triggers[name]) triggers[name] = [];
    id++;
    triggers[name].push({
      fn,
      condition,
      id
    });
    return id;
  }


  static async run(name, data) {
    for (const {
        fn,
        condition,
        id
      } of watches[name] ?? []) {
      try {
        if (condition(data)) {
          logger$1.debug(`${name} | ${id} passes watch condition`);
          await fn(data);
        } else {
          logger$1.debug(`${name} | ${id} fails watch condition`);
        }
      } catch (e) {
        logger$1.error(`${NAME$2} | error`, e, `\n \nIn watch function (${name})\n`, fn);
      }
    }

    let {
      run,
      keep
    } = (triggers[name] ?? []).reduce((acum, elem) => {
      try {
        const passed = elem.condition(data);
        if (passed) {
          logger$1.debug(`${name} | ${elem.id} passes trigger condition`);
          acum.run.push(elem);
        } else {
          logger$1.debug(`${name} | ${elem.id} fails trigger condition`);
          acum.keep.push(elem);
        }
      } catch (e) {
        logger$1.error(`${NAME$2} | error`, e, `\n \nIn trigger condition function (${name})\n`, elem.condition);
        return acum;
      } finally {
        return acum;
      }
    }, {
      run: [],
      keep: []
    });

    for (const {
        fn,
        id
      } of run) {
      logger$1.debug(`${name} | calling trigger ${id}`);
      try {
        await fn(data);
      } catch (e) {
        logger$1.error(`${NAME$2} | error`, e, `\n \nIn trigger function (${name})\n`, fn);
      }
    }

    triggers[name] = keep;
  }

  /**
   * Removes a `watch` or `trigger` by its provided id -- obtained by the return value of `watch` and `trigger`.
   *
   * @param {number} id Numerical ID of the event function to remove.
   *
   * @see warpgate.event.watch
   * @see warpgate.event.trigger
   */
  static remove(id) {
    const searchFn = (elem) => {
      return elem.id === id
    };

    const tryRemove = (page) => page.removeIf(searchFn);

    const hookRemove = Object.values(watches).map(tryRemove).reduce((sum, current) => {
      return sum || current
    }, false);

    const triggerRemove = Object.values(triggers).map(tryRemove).reduce((sum, current) => {
      return sum || current
    }, false);

    return hookRemove || triggerRemove;
  }
}

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


/** @ignore */
const NAME$1 = "Mutator";

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
    MODULE[NAME$1] = {
      comparisonKey: 'name'
    };
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
      const _id = this.#idByQuery(collection, key, comparisonKey );
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
        else logger$1.debug('Delta Creation: Could not locate shorthand identified document for deletion.', collection, key, updates[key]);

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
        logger$1.info(badItemAdd);
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

    logger$1.debug(`Modify embedded ${embeddedName} of ${owner.name} from`, {adds: parsedAdds, updates: parsedUpdates, deletes: parsedDeletes});

    const {error, message} = Mutator._errorCheckEmbeddedUpdates( embeddedName, {add: parsedAdds, update: parsedUpdates, delete: parsedDeletes} );
    if(error) {
      logger$1.error(message);
      return false;
    }

    try {
      if (parsedAdds.length > 0) await owner.createEmbeddedDocuments(embeddedName, parsedAdds, updateOpts);
    } catch (e) {
      logger$1.error(e);
    } 

    try {
      if (parsedUpdates.length > 0) await owner.updateEmbeddedDocuments(embeddedName, parsedUpdates, updateOpts);
    } catch (e) {
      logger$1.error(e);
    }

    try {
      if (parsedDeletes.length > 0) await owner.deleteEmbeddedDocuments(embeddedName, parsedDeletes, updateOpts);
    } catch (e) {
      logger$1.error(e);
    }

    return true;
  }

  /* embeddedUpdates keyed by embedded name, contains shorthand */
  static async _updateEmbedded(owner, embeddedUpdates, comparisonKeys, updateOpts = {}){

    /* @TODO check for any recursive embeds*/
    if (embeddedUpdates?.embedded) delete embeddedUpdates.embedded;

    for(const embeddedName of Object.keys(embeddedUpdates ?? {})){
      await Mutator._performEmbeddedUpdates(owner, embeddedName, embeddedUpdates[embeddedName],
        comparisonKeys[embeddedName] ?? MODULE[NAME$1].comparisonKey,
        updateOpts[embeddedName] ?? {});
    }

  }

  /* updates the actor and any embedded documents of this actor */
  /* @TODO support embedded documents within embedded documents */
  static async _updateActor(actor, updates = {}, comparisonKeys = {}, updateOpts = {}) {

    logger$1.debug('Performing update on (actor/updates)',actor, updates, comparisonKeys, updateOpts);
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
    
    const neededPerms = MODULE.canMutate(game.user);
    if(neededPerms.length > 0) {
      logger$1.warn(MODULE.format('error.missingPerms', {permList: neededPerms.join(', ')}));
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
      logger$1.warn(MODULE.format('error.badMutate.duplicate', {name: mutateInfo.name}));
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
      logger$1.warn(MODULE.localize('error.offlineOwnerBatch'));
      logger$1.debug('Affected UUIDs:', tokenLists['none'].map( t => t.uuid ));
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

    });

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
      logger$1.warn(MODULE.localize('error.offlineOwnerBatch'));
      logger$1.debug('Affected UUIDs:', tokenLists['none'].map( t => t.uuid ));
      delete tokenLists['none'];
    }

    let promises = Reflect.ownKeys(tokenLists).map( (owner) => {
      if(owner == game.userId) {
        //self service mutate
        return tokenLists[owner].map( tokenDoc => warpgate.revert(tokenDoc, mutationName, options) );
      }

      /* is a remote update */
      return remoteBatchRevert( tokenLists[owner], {mutationName, options} );

    });

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
        logger$1.debug(err);
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
        if(options.comparisonKeys[embName] == 'id') options.comparisonKeys[embName] = '_id';

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
      await CanvasAnimation.getAnimation(tokenDoc.object.animationName)?.promise;
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
      logger$1.debug(`Provided actor is undefined or has no mutation stack. Cannot pop.`);
      return undefined;
    }

    let mutateData = undefined;

    if (!!mutationName) {
      /* find specific mutation */
      const index = mutateStack.findIndex( mutation => mutation.name === mutationName );

      /* check for no result and log */
      if ( index < 0 ) {
        logger$1.debug(`Could not locate mutation named ${mutationName} in actor ${actor.name}`);
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
        mutateData.delta = MODULE.unique(mutateData.delta, mutateStack[i].delta);
      }

    } else {
      /* pop the most recent mutation */
      mutateData = mutateStack.pop();
    }

    const newFlags = {[`${MODULE.data.name}.mutate`]: mutateStack};

    /* set the current mutation stack in the mutation data */
    foundry.utils.mergeObject(mutateData.delta, {actor: {flags: newFlags}});

    logger$1.debug(MODULE.localize('debug.finalRevertUpdate'), mutateData);

    return mutateData;
  }

  /* given a token document and the standard update object,
   * parse the changes that need to be applied to *reverse*
   * the mutate operation
   */
  static _createDelta(tokenDoc, updates, options) {

    /* get token changes */
    let tokenData = tokenDoc.toObject();
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

    logger$1.debug(MODULE.localize('debug.tokenDelta'), tokenDelta, MODULE.localize('debug.actorDelta'), actorDelta, MODULE.localize('debug.embeddedDelta'), embeddedDelta);

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
    embeddedFields.forEach( field => { delete actorData[field]; } );

    return actorData;
  }
}

const register$3 = Mutator.register, mutate = Mutator.mutate, revertMutation = Mutator.revertMutation, batchMutate = Mutator.batchMutate, batchRevert = Mutator.batchRevert, clean = Mutator.clean, _updateActor = Mutator._updateActor;

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


class RemoteMutator {

  static register() {
    RemoteMutator.settings();
  }

  static settings() {
    const config = true;
    const settingsData = {
      alwaysAccept: {
        scope: 'world', config, default: false, type: Boolean
      },
      suppressToast: {
        scope: 'world', config, default: false, type: Boolean
      },
      alwaysAcceptLocal: {
        scope: 'client', config, default: 0, type: Number,
        choices: {
          0: MODULE.localize('setting.option.useWorld'),
          1: MODULE.localize('setting.option.overrideTrue'),
          2: MODULE.localize('setting.option.overrideFalse'),
        }
      },
      suppressToastLocal: {
        scope: 'client', config, default: 0, type: Number,
        choices: {
          0: MODULE.localize('setting.option.useWorld'),
          1: MODULE.localize('setting.option.overrideTrue'),
          2: MODULE.localize('setting.option.overrideFalse'),
        }
      },
    };

    MODULE.applySettings(settingsData);
  }

  //responseData:
  //------
  //sceneId
  //userId
  //-------
  //accepted (bool)
  //tokenId
  //actorId
  //mutationId
  //updates (if mutate)

  /* create the needed trigger functions if there is a post callback to handle */
  static _createMutateTriggers( tokenDoc, {post = undefined}, options ) {

    const condition = (responseData) => {
      return responseData.tokenId === tokenDoc.id && responseData.mutationId === options.name;
    };

    /* craft the response handler
     * execute the post callback */
    const promise = new Promise( (resolve) => {
      const handleResponse = async (responseData) => {

        /* if accepted, run our post callback */
        const tokenDoc = game.scenes.get(responseData.sceneId).getEmbeddedDocument('Token', responseData.tokenId);
        if (responseData.accepted) {
          const info = MODULE.format('display.mutationAccepted', {mName: options.name, tName: tokenDoc.name});

          const {suppressToast} = MODULE.getFeedbackSettings(options.overrides);
          if(!suppressToast) ui.notifications.info(info);
        } else {
          const warn = MODULE.format('display.mutationRejected', {mName: options.name, tName: tokenDoc.name});
          if(!options.overrides?.suppressReject) ui.notifications.warn(warn);
        }

        /* only need to do this if we have a post callback */
        if (post) await post(tokenDoc, responseData.updates, responseData.accepted);
        resolve(responseData);
        return;
      };

      warpgate.event.trigger(warpgate.EVENT.MUTATE_RESPONSE, handleResponse, condition);
    });

    return promise;
  }

  static _createRevertTriggers( tokenDoc, mutationName = undefined, {callbacks={}, options = {}} ) {

    const condition = (responseData) => {
      return responseData.tokenId === tokenDoc.id && (responseData.mutationId === mutationName || !mutationName);
    };

    /* if no name provided, we are popping the last one */
    const mName = mutationName ? mutationName : warpgate.mutationStack(tokenDoc).last.name;

    /* craft the response handler
     * execute the post callback */
    const promise = new Promise(async (resolve) => {
      const handleResponse = async (responseData) => {
        const tokenDoc = game.scenes.get(responseData.sceneId).getEmbeddedDocument('Token', responseData.tokenId);

        /* if accepted, run our post callback */
        if (responseData.accepted) {
          const info = MODULE.format('display.revertAccepted', {mName , tName: tokenDoc.name});
          const {suppressToast} = MODULE.getFeedbackSettings(options.overrides);
          if(!suppressToast) ui.notifications.info(info);
        } else {
          const warn = MODULE.format('display.revertRejected', {mName , tName: tokenDoc.name});
          if(!options.overrides?.suppressReject) ui.notifications.warn(warn);
        }

        await callbacks.post?.(tokenDoc, responseData.updates, responseData.accepted);

        resolve(responseData);
        return;
      };

      warpgate.event.trigger(warpgate.EVENT.REVERT_RESPONSE, handleResponse, condition);
    });

    return promise;
  }

  static remoteMutate( tokenDoc, {updates, callbacks = {}, options = {}} ) {
    /* we need to make sure there is a user that can handle our resquest */
    if (!MODULE.firstOwner(tokenDoc)) {
      logger$1.error(MODULE.localize('error.noOwningUserMutate'));
      return false;
    }

    /* register our trigger for monitoring remote response.
     * This handles the post callback
     */
    const promise = RemoteMutator._createMutateTriggers( tokenDoc, callbacks, options );

    /* broadcast the request to mutate the token */
    requestMutate(tokenDoc.id, tokenDoc.parent.id, { updates, options });

    return promise;
  }

  /**
   *
   * @returns {Promise<Array<Object>>}
   */
  static async remoteBatchMutate( tokenDocs, {updates, callbacks = {}, options = {}} ) {
    /* follow normal protocol for initial requests.
     * if accepted, force accept and force suppress remaining token mutations
     * if rejected, bail on all further mutations for this owner */

    const firstToken = tokenDocs.shift();
    let results = [await warpgate.mutate(firstToken, updates, callbacks, options)];

    if (results[0].accepted) {

      const silentOptions = foundry.utils.mergeObject(options, { overrides: {alwaysAccept: true, suppressToast: true} }, {inplace: false});

      results = results.concat(tokenDocs.map( tokenDoc => {
        return warpgate.mutate(tokenDoc, updates, callbacks, silentOptions);
      }));

    } else {
      results = results.concat(tokenDocs.map( tokenDoc => ({sceneId: tokenDoc.parent.id, tokenId: tokenDoc.id, accepted: false})));
    }

    
    return results;
  }

  static remoteRevert( tokenDoc, {mutationId = null, callbacks={}, options = {}} = {} ) {
    /* we need to make sure there is a user that can handle our resquest */
    if (!MODULE.firstOwner(tokenDoc)) {
      logger$1.error(MODULE.format('error.noOwningUserRevert'));
      return false;
    }

    /* register our trigger for monitoring remote response.
     * This handles the post callback
     */
    const result = RemoteMutator._createRevertTriggers( tokenDoc, mutationId, {callbacks, options} );

    /* broadcast the request to mutate the token */
    requestRevert(tokenDoc.id, tokenDoc.parent.id, {mutationId, options});

    return result;
  }

  /**
   *
   * @returns {Promise<Array<Object>>}
   */
  static async remoteBatchRevert( tokenDocs, {mutationName = null, options = {}} = {} ) {

    /* follow normal protocol for initial requests.
     * if accepted, force accept and force suppress remaining token mutations
     * if rejected, bail on all further mutations for this owner */

    let firstToken = tokenDocs.shift();
    while( !!firstToken && warpgate.mutationStack(firstToken).stack.length == 0 ) firstToken = tokenDocs.shift();

    if(!firstToken) return [];

    const results = [await warpgate.revert(firstToken, mutationName, options)];

    if(results[0].accepted) {

      const silentOptions = foundry.utils.mergeObject(options, {
          overrides: {alwaysAccept: true, suppressToast: true}
        }, {inplace: false}
      );

      results.push(...(tokenDocs.map( tokenDoc => {
        return warpgate.revert(tokenDoc, mutationName, silentOptions);
      })));
    } else {
      results.push(...tokenDocs.map( tokenDoc => ({sceneId: tokenDoc.parent.id, tokenId: tokenDoc.id, accepted: false})));
    }

    return results;
  }

  static async handleMutationRequest(payload) {
    
    /* First, are we the first player owner? If not, stop, they will handle it */
    const tokenDoc = game.scenes.get(payload.sceneId).getEmbeddedDocument('Token', payload.tokenId);

    if (MODULE.isFirstOwner(tokenDoc.actor)) {

      let {alwaysAccept: accepted, suppressToast} = MODULE.getFeedbackSettings(payload.options.overrides);
      
      if(!accepted) {
        accepted = await RemoteMutator._queryRequest(tokenDoc, payload.userId, payload.options.description, payload.updates);

        /* if a dialog is shown, the user knows the outcome */
        suppressToast = true;
      }

      let responseData = {
        sceneId: payload.sceneId,
        userId: game.user.id,
        accepted,
        tokenId: payload.tokenId,
        mutationId: payload.options.name,
        options: payload.options,
      };

      await warpgate.event.notify(warpgate.EVENT.MUTATE_RESPONSE, responseData);

      if (accepted) {
        /* first owner accepts mutation -- apply it */
        /* requests will never have callbacks */
        await mutate(tokenDoc, payload.updates, {}, payload.options);
        const message = MODULE.format('display.mutationRequestTitle', {userName: game.users.get(payload.userId).name, tokenName: tokenDoc.name});
        
        if(!suppressToast) ui.notifications.info(message);
      }
    }
  }

  static async handleRevertRequest(payload) {

    /* First, are we the first player owner? If not, stop, they will handle it */
    const tokenDoc = game.scenes.get(payload.sceneId).getEmbeddedDocument('Token', payload.tokenId);

    if (MODULE.isFirstOwner(tokenDoc.actor)) {

      const stack = warpgate.mutationStack(tokenDoc);
      if( (stack.stack ?? []).length == 0 ) return;
      const details = payload.mutationId ? stack.getName(payload.mutationId) : stack.last;
      const description = MODULE.format('display.revertRequestDescription', {mName: details.name, tName: tokenDoc.name});

      let {alwaysAccept: accepted, suppressToast} = MODULE.getFeedbackSettings(payload.options.overrides);

      if(!accepted) {
        accepted = await RemoteMutator._queryRequest(tokenDoc, payload.userId, description, details );
        suppressToast = true;
      }

      let responseData = {
        sceneId: payload.sceneId,
        userId: game.user.id,
        accepted,
        tokenId: payload.tokenId,
        mutationId: payload.mutationId
      };

      await warpgate.event.notify(warpgate.EVENT.REVERT_RESPONSE, responseData);

      /* if the request is accepted, do the revert */
      if (accepted) {
        await revertMutation(tokenDoc, payload.mutationId, payload.options);

        if (!suppressToast) { 
          ui.notifications.info(description);
        }
      }

    }
  }

  static async _queryRequest(tokenDoc, requestingUserId, description = 'warpgate.display.emptyDescription', detailsObject) {

    /* if this is update data, dont include the mutate data please, its huge */
    let displayObject = duplicate(detailsObject);
    if (displayObject.actor?.flags?.warpgate) {
      displayObject.actor.flags.warpgate = {};
    }

    displayObject = MODULE.removeEmptyObjects(displayObject);

    const details = RemoteMutator._convertObjToHTML(displayObject);

    const modeSwitch = {
      description: {label: MODULE.localize('display.inspectLabel'), value: 'inspect', content: `<p>${game.i18n.localize(description)}</p>`},
      inspect: {label: MODULE.localize('display.descriptionLabel'), value: 'description', content: details }
    };

    const title = MODULE.format('display.mutationRequestTitle', {userName: game.users.get(requestingUserId).name, tokenName: tokenDoc.name});

    let userResponse = false;
    let modeButton = modeSwitch.description;

    do {
      userResponse = await warpgate.buttonDialog({buttons: [{label: MODULE.localize('display.findTargetLabel'), value: 'select'}, {label: MODULE.localize('display.acceptLabel'), value: true}, {label: MODULE.localize('display.rejectLabel'), value: false}, modeButton], content: modeButton.content, title, options: {top: 100}});

      if (userResponse === 'select') {
        if (tokenDoc.object) {
          tokenDoc.object.control({releaseOthers: true});
          await canvas.animatePan({x: tokenDoc.object.x, y: tokenDoc.object.y});
        }
      } else if (userResponse !== false && userResponse !== true) {
        /* swap modes and re-render */
        modeButton = modeSwitch[userResponse];
      }

    } while (userResponse !== false && userResponse !== true)

    return userResponse;

  }

  static _convertObjToHTML(obj) {
    const stringified = JSON.stringify(obj, undefined, '$SPACING');
    return stringified.replaceAll('\n', '<br>').replaceAll('$SPACING', '&nbsp;&nbsp;&nbsp;&nbsp;');
  }

}

const register$2 = RemoteMutator.register, handleMutationRequest = RemoteMutator.handleMutationRequest, handleRevertRequest = RemoteMutator.handleRevertRequest, remoteMutate = RemoteMutator.remoteMutate, remoteRevert = RemoteMutator.remoteRevert, remoteBatchMutate = RemoteMutator.remoteBatchMutate, remoteBatchRevert = RemoteMutator.remoteBatchRevert;

/*
 * MIT License
 * 
 * Copyright (c) 2021 DnD5e Helpers Team
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

let updateQueues = new Map();

/** 
 * Safely manages concurrent updates to the provided entity type
 * @function warpgate.plugin.queueUpdate
 * @param {Function} updateFn   the function that handles the actual update (can be async)
 */
function queueUpdate(updateFn) {

  /** queue the update for this entity */
  getQueue().queueUpdate(updateFn);
}

function getQueue(entity = "default"){
  /** if this is a new entity type, create the queue object to manage it */
  if(!updateQueues.has(entity)) {
    updateQueues.set(entity, new UpdateQueue(entity));
  }

  /** queue the update for this entity */
  return updateQueues.get(entity);
}

/** 
 * Helper class to manage database updates that occur from
 * hooks that may fire back to back.
 * @ignore
 */
class UpdateQueue {
  constructor(entityType) {

    /** self identification */
    this.entityType = entityType;

    /** buffer of update functions to run */
    this.queue = [];

    /** Semaphore for 'batch update in progress' */
    this.inFlight = false;
  }

  queueUpdate(fn) {
    this.queue.push(fn);

    /** only kick off a batch of updates if none are in flight */
    if (!this.inFlight) {
      this.runUpdate();
    }
  }

  flush() {
    return MODULE.waitFor( () => !this.inFlight )
  }

  async runUpdate(){

    this.inFlight = true;

    while(this.queue.length > 0) {


      /** grab the last update in the list and hold onto its index
       *  in case another update pushes onto this array before we
       *  are finished.
       */
      const updateIndex = this.queue.length-1;
      const updateFn = this.queue[updateIndex];

      /** wait for the update to complete */
      await updateFn();

      /** remove this entry from the queue */
      this.queue.splice(updateIndex,1);
    }

    this.inFlight = false;

  }
}

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


const ops = {
  DISMISS_SPAWN: "dismiss", //tokenId, sceneId, userId
  EVENT: "event", //name, ...payload
  REQUEST_MUTATE: "req-mutate", // ...payload
  REQUEST_REVERT: "req-revert", // ...payload
  NOTICE: "req-notice",
};

class Comms {
  static register() {
    Comms.hooks();
  }

  static hooks() {
    Hooks.on("ready", Comms._ready);
  }

  static _ready() {
    logger$1.info("Registering sockets");

    game.socket.on(`module.${MODULE.data.name}`, Comms._receiveSocket);
  }

  static _receiveSocket(socketData) {
    logger$1.debug("Received socket data => ", socketData);

    /* all users should immediately respond to notices */
    if (socketData.op == ops.NOTICE) {
      MODULE.handleNotice(
        socketData.payload.location,
        socketData.payload.sceneId,
        socketData.payload.options
      );
      return socketData;
    }

    queueUpdate(async () => {
      logger$1.debug("Routing operation: ", socketData.op);
      switch (socketData.op) {
        case ops.DISMISS_SPAWN:
          await handleDismissSpawn(socketData.payload);
          break;
        case ops.EVENT:
          /* all users should respond to events */
          await Events.run(socketData.eventName, socketData.payload);
          break;
        case ops.REQUEST_MUTATE:
          /* First owner of this target token/actor should respond */
          await handleMutationRequest(socketData.payload);
          break;
        case ops.REQUEST_REVERT:
          /* First owner of this target token/actor should respond */
          await handleRevertRequest(socketData.payload);
          break;
        default:
          logger$1.error("Unrecognized socket request", socketData);
          break;
      }
    });

    return socketData;
  }

  static _emit(socketData) {
    game.socket.emit(`module.${MODULE.data.name}`, socketData);

    /* always send events to self as well */
    return Comms._receiveSocket(socketData);
  }

  static requestDismissSpawn(tokenId, sceneId) {
    /** craft the socket data */
    const data = {
      op: ops.DISMISS_SPAWN,
      payload: { tokenId, sceneId, userId: game.user.id },
    };

    return Comms._emit(data);
  }

  /*
   * payload = {userId, tokenId, sceneId, updates, options}
   */
  static requestMutate(
    tokenId,
    sceneId,
    { updates = {}, options = {} } = {},
    onBehalf = game.user.id
  ) {
    /* insert common fields */
    const payload = {
      userId: onBehalf,
      tokenId,
      sceneId,
      updates,
      options,
    };

    /* craft the socket data */
    const data = {
      op: ops.REQUEST_MUTATE,
      payload,
    };

    return Comms._emit(data);
  }

  static requestRevert(
    tokenId,
    sceneId,
    { mutationId = undefined, onBehalf = game.user.id, options = {} }
  ) {
    /* insert common fields */
    const payload = {
      userId: onBehalf,
      tokenId,
      sceneId,
      mutationId,
      options,
    };

    /* craft the socket data */
    const data = {
      op: ops.REQUEST_REVERT,
      payload,
    };

    return Comms._emit(data);
  }

  static requestNotice(location, sceneId = canvas.scene?.id, options = {}) {
    const data = {
      op: ops.NOTICE,
      payload: {
        sceneId,
        location,
        options,
      },
    };

    return Comms._emit(data);
  }

  static packToken(tokenDoc) {
    const tokenData = tokenDoc.toObject();
    delete tokenData.actorData;
    delete tokenData.delta;

    let actorData = tokenDoc.actor?.toObject() ?? {};
    actorData.token = tokenData;
    return actorData;
  }

  /**
   * Allow custom events to be fired using the Warp Gate event system. Is broadcast to all users, including the initiator.
   * Like Hooks, these functions cannot be awaited for a response, but all event functions executing on a given client
   * will be evaluated in order of initial registration and the processing of the event functions will respect
   * (and await) returned Promises.
   *
   * @param {string} name Name of this event. Watches and triggers use this name to register themselves.
   *  Like Hooks, any string can be used and it is dependent upon the watch or trigger registration to monitor the correct event name.
   * @param {object} [payload={sceneId: canvas.scene.id, userId: game.user.id}] eventData {Object} The data that will be
   *  provided to watches and triggers and their condition functions.
   * @param {string} [onBehalf=game.user.id] User ID that will be used in place of the current user in the
   *  cases of a relayed request to the GM (e.g. dismissal).
   *
   * @returns {Object} Data object containing the event's payload (execution details), and identifying metadata about
   *  this event, sent to all watching and triggering clients.
   */
  static notifyEvent(name, payload = {}, onBehalf = game.user?.id) {
    /** insert common fields */
    payload.sceneId = canvas.scene?.id;
    payload.userId = onBehalf;

    /* craft the socket data */
    const data = {
      op: ops.EVENT,
      eventName: name,
      payload,
    };

    return Comms._emit(data);
  }
}

const register$1 = Comms.register,
  requestMutate = Comms.requestMutate,
  requestRevert = Comms.requestRevert,
  packToken = Comms.packToken,
  requestDismissSpawn = Comms.requestDismissSpawn,
  notifyEvent = Comms.notifyEvent,
  requestNotice = Comms.requestNotice;

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
      logger$1.debug(
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
      logger$1.debug(`Token [${tokenId}] no longer exists on scene [${sceneId}]`);
      return;
    }

    /* check for permission to delete freely */
    if (!MODULE.setting("openDelete")) {
      /* check permissions on token */
      if (!tokenData.isOwner) {
        logger$1.error(MODULE.localize("error.unownedDelete"));
        return;
      }
    }

    logger$1.debug(`Deleting ${tokenData.uuid}`);

    if (!MODULE.firstGM()) {
      logger$1.error(MODULE.localize("error.noGm"));
      return;
    }

    /** first gm drives */
    if (MODULE.isFirstGM()) {
      
      if( tokenData.isLinked ) {
        logger$1.debug('...and removing control flag from linked token actor');
        await tokenData.actor?.unsetFlag(MODULE.data.name, 'control');
      }
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
        logger$1.info(MODULE.localize("error.noOpenLocation"));
      } else {
        loc = openPosition;
      }
    }

    protoToken.updateSource(loc);

    return canvas.scene.createEmbeddedDocuments("Token", [protoToken]);
  }
}

const register = Gateway.register,
  dismissSpawn = Gateway.dismissSpawn,
  showCrosshairs = Gateway.showCrosshairs,
  collectPlaceables = Gateway.collectPlaceables,
  _rollItemGetLevel = Gateway._rollItemGetLevel,
  handleDismissSpawn = Gateway.handleDismissSpawn,
  _spawnTokenAtLocation = Gateway._spawnTokenAtLocation;

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


/** @typedef {import('./api.js').Shorthand} Shorthand */
/** @typedef {import('./api.js').ComparisonKeys} ComparisonKeys */

/** 
 * @typedef {Object} MutationData
 * @property {Shorthand} delta
 * @property {string} user
 * @property {ComparisonKeys} comparisonKeys
 * @property {Shorthand} updateOpts
 * @property {object} overrides
 * @property {string} name
 */

/**
 * The following class and its utility methods allows safer and more direct modification of the mutation stack,
 * which is stored on a token's actor. This mutation stack stores the information needed to _revert_ the changes
 * made by a mutation. This could be used, for example, to deal with rollover damage where the hit point value
 * being reverted to is lower than when the mutation was first applied.
 * 
 * Searching and querying a given mutation is a quick, read-only process. When the mutation stack is modified 
 * via one of its class methods, the actor's mutation data at that point in time will be copied for fast, local updates.
 *
 * No changes will be made to the actor's serialized data until the changes have been commited ({@link MutationStack#commit}).
 * The MutationStack object will then be locked back into a read-only state sourced with this newly updated data.
 */
class MutationStack {
  constructor(tokenDoc) {

    this.actor = tokenDoc instanceof TokenDocument ? tokenDoc.actor :
                    tokenDoc instanceof Token ? tokenDoc.document.actor :
                    tokenDoc instanceof Actor ? tokenDoc :
                    null;

    if(!this.actor) {
      throw new Error(MODULE.localize('error.stack.noActor'));
    }

  }

  /**
   * Private copy of the working stack (mutable)
   * @type {Array<MutationData>}
   */
  #stack = [];

  /** indicates if the stack has been duplicated for modification */
  #locked = true;

  /**
   * Current stack, according to the remote server (immutable)
   * @const
   * @type {Array<MutationData>}
   */
  get #liveStack() {
    // @ts-ignore
    return this.actor?.getFlag(MODULE.data.name, 'mutate') ?? [] 
  }

  /** 
   * Mutation stack according to its lock state.
   * @type {Array<MutationData>} 
   */
  get stack() {
    return this.#locked ? this.#liveStack : this.#stack ;
  }

  /**
   * @callback FilterFn
   * @param {MutationData} mutation
   * @returns {boolean} provided mutation meets criteria
   * @memberof MutationStack
   */

  /**
   * Searches for an element of the mutation stack that satisfies the provided predicate
   *
   * @param {FilterFn} predicate Receives the argments of `Array.prototype.find` 
   *  and should return a boolean indicating if the current element satisfies the predicate condition
   * @return {MutationData|undefined} Element of the mutation stack that matches the predicate, or undefined if none.
   */
  find(predicate) {
    if (this.#locked) return this.#liveStack.find(predicate);

    return this.#stack.find(predicate);
  }

  /**
   * Searches for an element of the mutation stack that satisfies the provided predicate and returns its
   * stack index
   *
   * @param {FilterFn} predicate Receives the argments of {@link Array.findIndex} and returns a Boolean indicating if the current
   *                             element satisfies the predicate condition
   * @return {Number} Index of the element of the mutation stack that matches the predicate, or undefined if none.
   */
  #findIndex( predicate ) {

    if (this.#locked) return this.#liveStack.findIndex(predicate);

    return this.#stack.findIndex(predicate);
  }

  /**
   * Retrieves an element of the mutation stack that matches the provided name
   *
   * @param {String} name Name of mutation (serves as a unique identifier)
   * @return {MutationData|undefined} Element of the mutation stack matching the provided name, or undefined if none
   */
  getName(name) {
    return this.find((element) => element.name === name);
  }

  /**
   * Retrieves that last mutation added to the mutation stack (i.e. the "newest"), 
   * or undefined if none present
   * @type {MutationData}
   */
  get last() {
    return this.stack[this.stack.length - 1];
  }

  /**
   * Updates the mutation matching the provided name with the provided mutation info.
   * The mutation info can be a subset of the full object if (and only if) overwrite is false.
   *
   * @param {string} name name of mutation to update
   * @param {MutationData} data New information, can include 'name'.
   * @param {object} options
   * @param {boolean} [options.overwrite = false] default will merge the provided info
   *            with the current values. True will replace the entire entry and requires
   *            at least the 'name' field.
   *  
   * @return {MutationStack} self, unlocked for writing and updates staged if update successful
   */
  update(name, data, {
    overwrite = false
  }) {
    const index = this.#findIndex((element) => element.name === name);

    if (index < 0) {
      return this;
    }

    this.#unlock();

    if (overwrite) {

      /* we need at LEAST a name to identify by */
      if (!data.name) {
        logger$1.error(MODULE.localize('error.incompleteMutateInfo'));
        this.#locked=true; 
        return this;
      }

      /* if no user is provided, input current user. */
      if (!data.user) data.user = game.user.id;
      this.#stack[index] = data;

    } else {
      /* incomplete mutations are fine with merging */
      mergeObject(this.#stack[index], data);
    }

    return this;
  }

  /**
   * Applies a given change or tranform function to the current buffer,
   * unlocking if needed.
   *
   * @param {MutationData|function(MutationData) : MutationData} transform Object to merge or function to generate an object to merge from provided {@link MutationData}
   * @param {FilterFn} [filterFn = () => true] Optional function returning a boolean indicating 
   *   if this element should be modified. By default, affects all elements of the mutation stack.
   * @return {MutationStack} self, unlocked for writing and updates staged.
   */
  updateAll(transform, filterFn = () => true) {

    const innerUpdate = (transform) => {
      if (typeof transform === 'function') {
        /* if we are applying a transform function */
        return (element) => mergeObject(element, transform(element));
      } else {
        /* if we are applying a constant change */
        return (element) => mergeObject(element, transform);
      }
    };

    this.#unlock();

    this.#stack.forEach((element) => {
      if (filterFn(element)) {
        innerUpdate(transform)(element);
      }
    });

    return this;
  }

  /**
   * Deletes all mutations from this actor's stack, effectively making
   * the current changes permanent.
   *
   * @param {function(MutationData):boolean} [filterFn = () => true] Optional function returning a boolean indicating if this
   *                   element should be delete. By default, deletes all elements of the mutation stack.
   * @return {MutationStack} self, unlocked for writing and updates staged.
   */
  deleteAll(filterFn = () => true) {
    this.#unlock();

    this.#stack = this.#stack.filter((element) => !filterFn(element));

    return this;
  }

  /**
   * Updates the owning actor with the mutation stack changes made. Will not commit a locked buffer.
   *
   * @return {Promise<MutationStack>} self, locked for writing
   */
  async commit() {

    if(this.#locked) {
      logger$1.error(MODULE.localize('error.stackLockedOrEmpty'));
    }

    await this.actor.update({
      flags: {
        [MODULE.data.name]: {
          'mutate': this.#stack
        }
      }
    });

    /* return to a locked read-only state */
    this.#locked = true;
    this.#stack.length = 0;

    return this;
  }

  /**
   * Unlocks the current buffer for writing by copying the mutation stack into this object.
   *
   * @return {boolean} Indicates if the unlock occured. False indicates the buffer was already unlocked.
   */
  #unlock() {

    if (!this.#locked) {
      return false;
    }

    this.#stack = duplicate(this.#liveStack);
    this.#locked = false;
    return true;
  }

}

/* theripper93
 * Copyright (C) 2021 dnd-randomizer
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * Original License:
 * https://github.com/theripper93/dnd-randomizer/blob/master/LICENSE
 */

/* WARPGATE CHANGES
 * exporting propagator class
 * removed test function from original code
 */

class Propagator {
  // Find a non-occupied cell in the grid that matches the size of the token given an origin
  static getFreePosition(tokenData, origin, collision = true) {
    const center = canvas.grid.getCenter(origin.x, origin.y);
    origin = { x: center[0], y: center[1] };
    const positions = Propagator.generatePositions(origin);
    for (let position of positions) {
      if (Propagator.canFit(tokenData, position, positions[0], collision)) {
        return position;
      }
    }
  }
  //generate positions radiantially from the origin
  static generatePositions(origin) {
    let positions = [
      canvas.grid.getSnappedPosition(origin.x - 1, origin.y - 1),
    ];
    for (
      let r = canvas.scene.dimensions.size;
      r < canvas.scene.dimensions.size * 10;
      r += canvas.scene.dimensions.size
    ) {
      for (
        let theta = 0;
        theta < 2 * Math.PI;
        theta += Math.PI / ((4 * r) / canvas.scene.dimensions.size)
      ) {
        const newPos = canvas.grid.getTopLeft(
          origin.x + r * Math.cos(theta),
          origin.y + r * Math.sin(theta)
        );
        positions.push({ x: newPos[0], y: newPos[1] });
      }
    }
    return positions;
  }
  //check if a position is free
  static isFree(position) {
    for (let token of canvas.tokens.placeables) {
      const hitBox = new PIXI.Rectangle(token.x, token.y, token.w, token.h);
      if (hitBox.contains(position.x, position.y)) {
        return false;
      }
    }
    return true;
  }
  //check if a token can fit in a position
  static canFit(tokenData, position, origin, collision) {
    for (let i = 0; i < tokenData.width; i++) {
      for (let j = 0; j < tokenData.height; j++) {
        const x = position.x + j;
        const y = position.y + i;
        if (!Propagator.isFree({ x, y })) {
          return false;
        }
      }
    }
    const wallCollisions =
      canvas.walls.checkCollision(
        new Ray(origin, {
          x: position.x + tokenData.width / 2,
          y: position.y + tokenData.height / 2,
        }),
        { type: "move" }
      )?.length ?? 0;

    return !collision || !wallCollisions;
  }
}

/**
 * Generator function for exploring vertex-connected grid locations in an
 * outward "ring" pattern.
 *
 * @export
 * @generator
 * @name warpgate.util.RingGenerator
 * @param {{x:Number, y:Number}} origin Staring location (pixels) for search
 * @param {Number} numRings
 * @yields {{x: Number, y: Number}} pixel location of next grid-ring-connected origin
 */
function* RingGenerator(origin, numRings) {
  const gridLoc = canvas.grid.grid.getGridPositionFromPixels(
    origin.x,
    origin.y
  );

  const positions = new Set();

  const seen = (position) => {
    const key = position.join(".");
    if (positions.has(key)) return true;

    positions.add(key);
    return false;
  };

  seen(gridLoc);
  let queue = [gridLoc];
  let ring = 0;

  /* include seed point in iterator */
  yield { x: origin.x, y: origin.y };

  /* if this is off-grid, also check the snap location */
  const snapped = canvas.grid.getSnappedPosition(origin.x, origin.y);
  const snappedIndex = canvas.grid.grid.getGridPositionFromPixels(
    snapped.x,
    snapped.y
  );
  if (!seen(snappedIndex)) {
    queue = [snappedIndex];
    yield snapped;
  }

  while (queue.length > 0 && ring < numRings) {
    const next = queue.flatMap((loc) => canvas.grid.grid.getNeighbors(...loc));
    queue = next.filter((loc) => !seen(loc));

    for (const loc of queue) {
      const [x, y] = canvas.grid.grid.getPixelsFromGridPosition(...loc);
      yield { x, y };
    }

    ring += 1;
  }

  return { x: null, y: null };
}

/**
 * Utility class for locating a free area on the grid from
 * a given initial 'requested' position. Effectively slides
 * the requested position to a nearby position free of other
 * tokens (by default, but accepts arbitrary canvas layers with quad trees)
 *
 * @class PlaceableFit
 */
class PlaceableFit {
  /**
   * Initialize new "fit" search from the provided
   * bounds.
   *
   * @param {{x:Number, y:Number, width:Number, height:Number}} bounds
   * @param {Object} [options]
   * @constructor
   */
  constructor(bounds, options = {}) {
    this.options = {
      avoidWalls: true,
      searchRange: 6,
      visualize: false,
      collisionLayers: [canvas.tokens],
    };

    foundry.utils.mergeObject(this.options, options);

    this.bounds = new PIXI.Rectangle(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height
    );

    if (this.options.visualize) canvas.controls?.debug?.clear?.();
  }

  /**
   *
   *
   * @param {{x:Number, y:Number}} newOrigin
   * @returns PIXI.Rectangle bounds for overlap testing (slightly smaller)
   * @memberof PlaceableFit
   */
  _collisionBounds(newOrigin) {
    const newBounds = new PIXI.Rectangle(
      newOrigin.x,
      newOrigin.y,
      this.bounds.width,
      this.bounds.height
    );
    newBounds.pad(-10);
    return newBounds.normalize();
  }

  /**
   * With the provided origin (top left), can this
   * placeable fit without overlapping other placeables?
   *
   * @param {{x: Number, y: Number}} loc Origin of bounds
   * @returns boolean Placeable bounds fit without overlap
   * @memberof PlaceableFit
   */
  spaceClear(loc) {
    const candidateBounds = this._collisionBounds(loc);

    if (this.options.visualize) {
      canvas.controls.debug
        .lineStyle(2, 0xff0000, 0.5)
        .drawShape(candidateBounds);
    }

    for (const layer of this.options.collisionLayers) {
      const hits = layer.quadtree.getObjects(candidateBounds);
      if (hits.size == 0) return true;
    }

    return false;
  }

  /**
   *
   *
   * @param {{x:Number, y:Number}} originalCenter
   * @param {{x:Number, y:Number}} shiftedCenter
   * @returns Boolean resulting shifted position would collide with a move blocking wall
   * @memberof PlaceableFit
   */
  _offsetCollidesWall(originalCenter, shiftedCenter) {
    const collision = CONFIG.Canvas.polygonBackends.move.testCollision(
      originalCenter,
      shiftedCenter,
      { mode: "any", type: "move" }
    );

    return collision;
  }

  /**
   * Searches for and returns the bounds origin point at which it does
   * not overlap other placeables.
   *
   * @returns {{x: Number, y: Number}|undefined} Identified bounds origin free of overlap
   * @memberof PlaceableFit
   */
  find() {
    if (game.release?.generation < 11) {
      return Propagator.getFreePosition(this.bounds, this.bounds);
    }

    const locIter = RingGenerator(this.bounds, this.options.searchRange);

    let testLoc = null;

    const newCenter = (x, y) => ({
      x: x + this.bounds.width / 2,
      y: y + this.bounds.height / 2,
    });

    while (!(testLoc = locIter.next()).done) {
      const { x, y } = testLoc.value;

      let clear = this.spaceClear({ x, y });
      if (clear && this.options.avoidWalls) {
        clear = !this._offsetCollidesWall(this.bounds.center, newCenter(x, y));
      }

      if (clear) return { x, y };
    }

    return;
  }
}

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
 * @prop {boolean|string} [ping=false] Creates an animated ping at designated location if a valid
 *  ping style from the values contained in `CONFIG.Canvas.pings.types` is provided, or `'pulse'` if `true`
 * @prop {boolean|Number} [pan=false] Pans all receivers to designated location if value is `true`
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
 * @callback PreSpawn
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
 * @callback PostSpawn
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
class api {

  static register() {
    api.globals();
  }

  static settings() {

  }

  static globals() {
    /**
     * @global
     * @summary Top level (global) symbol providing access to all Warp Gate API functions
     * @static
     * @namespace warpgate
     * @property {warpgate.CONST} CONST
     * @property {warpgate.EVENT} EVENT
     * @property {warpgate.USERS} USERS
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
      dismiss : dismissSpawn,
      mutate : mutate,
      revert : revertMutation,
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
        RingGenerator,
      },

      /**
       * @summary Crosshairs API Functions
       * @namespace 
       * @alias warpgate.crosshairs
       * @borrows Gateway.showCrosshairs as show
       * @borrows Crosshairs.getTag as getTag
       * @borrows Gateway.collectPlaceables as collect
       */
      crosshairs: {
        show: showCrosshairs,
        getTag: Crosshairs.getTag,
        collect: collectPlaceables,
      },
      /**
       * @summary APIs intended for warp gate "pylons" (e.g. Warp Gate-dependent modules)
       * @namespace 
       * @alias warpgate.plugin
       * @borrows api._notice as notice
       * @borrows Mutator.batchMutate as batchMutate
       * @borrows Mutator.batchRevert as batchRevert
       */
      plugin: {
        queueUpdate,
        notice: api._notice,
        batchMutate,
        batchRevert,
        RingGenerator,
      },
      /**
       * @summary System specific helpers
       * @namespace 
       * @private
       * @alias warpgate.dnd5e
       * @prop {Function} rollItem
       * @borrows Gateway._rollItemGetLevel as rollItem
       */
      get dnd5e() {
        foundry.utils.logCompatibilityWarning(`[${MODULE.data.name}] System-specific namespaces and helper functions have been deprecated. Please convert to system provided functions.`, {since: 1.16, until: 2, details:`Migration details:\nrollItem(Item) to Item#use()`});

        return {rollItem : _rollItemGetLevel}
      },
      /**
       * @description Constants and enums for use in embedded shorthand fields
       * @alias warpgate.CONST
       * @readonly
       * @enum {string}
       */
      CONST : {
        /** Instructs warpgate to delete the identified embedded document. Used in place of the update or create data objects. */
        DELETE : 'delete',
      },
      /**
       * @description Helper enums for retrieving user IDs
       * @alias warpgate.USERS
       * @readonly
       * @enum {Array<string>}
       * @property {Array<string>} ALL All online users
       * @property {Array<string>} SELF The current user
       * @property {Array<string>} GM All online GMs
       * @property {Array<string>} PLAYERS All online players (non-gms)
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
        notify : notifyEvent,
      },
      /**
       * @summary Warp Gate classes suitable for extension
       * @namespace 
       * @alias warpgate.abstract
       * @property {Crosshairs} Crosshairs
       * @property {MutationStack} MutationStack
       * @property {PlaceableFit} PlaceableFit
       */
      abstract : {
        Crosshairs,
        MutationStack,
        PlaceableFit,
      }
    };
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
      logger$1.warn(MODULE.format('error.missingPerms', {permList: neededPerms.join(', ')}));
      return [];
    }

    /* create permissions for this user */
    const actorData = {
      ownership: {[game.user.id]: CONST.DOCUMENT_PERMISSION_LEVELS.OWNER}
    };

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
      protoData.updateSource(updates.token ?? {});
    }

    if (!protoData) return;
    
    if(options.controllingActor?.sheet?.rendered) options.controllingActor.sheet.minimize();

    /* gather data needed for configuring the display of the crosshairs */
    const tokenImg = protoData.texture.src;
    const rotation = updates.token?.rotation ?? protoData.rotation ?? 0;
    const crosshairsConfig = foundry.utils.mergeObject(options.crosshairs ?? {}, {
      size: protoData.width,
      icon: tokenImg,
      name: protoData.name,
      direction: 0,
    }, {inplace: true, overwrite: false});

    crosshairsConfig.direction += rotation;

    /** @type {CrosshairsData} */
    const templateData = await showCrosshairs(crosshairsConfig, callbacks);

    const eventPayload = {
      templateData: (options.overrides?.includeRawData ?? false) ? templateData : {x: templateData.x, y: templateData.y, size: templateData.size, cancelled: templateData.cancelled},
      tokenData: (options.overrides?.includeRawData ?? false) ? protoData.toObject() : 'omitted',
      options,
    };

    await warpgate.event.notify(warpgate.EVENT.PLACEMENT, eventPayload);

    if (templateData.cancelled) return;

    let spawnLocation = {x: templateData.x, y:templateData.y};

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
      logger$1.warn(MODULE.format('error.missingPerms', {permList: neededPerms.join(', ')}));
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

    let createdIds = [];

    /* flag this user as the tokens's creator */
    const actorFlags = {
      [MODULE.data.name]: {
        control: {user: game.user.id, actor: options.controllingActor?.uuid},
      }
    };

    /* create permissions for this user */
    const actorData = {
      ownership: {[game.user.id]: CONST.DOCUMENT_PERMISSION_LEVELS.OWNER}
    };
    const deltaField = MODULE.compat('token.delta');
    updates.token = mergeObject({[deltaField]: actorData}, updates.token ?? {}, {inplace: false});

    updates.actor = mergeObject({flags: actorFlags}, updates.actor ?? {}, {inplace: false});

    const duplicates = options.duplicates > 0 ? options.duplicates : 1;
    await clean(null, options);

    if(options.notice) warpgate.plugin.notice({...spawnLocation, scene: canvas.scene}, options.notice); 

    for (let iteration = 0; iteration < duplicates; iteration++) {

      /** pre creation callback */
      if (callbacks.pre) {
        const response = await callbacks.pre(spawnLocation, updates, iteration);

        /* pre create callbacks can skip this spawning iteration */
        if(response === false) continue;
      }
      await clean(updates);

      /* merge in changes to the prototoken */
      if(iteration == 0){
        /* first iteration, potentially from a spawn with a determined image,
         * apply our changes to this version */
        await MODULE.updateProtoToken(protoData, updates.token);
      } else {
        /* get a fresh copy */
        protoData = await MODULE.getTokenData(game.actors.get(protoData.actorId), updates.token);
      }

      logger$1.debug(`Spawn iteration ${iteration} using`, protoData, updates);

      /* pan to token if first iteration */
      //TODO integrate into stock event data instead of hijacking mutate events

      /** @type Object */
      const spawnedTokenDoc = (await _spawnTokenAtLocation(protoData,
        spawnLocation,
        options.collision ?? (options.duplicates > 1)))[0];

      createdIds.push(spawnedTokenDoc.id);

      logger$1.debug('Spawned token with data: ', spawnedTokenDoc);

      await _updateActor(spawnedTokenDoc.actor, updates, options.comparisonKeys ?? {});

      const eventPayload = {
        uuid: spawnedTokenDoc.uuid,
        updates: (options.overrides?.includeRawData ?? false) ? updates : 'omitted',
        options,
        iteration
      }; 

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
   * Helper function for displaying pings for or panning the camera of specific users. If no scene is provided, the user's current
   * is assumed.
   *
   * @param {{x: Number, y: Number, scene: Scene} | CrosshairsData} placement Information for the physical placement of the notice containing at least `{x: Number, y: Number, scene: Scene}`
   * @param {NoticeConfig} [config] Configuration for the notice
   */
  static _notice({x, y, scene}, config = {}){

    config.sender ??= game.userId;
    config.receivers ??= warpgate.USERS.SELF;
    scene ??= canvas.scene;

    return requestNotice({x,y}, scene.id, config);
  }

}

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


class UserInterface {

  static register() {
    this.hooks();
    this.settings();
  }

  static hooks() {
    Hooks.on("renderActorSheet", UserInterface._renderActorSheet);
  }

  static settings() {
    const config = true;
    const settingsData = {
      showDismissLabel : {
        scope: "client", config, default: true, type: Boolean,
      },
      showRevertLabel : {
        scope: "client", config, default: true, type: Boolean,
      },
      dismissButtonScope : {
        scope: "client", config, default: 'spawned', type: String, choices: {
          disabled: MODULE.localize('setting.option.disabled'),
          spawned: MODULE.localize('setting.option.spawnedOnly'),
          all: MODULE.localize('setting.option.all')
        }
      },
      revertButtonBehavior : {
        scope: 'client', config, default: 'pop', type: String, choices: {
          disabled: MODULE.localize('setting.option.disabled'),
          pop: MODULE.localize('setting.option.popLatestMutation'),
          menu: MODULE.localize('setting.option.showMutationList')
        }
      }
    };

    MODULE.applySettings(settingsData);
  }

  static _renderActorSheet(app, html) {
    
    UserInterface.addDismissButton(app, html);
    UserInterface.addRevertMutation(app, html);
  }

  static _shouldAddDismiss(token) {

    if ( !(token instanceof TokenDocument) ) return false;

    switch (MODULE.setting('dismissButtonScope')){
      case 'disabled':
        return false;
      case 'spawned':
        
        const controlData = token?.actor.getFlag(MODULE.data.name, 'control');

        /** do not add the button if we are not the controlling actor AND we aren't the GM */
        if ( controlData?.user !== game.user.id ) return false;

        return !!controlData;
      case 'all':
        return true;
    }

  }

  static addDismissButton(app, html) {
    const token = app.token;

    /** this is not a warpgate spawned actor */
    if (!UserInterface._shouldAddDismiss(token)) return;

    /* do not add duplicate buttons! */
    if(html.closest('.app').find('.dismiss-warpgate').length !== 0) {
      logger$1.debug(MODULE.localize('debug.dismissPresent'));  
      return;
    }

    const label = MODULE.setting('showDismissLabel') ? MODULE.localize("display.dismiss") : "";
    let dismissButton = $(`<a class="dismiss-warpgate" title="${MODULE.localize('display.dismiss')}"><i class="fas fa-user-slash"></i>${label}</a>`);

    dismissButton.click( (/*event*/) => {
      if (!token) {
        logger$1.error(MODULE.localize('error.sheetNoToken'));
        return;
      }
      const {id, parent} = token;
      dismissSpawn(id, parent?.id);

      /** close the actor sheet if provided */
      app?.close({submit: false});
    });

    let title = html.closest('.app').find('.window-title');
    dismissButton.insertAfter(title);

  }

  static _shouldAddRevert(token) {

    if ( !(token instanceof TokenDocument) ) return false;

    const mutateStack = warpgate.mutationStack(token).stack;

    /* this is not a warpgate mutated actor,
     * or there are no remaining stacks to peel */
    if (mutateStack.length == 0) return false;

    return MODULE.setting('revertButtonBehavior') !== 'disabled';
  }

  static _getTokenFromApp(app) {
    
    const {token, actor} = app;
    
    const hasToken = token instanceof TokenDocument;

    if( !hasToken ) {
      /* check if linked and has an active token on scene */
      const candidates = actor?.getActiveTokens() ?? [];
      const linkedToken = candidates.find( t => t.document.actorLink )?.document ?? null;
      
      return linkedToken;
      
    }

    return token;
  }

  static addRevertMutation(app, html) {

    /* do not add duplicate buttons! */
    let foundButton = html.closest('.app').find('.revert-warpgate');

    /* we remove the current button on each render
     * in case the render was triggered by a mutation
     * event and we need to update the tool tip
     * on the revert stack
     */
    if (foundButton) {
      foundButton.remove();
    }

    const token = UserInterface._getTokenFromApp(app);

    if(!UserInterface._shouldAddRevert(token)) return;

    const mutateStack = token?.actor?.getFlag(MODULE.data.name, 'mutate');

    /* construct the revert button */
    const label = MODULE.setting('showRevertLabel') ? MODULE.localize("display.revert") : "";
    const stackCount = mutateStack.length > 1 ? ` 1/${mutateStack.length}` : '';
    let revertButton = $(`<a class="revert-warpgate" title="${MODULE.localize('display.revert')}${stackCount}"><i class="fas fa-undo-alt"></i>${label}</a>`);

    revertButton.click( async (event) => {
      const shouldShow = (shiftKey) => {
        const mode = MODULE.setting('revertButtonBehavior');
        const show = mode == 'menu' ? !shiftKey : shiftKey;
        return show;
      };

      let name = undefined;
      const showMenu = shouldShow(event.shiftKey);

      if (showMenu) {
        const buttons = mutateStack.map( mutation => {return {label: mutation.name, value: mutation.name}} );
        name = await warpgate.buttonDialog({buttons, title: MODULE.localize('display.revertDialogTitle')}, 'column');
        if (name === false) return;
      }

      /* need to queue this since 'click' could
       * happen at any time.
       * Do not need to remove the button here 
       * as it will be refreshed on the render call
       */
      queueUpdate( async () => {
        await revertMutation(token, name);
        app?.render(false);
      });

    });

    let title = html.closest('.app').find('.window-title');
    revertButton.insertAfter(title);
  }

}

/*
 * MIT License
 * 
 * Copyright (c) 2020-2021 DnD5e Helpers Team and Contributors
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const SUB_MODULES = {
  MODULE,
  logger: logger$1,
  api,
  Gateway: {register: register},
  Mutator: {register: register$3},
  RemoteMutator: {register: register$2},
  UserInterface,
  Comms: {register: register$1}
};

/*
  Initialize all Sub Modules
*/
Hooks.on(`setup`, () => {
  Object.values(SUB_MODULES).forEach(cl => cl.register());
});
//# sourceMappingURL=warpgate.js.map

/** @typedef {import('./api.js').NoticeConfig} NoticeConfig */


/**
 * __`options` property details__
 * | Input Type | Options Type | Default Value | Description |
 * |--|--|--|--|
 * | header, info | `none` | `undefined` | Ignored
 * | text, password, number | `string` | `''` | Initial value of input |
 * | checkbox | `boolean`| `false` | Initial checked state |
 * | radio | `[string, boolean]` | `['radio', false]` | Group name and initial checked state, respectively |
 * | select | `{html: string, value: any, selected: boolean}[]` or `string[]` | `[]` | HTML string for select option element, the value to be return if selected, and initial state. If only a string is provided, it will be used as both the HTML and return value. |
 *
 * @typedef {Object} MenuInput
 * @property {string} type Type of input, controlling display and return values. See "options property details," above, and {@link MenuResult MenuResult.button}.
 * @property {string} label Display text for this inputs label element. Accepts HTML.
 * @property {boolean|string|Array<string|boolean>} [options] See "options property details," above.
 * @property
 */

/**
 * @callback MenuCallback
 * @param {MenuResult} result User's chosen values (by reference) for this menu. Can modify or expand return value.
 * @param {HTMLElement} html Menu DOM element.
 */

/**
 * @typedef {object} MenuButton
 * @property {string} label Display text for this button, accepts HTML.
 * @property {*} value Arbitrary object to return if selected.
 * @property {MenuCallback} [callback] Additional callback to be executed
 *   when this button is selected. Can be used to modify the menu's results object.
 * @property {boolean} [default] Any truthy value sets this button as
 * @property
 *  default for the 'submit' or 'ENTER' dialog event. If none provided, the last button provided
 *  will be used.
 */

/**
 * @typedef {object} MenuConfig
 * @property {string} title='Prompt' Title of dialog
 * @property {string} defaultButton='Ok' Button label if no buttons otherwise provided
 * @property {boolean} checkedText=false Return the associated label's `innerText` (no html) of `'checkbox'` or `'radio'` type inputs as opposed to its checked state.
 * @property {Function} close=((resolve)=>resolve({buttons:false})) Override default behavior and return value if the menu is closed without a button selected.
 * @property {function(HTMLElement):void} render=()=>{}
 * @property {object} options Passed to the Dialog options argument.
 * @property
 */

/**
 * __`inputs` return details__
 * | Input Type | Return Type | Description |
 * |--|--|--|
 * | header, info | `undefined` | |
 * | text, password, number | `string` | Final input value
 * | checkbox, radio | `boolean\|string`| Final checked state. Using `checkedText` results in `""` for unchecked and `label` for checked. |
 * | select | `any` | `value` of the chosen select option, as provided by {@link MenuInput MenuInput.options[i].value} |
 *
 * @typedef {object} MenuResult
 * @property {Array} inputs See "inputs return details," above.
 * @property {*} buttons `value` of the selected menu button, as provided by {@link MenuButton MenuButton.value}
 * @property
 */


/** @ignore */
const NAME = 'warpgate';
/** @ignore */
const PATH = `/modules/${NAME}`;

export class MODULE {
  static data = {
    name: NAME,
    path: PATH,
    title: 'Warp Gate',
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
      case 'interaction.pointer':
        return gen < 11 ? root.canvas.app.renderer.plugins.interaction.mouse : canvas.app.renderer.events.pointer;
      case 'crosshairs.computeShape':
        return (
          {
            10: () => {
              if (root.document.t != 'circle') {
                logger.error('Non-circular Crosshairs is unsupported!');
              }
              return root._getCircleShape(root.ray.distance);
            },
          }[gen] ?? (() => root._computeShape())
        )();
      case 'token.delta':
        return (
          {
            10: 'actorData',
          }[gen] ?? 'delta'
        );
      default:
        return null;
    }
  }

  static async register() {
    logger.info('Initializing Module');
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
    const reqs = ['TOKEN_CREATE', 'TOKEN_CONFIGURE', 'FILES_BROWSE'];

    return MODULE.canUser(user, reqs);
  }

  static canMutate(user) {
    const reqs = ['TOKEN_CONFIGURE', 'FILES_BROWSE'];

    return MODULE.canUser(user, reqs);
  }

  /**
   * Handles notice request from spawns and mutations
   *
   * @static
   * @param {{x: number, y: number}} location
   * @param {string} sceneId
   * @param {NoticeConfig} config
   * @memberof MODULE
   */
  static async handleNotice({ x, y }, sceneId, config) {
    /* Can only operate if the user is on the scene requesting notice */
    if (
      canvas.ready
      && sceneId
      && config
      && config.receivers.includes(game.userId)
      && canvas.scene?.id === sceneId
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

        /* Draw the ping, either onscreen or offscreen */
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
   * @param user
   * @param requiredPermissions
   * @returns {Array<string>} missing permissions for this operation
   */
  static canUser(user, requiredPermissions) {
    if (MODULE.setting('disablePermCheck')) return [];
    const { role } = user;
    const permissions = game.settings.get('core', 'permissions');
    return requiredPermissions
      .filter(req => !permissions[req].includes(role))
      .map(missing =>
        game.i18n.localize(CONST.USER_PERMISSIONS[missing].label)
      );
  }

  /**
   * A helper functions that returns the first active GM level user.
   * @returns {User|undefined} First active GM User
   */
  static firstGM() {
    return game.users?.find(u => u.isGM && u.active);
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
    Object.keys(result).forEach(key => {
      if (typeof result[key] == 'object' && MODULE.emptyObject(result[key])) {
        delete result[key];
      }
    });

    return foundry.utils.expandObject(result);
  }

  /**
   * Duplicates a compatible object (non-complex).
   *
   * @param source
   * @param errorString
   * @returns {Object}
   */
  static copy(source, errorString = 'error.unknown') {
    try {
      return foundry.utils.deepClone(source, { strict: true });
    } catch(err) {
      logger.catchThrow(err, MODULE.localize(errorString));
    }


  }

  /**
   * Removes top level empty objects from the provided object.
   *
   * @static
   * @param inplace
   * @param {object} obj
   * @memberof MODULE
   */
  static stripEmpty(obj, inplace = true) {
    const result = inplace ? obj : MODULE.copy(obj);

    Object.keys(result).forEach(key => {
      if (typeof result[key] == 'object' && MODULE.emptyObject(result[key])) {
        delete result[key];
      }
    });

    return result;
  }

  static ownerSublist(docList) {
    /* Break token list into sublists by first owner */
    const subLists = docList.reduce((lists, doc) => {
      if (!doc) return lists;
      const owner = MODULE.firstOwner(doc)?.id ?? 'none';
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
    /* Null docs could mean an empty lookup, null docs are not owned by anyone */
    if (!doc) return undefined;

    /* While conceptually correct, tokens derive permissions from their
     * (synthetic) actor data.
     */
    const corrected =
      doc instanceof TokenDocument
        ? doc.actor
        : // @ts-ignore 2589
        doc instanceof Token
          ? doc.document.actor
          : doc;

    const permissionObject = getProperty(corrected ?? {}, 'ownership') ?? {};

    const playerOwners = Object.entries(permissionObject)
      .filter(
        ([id, level]) =>
          !game.users.get(id)?.isGM && game.users.get(id)?.active && level === 3
      )
      .map(([id]) => id);

    if (playerOwners.length > 0) {
      return game.users.get(playerOwners[0]);
    }

    /* If no online player owns this actor, fall back to first GM */
    return MODULE.firstGM();
  }

  /**
   * Checks whether the user calling this function is the user returned by
   * {@link warpgate.util.firstOwner} when the function is passed the
   * given document. Returns true if they are the same, false if they are not.
   *
   * As `firstOwner`, biases towards players first.
   *
   * @param doc
   * @returns {boolean} the current user is the first player owner. If no owning player, first GM.
   */
  static isFirstOwner(doc) {
    return game.user.id === MODULE.firstOwner(doc).id;
  }

  /**
   * Helper function. Waits for a specified amount of time in milliseconds (be sure to await!).
   * Useful for timings with animations in the pre/post callbacks.
   *
   * @param {number} ms Time to delay, in milliseconds
   * @returns Promise
   */
  static async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Advanced helper function similar to `warpgate.wait` that allows for non-deterministic waits based on the predicate function, `fn`, provided.
   *
   * @param {function(iteration, currentTime): boolean} fn Given the current wait iteration number and the time spent waiting as parameters, return a boolean indicating if we should continue to wait.
   * @param {number} [maxIter=600] Negative value will allow unbounded wait based on `fn`. Positive values act as a timeout. Defaults will cause a timeout after 1 minute.
   * @param {number} [iterWaitTime=100] Time (in ms) between each predicate function check for continued waiting
   * @returns {boolean} Indicates if the function return was caused by timeout during waiting
   */
  static async waitFor(fn, maxIter = 600, iterWaitTime = 100) {
    let i = 0;
    const continueWait = (current, max) => {
      /* Negative max iter means wait forever */
      if (maxIter < 0) return true;

      return current < max;
    };

    while (!fn(i, (i * iterWaitTime)) && continueWait(i, maxIter)) {
      i++;
      await MODULE.wait(iterWaitTime);
    }
    return i !== maxIter;
  }

  static settings() {
    const data = {
      disablePermCheck: {
        config: true,
        scope: 'world',
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
    if (typeof actorNameDoc == 'string') {
      /* Lookup by actor name */
      sourceActor = game.actors.getName(actorNameDoc);
    }

    // Get source actor
    if (!sourceActor) {
      logger.error(
        `Could not find world actor named "${actorNameDoc}" or no souce actor document provided.`
      );
      return false;
    }

    // Get prototoken data -- need to prepare potential wild cards for the template preview
    let protoData = await sourceActor.getTokenDocument(tokenUpdates);
    if (!protoData) {
      logger.error(`Could not find proto token data for ${sourceActor.name}`);
      return false;
    }

    await loadTexture(protoData.texture.src);

    return protoData;
  }

  static async updateProtoToken(protoToken, changes) {
    protoToken.updateSource(changes);
    const img = getProperty(changes, 'texture.src');
    if (img) await loadTexture(img);
  }

  static getMouseStagePos() {
    const mouse = MODULE.compat('interaction.pointer');
    return mouse.getLocalPosition(canvas.app.stage);
  }

  /**
   * @param updates
   * @returns {undefined} provided updates object modified in-place
   */
  static shimUpdate(updates) {
    updates.token = MODULE.shimClassData(
      TokenDocument.implementation,
      updates.token
    );
    updates.actor = MODULE.shimClassData(Actor.implementation, updates.actor);

    Object.keys(updates.embedded ?? {}).forEach(embeddedName => {
      const cls = CONFIG[embeddedName].documentClass;

      Object.entries(updates.embedded[embeddedName]).forEach(
        ([shortId, data]) => {
          updates.embedded[embeddedName][shortId] =
            typeof data == 'string' ? data : MODULE.shimClassData(cls, data);
        }
      );
    });
  }

  static shimClassData(cls, change) {
    if (!change) return change;

    if (change && !foundry.utils.isEmpty(change)) {
      /* Shim data if needed */
      return cls.migrateData(foundry.utils.expandObject(change));
    }

    return foundry.utils.expandObject(change);
  }

  static getFeedbackSettings({
    alwaysAccept = false,
    suppressToast = false,
  } = {}) {
    const acceptSetting =
      MODULE.setting('alwaysAcceptLocal') == 0
        ? MODULE.setting('alwaysAccept')
        : { 1: true, 2: false }[MODULE.setting('alwaysAcceptLocal')];

    const accepted = alwaysAccept ? true : acceptSetting;

    const suppressSetting =
      MODULE.setting('suppressToastLocal') == 0
        ? MODULE.setting('suppressToast')
        : { 1: true, 2: false }[MODULE.setting('suppressToastLocal')];

    const suppress = suppressToast ? true : suppressSetting;

    return { alwaysAccept: accepted, suppressToast: suppress };
  }

  /**
   * Collects the changes in 'other' compared to 'base'.
   * Also includes "delete update" keys for elements in 'base' that do NOT
   * exist in 'other'.
   * @param base
   * @param other
   */
  static strictUpdateDiff(base, other) {
    /* Get the changed fields */
    const diff = foundry.utils.flattenObject(
      foundry.utils.diffObject(base, other, { inner: true })
    );

    /* Get any newly added fields */
    const additions = MODULE.unique(flattenObject(base), flattenObject(other));

    /* Set their data to null */
    Object.keys(additions).forEach(key => {
      if (typeof additions[key] != 'object') {
        const parts = key.split('.');
        parts[parts.length-1] = `-=${parts.at(-1)}`;
        diff[parts.join('.')] = null;
      }
    });

    return foundry.utils.expandObject(diff);
  }

  static unique(object, remove) {
    // Validate input
    const ts = getType(object);
    const tt = getType(remove);
    if (ts !== 'Object' || tt !== 'Object') throw new Error('One of source or template are not Objects!');

    // Define recursive filtering function
    const _filter = function(s, t, filtered) {
      for (let [k, v] of Object.entries(s)) {
        let has = t.hasOwnProperty(k);
        let x = t[k];

        // Case 1 - inner object
        if (has && foundry.utils.getType(v) === 'Object' && foundry.utils.getType(x) === 'Object') {
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
  static async buttonDialog(data, direction = 'row') {
    return await new Promise(async resolve => {
      /** @type Object<string, object> */
      let buttons = {};
      let dialog;

      data.buttons.forEach(button => {
        buttons[button.label] = {
          label: button.label,
          callback: () => resolve(button.value),
        };
      });

      dialog = new Dialog(
        {
          title: data.title ?? '',
          content: data.content ?? '',
          buttons,
          close: () => resolve(false),
        },
        {
          /* Width: '100%',*/
          height: '100%',
          ...data.options,
        }
      );

      await dialog._render(true);
      dialog.element.find('.dialog-buttons').css({
        'flex-direction': direction,
      });
    });
  }

  static dialogInputs = data => {
    /* Correct legacy input data */
    data.forEach(inputData => {
      if (inputData.type === 'select') {
        inputData.options.forEach((e, i) => {
          switch (typeof e) {
            case 'string':
              /* If we are handed legacy string values, convert them to objects */
              inputData.options[i] = { value: e, html: e };
              /* Fallthrough to tweak missing values from object */

            case 'object':
              /* If no HMTL provided, use value */
              inputData.options[i].html ??= inputData.options[i].value;

              /* Sanity check */
              if (
                inputData.options[i].html
                && inputData.options[i].value != undefined
              ) {
                break;
              }

              /* Fallthrough to throw error if all else fails */

            default: {
              const emsg = MODULE.format('error.badSelectOpts', {
                fnName: 'menu',
              });
              logger.error(emsg);
              throw new Error(emsg);
            }
          }
        });
      }
    });

    const mapped = data
      .map(({ type, label, options }, i) => {
        type = type.toLowerCase();
        switch (type) {
          case 'header':
            return `<tr><td colspan = "2"><h2>${label}</h2></td></tr>`;
          case 'button':
            return '';
          case 'info':
            return `<tr><td colspan="2">${label}</td></tr>`;
          case 'select': {
            const optionString = options
              .map((e, i) => {
                return `<option value="${i}" ${e.selected ? 'selected' : ''}>${e.html}</option>`;
              })
              .join('');

            return `<tr><th style="width:50%"><label for="${i}qd">${label}</label></th><td style="width:50%"><select id="${i}qd">${optionString}</select></td></tr>`;
          }
          case 'radio':
            return `<tr><th style="width:50%"><label for="${i}qd">${label}</label></th><td style="width:50%"><input type="${type}" id="${i}qd" ${
              (options instanceof Array ? options[1] : false ?? false)
                ? 'checked'
                : ''
            } value="${i}" name="${
              options instanceof Array ? options[0] : options ?? 'radio'
            }"/></td></tr>`;
          case 'checkbox':
            return `<tr><th style="width:50%"><label for="${i}qd">${label}</label></th><td style="width:50%"><input type="${type}" id="${i}qd" ${
              (options instanceof Array ? options[0] : options ?? false)
                ? 'checked'
                : ''
            } value="${i}"/></td></tr>`;
          default:
            return `<tr><th style="width:50%"><label for="${i}qd">${label}</label></th><td style="width:50%"><input type="${type}" id="${i}qd" value="${
              options instanceof Array ? options[0] : options
            }"/></td></tr>`;
        }
      })
      .join('');

    const content = `
<table style="width:100%">
  ${mapped}
</table>`;

    return content;
  };

  /**
   * Advanced dialog helper providing multiple input type options as well as user defined buttons.
   *
   * @static
   * @param {Object} [prompts]
   * @param {Array<MenuInput>} [prompts.inputs]
   * @param {Array<MenuButton>} [prompts.buttons] If no default button is specified, the last
   *  button provided will be set as default
   * @param {MenuConfig} [config]
   *
   * @returns {Promise<MenuResult>} Object with `inputs` containing the chosen values for each provided input, in order, and the provided `value` of the pressed button or `false`, if closed.
   *
   * @example
   * const results = await warpgate.menu({
   * inputs: [{
   *   label: 'My Way',
   *   type: 'radio',
   *   options: 'group1',
   * }, {
   *   label: 'The Highway',
   *   type: 'radio',
   *   options: 'group1',
   * },{
   *   label: 'Agree to ToS 😈',
   *   type: 'checkbox',
   *   options: true,
   * },{
   *   type: 'select',
   *   label: 'Make it a combo?',
   *   options: [
   *       {html: 'Yes ✅', value: {combo: true, size: 'med'}},
   *       {html: 'No ❌', value: {combo: false}, selected:true},
   *       {html: 'Super Size Me!', value: {combo: true, size: 'lg'}}
   *   ],
   * }],
   * buttons: [{
   *   label: 'Yes',
   *   value: 1,
   *   callback: () => ui.notifications.info('Yes was clicked'),
   * }, {
   *   label: 'No',
   *   value: 2
   * }, {
   *   label: '<strong>Maybe</strong>',
   *   value: 3,
   *   default: true,
   *   callback: (results) => {
   *       results.inputs[3].freebies = true;
   *       ui.notifications.info('Let us help make your decision easier.')
   *   },
   * }, {
   *   label: 'Eventually',
   *   value: 4
   * }]
   * },{
   *  title: 'Choose Wisely...',
   *  //checkedText: true, //Swap true/false output to label/empty string
   *  render: (...args) => { console.log(...args); ui.notifications.info('render!')},
   *  options: {
   *    width: '100px',
   *    height: '100%',
   *  }
   * })
   *
   * console.log('results', results)
   *
   * // EXAMPLE OUTPUT
   *
   * // Ex1: Default state (Press enter when displayed)
   * // -------------------------------
   * // Foundry VTT | Rendering Dialog
   * // S.fn.init(3) [div.dialog-content, text, div.dialog-buttons]
   * // render!
   * // Let us help make your decision easier.
   * // results {
   * //             "inputs": [
   * //                 false,
   * //                 false,
   * //                 true,
   * //                 {
   * //                     "combo": false,
   * //                     "freebies": true
   * //                 }
   * //             ],
   * //             "buttons": 3
   * //         }
   * //
   * // Ex 2: Output for selecting 'My Way', super sizing
   * //       the combo, and clicking 'Yes'
   * // -------------------------------
   * // Foundry VTT | Rendering Dialog
   * // S.fn.init(3) [div.dialog-content, text, div.dialog-buttons]
   * // render!
   * // Yes was clicked
   * // results {
   * //             "inputs": [
   * //                 true,
   * //                 false,
   * //                 true,
   * //                 {
   * //                     "combo": true,
   * //                     "size": "lg"
   * //                 }
   * //             ],
   * //             "buttons": 1
   * //         }
   */
  static async menu(prompts = {}, config = {}) {
    /* Apply defaults to optional params */
    const configDefaults = {
      title: 'Prompt',
      defaultButton: 'Ok',
      render: null,
      close: resolve => resolve({ buttons: false }),
      options: {},
    };

    const { title, defaultButton, render, close, checkedText, options } =
      foundry.utils.mergeObject(configDefaults, config);
    const { inputs, buttons } = foundry.utils.mergeObject(
      { inputs: [], buttons: [] },
      prompts
    );

    return await new Promise(resolve => {
      let content = MODULE.dialogInputs(inputs);
      /** @type Object<string, object> */
      let buttonData = {};
      let def = buttons.at(-1)?.label;
      buttons.forEach(button => {
        if ('default' in button) def = button.label;
        buttonData[button.label] = {
          label: button.label,
          callback: html => {
            const results = {
              inputs: MODULE._innerValueParse(inputs, html, {checkedText}),
              buttons: button.value,
            };
            if (button.callback instanceof Function) button.callback(results, html);
            return resolve(results);
          },
        };
      });

      /* Insert standard submit button if none provided */
      if (buttons.length < 1) {
        def = defaultButton;
        buttonData = {
          [defaultButton]: {
            label: defaultButton,
            callback: html =>
              resolve({
                inputs: MODULE._innerValueParse(inputs, html, {checkedText}),
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

  static _innerValueParse(data, html, {checkedText = false}) {
    return Array(data.length)
      .fill()
      .map((e, i) => {
        let { type } = data[i];
        if (type.toLowerCase() === 'select') {
          return data[i].options[html.find(`select#${i}qd`).val()].value;
        } else {
          switch (type.toLowerCase()) {
            case 'text':
            case 'password':
              return html.find(`input#${i}qd`)[0].value;
            case 'radio':
            case 'checkbox': {
              const ele = html.find(`input#${i}qd`)[0];

              if (checkedText) {
                const label = html.find(`[for="${i}qd"]`)[0];
                return ele.checked ? label.innerText : '';
              }

              return ele.checked;
            }
            case 'number':
              return html.find(`input#${i}qd`)[0].valueAsNumber;
          }
        }
      });
  }
}

/** @ignore */
export class logger {
  static info(...args) {
    console.log(`${MODULE?.data?.title ?? ''}  | `, ...args);
  }

  static debug(...args) {
    if (MODULE.setting('debug')) console.debug(`${MODULE?.data?.title ?? ''}  | `, ...args);
  }

  static warn(...args) {
    console.warn(`${MODULE?.data?.title ?? ''} | WARNING | `, ...args);
    ui.notifications.warn(
      `${MODULE?.data?.title ?? ''} | WARNING | ${args[0]}`
    );
  }

  static error(...args) {
    console.error(`${MODULE?.data?.title ?? ''} | ERROR | `, ...args);
    ui.notifications.error(`${MODULE?.data?.title ?? ''} | ERROR | ${args[0]}`);
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
        scope: 'client',
        config,
        default: false,
        type: Boolean,
      },
    };

    MODULE.applySettings(settingsData);
  }
}

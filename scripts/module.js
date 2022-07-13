/** MIT (c) 2021 DnD5e Helpers */

import Document from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/abstract/document.mjs.js';
import {
  logger
} from './logger.js';

const NAME = "warpgate";
const PATH = `/modules/${NAME}`;

/**
 * @class
 */
export class MODULE {
  static async register() {
    logger.info("Initializing Module");
    MODULE.settings();
  }

  static data = {};

  static async build() {
    MODULE.data = {
      name: NAME,
      path: PATH,
      title: "Warp Gate"
    };
    logger.info("Module Data Built");

    //Object.assign(Function.prototype, {toJSON: function() {

    /**
     * @this Function
     */
    function toJSON() {
    /*
     * @this Function
     */
      let whitespace = /\s/;
      let pair = /\(\)|\[\]|\{\}/;

      let args = new Array();
      let string = this.toString();

      let fat = (new RegExp(
        '^\s*(' +
        ((this.name) ? this.name + '|' : '') +
        'function' +
        ')[^)]*\\('
      )).test(string);

      let state = 'start';
      let depth = new Array(); 
      let tmp = 0;

      for (let index = 0; index < string.length; ++index) {
        let ch = string[index];

        switch (state) {
          case 'start':
            if (whitespace.test(ch) || (fat && ch != '('))
              continue;

            if (ch == '(') {
              state = 'arg';
              tmp = index + 1;
            }
            else {
              state = 'singleArg';
              tmp = index;
            }
            break;

          case 'arg':
          case 'singleArg':
            let escaped = depth.length > 0 && depth[depth.length - 1] == '\\';
            if (escaped) {
              depth.pop();
              continue;
            }
            if (whitespace.test(ch))
              continue;

            switch (ch) {
              case '\\':
                depth.push(ch);
                break;

              case ']':
              case '}':
              case ')':
                if (depth.length > 0) {
                  if (pair.test(depth[depth.length - 1] + ch))
                    depth.pop();
                  continue;
                }
                if (state == 'singleArg')
                  throw '';
                args.push(string.substring(tmp, index).trim());
                state = (fat) ? 'body' : 'arrow';
                break;

              case ',':
                if (depth.length > 0)
                  continue;
                if (state == 'singleArg')
                  throw '';
                args.push(string.substring(tmp, index).trim());
                tmp = index + 1;
                break;

              case '>':
                if (depth.length > 0)
                  continue;
                if (string[index - 1] != '=')
                  continue;
                if (state == 'arg')
                  throw '';
                args.push(string.substring(tmp, index - 1).trim());
                state = 'body';
                break;

              case '{':
              case '[':
              case '(':
                if (
                  depth.length < 1 ||
                  !(depth[depth.length - 1] == '"' || depth[depth.length - 1] == '\'')
                )
                  depth.push(ch);
                break;

              case '"':
                if (depth.length < 1)
                  depth.push(ch);
                else if (depth[depth.length - 1] == '"')
                  depth.pop();
                break;
              case '\'':
                if (depth.length < 1)
                  depth.push(ch);
                else if (depth[depth.length - 1] == '\'')
                  depth.pop();
                break;
            }
            break;

          case 'arrow':
            if (whitespace.test(ch))
              continue;
            if (ch != '=')
              throw '';
            if (string[++index] != '>')
              throw '';
            state = 'body';
            break;

          case 'body':
            if (whitespace.test(ch))
              continue;
            string = string.substring(index);

            if (ch == '{')
              string = string.replace(/^{\s*(.*)\s*}\s*$/, '$1');
            else
              string = 'return ' + string.trim();

            index = string.length;
            break;

          default:
            throw '';
        }
      }

      return ['Function', args, string];
    };

    Object.assign(Function.prototype, {toJSON});
  }

  /**
   * Helper for retrieving a setting under this module's scope
   * @param {string} key 
   * @returns {any}
   */ 
  static setting(key) {
    return game.settings.get(MODULE.data.name, key);
  }

  /**
   * @param {string} stringId
   */
  static localize(stringId) {
    return game.i18n.localize(stringId);
  }

  /**
   * @param {string} stringId
   * @param {Object} [data={}]
   */
  static format(stringId, data = {}) {
    return game.i18n.format(stringId, data);
  }

  static firstGM() {
    return game.users?.find(u => u.isGM && u.active);
  }

  static isFirstGM() {
    return game.userId === MODULE.firstGM()?.id;
  }

  /** @param {Document} doc
   * @returns {Document|undefined}
   */
  static firstOwner(doc) {
    /* null docs could mean an empty lookup, null docs are not owned by anyone */
    if (!doc) return;

    const playerOwners = Object.entries(doc.data.permission ?? {})
      .filter(([id, level]) => (!game.users?.get(id)?.isGM && game.users?.get(id)?.active) && level === 3)
      .map(([id, _]) => id);

    if (playerOwners.length > 0) {
      return game.users?.get(playerOwners[0]);
    }

    /* if no online player owns this actor, fall back to first GM */
    return MODULE.firstGM();
  }

  /** Players first, then GM
   * @param {Document} doc
   */
  static isFirstOwner(doc) {
    return game.user?.id === MODULE.firstOwner(doc)?.id;
  }

  /**
   * @param {number} ms
   */
  static async wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * @param {Function} fn
   */
  static async waitFor(fn, maxIter = 600, iterWaitTime = 100, i = 0) {

    /**
     * @param {number} current
     * @param {number} max
     */
    const continueWait = (current, max) => {

      /* negative max iter means wait forever */
      if (maxIter < 0) return true;

      return current < max;
    }

    while (!fn(i, ((i * iterWaitTime) / 100)) && continueWait(i, maxIter)) {
      i++;
      await MODULE.wait(iterWaitTime);
    }
    return i === maxIter ? false : true;
  }

  static settings() {

  }

  /**
   * @param {Object} settingsData
   */
  static applySettings(settingsData) {
    Object.entries(settingsData).forEach(([key, data]) => {
      game.settings.register(
        MODULE.data.name, key, {
          name: MODULE.localize(`setting.${key}.name`),
          hint: MODULE.localize(`setting.${key}.hint`),
          ...data
        }
      );
    });
  }

  /**
   *
   * @param {string} actorName
   * @param {Object} tokenUpdates
   * @returns 
   */
  static async getTokenData(actorName, tokenUpdates) {

    //get source actor
    const sourceActor = game.actors?.getName(actorName);
    if (!sourceActor) {
      logger.error(`Could not find world actor named "${actorName}"`);
      return false;
    }

    //get prototoken data -- need to prepare potential wild cards for the template preview
    let protoData = (await sourceActor.getTokenData(tokenUpdates));
    if (!protoData) {
      logger.error(`Could not find proto token data for ${actorName}`);
      return false;
    }

    return protoData;
  }

  static getMouseStagePos() {
    const mouse = canvas.app?.renderer.plugins.interaction.mouse;
    return mouse.getLocalPosition(canvas.app?.stage);
  }

  /**
   *
   * @param {Object} obj 
   * @param {Object} remove 
   * @returns 
   */
  static unique(obj, remove) {
    // Validate input
    const ts = getType(obj);
    const tt = getType(remove);
    if ((ts !== "Object") || (tt !== "Object")) throw new Error("One of source or template are not Objects!");

    // Define recursive filtering function 
    const _filter = function (s, t, filtered) {
      for (let [k, v] of Object.entries(s)) {
        let has = t.hasOwnProperty(k);
        let x = t[k];

        // Case 1 - inner object
        if (has && (getType(v) === "Object") && (getType(x) === "Object")) {
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
    return _filter(obj, remove, {});
  }

  /**
   * Helper function for quickly creating a simple dialog with labeled buttons and associated data. 
   * Useful for allowing a choice of actors to spawn prior to `warpgate.spawn`.
   *
   * @param {Object} data 
   * @param {Object[]} data.buttons
   * @param {string} [data.title]
   * @param {string} [data.content]
   * @param {Object} [data.options]
   *
   * @param {string} [direction = 'row'] 'column' or 'row' accepted. Controls layout direction of dialog.
   */
  static async buttonDialog(data, direction = 'row') {
    return await new Promise(async (resolve) => {

      /** @type {Dialog.Data['buttons']} */
      let buttons = {},
        dialog;

      data.buttons.forEach((button) => {
        buttons[button.label] = {
          label: button.label,
          callback: () => resolve(button.value)
        }
      });

      dialog = new Dialog({
        title: data.title ?? 'Prompt',
        content: data.content ?? '',
        buttons: buttons,
        close: () => resolve(false),
        render: (html) => {
          html[0].find('.dialog-buttons').css({'flex-direction': direction});
        }
      }, {
        /*width: '100%',*/
        height: '100%',
        ...data.options
      });

      dialog.render(true);
      
    });
  }

  static dialogInputs = (data) => {
    const content = `
      <table style="width:100%">
      ${data.map(({type, label, options}, i) => {
        if (type.toLowerCase() === 'button') { return '' }
        if (type.toLowerCase() === 'header') {
            return `<tr><td colspan = "2"><h2>${label}</h2></td></tr>`;
        } else if (type.toLowerCase() === 'info') {
          return `<tr><td colspan="2">${label}</td></tr>`;
        } else if (type.toLowerCase() === `select`) {
          return `<tr><th style="width:50%"><label>${label}</label></th><td style="width:50%"><select id="${i}qd">${options.map((e, i) => `<option value="${e}">${e}</option>`).join(``)}</td></tr>`;
        } else if (type.toLowerCase() == `radio`) {
          return `<tr><th style="width:50%"><label>${label}</label></th><td style="width:50%"><input type="${type}" id="${i}qd" ${(options instanceof Array ? options[1] : false ?? false) ? 'checked' : ''} value="${label}" name="${options instanceof Array ? options[0] : options ?? 'radio'}"/></td></tr>`;
        } else if (type.toLowerCase() === `checkbox` ) {
          return `<tr><th style="width:50%"><label>${label}</label></th><td style="width:50%"><input type="${type}" id="${i}qd" ${(options instanceof Array ? options[0] : options ?? false) ? 'checked' : ''} name="${label}"/></td></tr>`;
        } else {
          return `<tr><th style="width:50%"><label>${label}</label></th><td style="width:50%"><input type="${type}" id="${i}qd" value="${options instanceof Array ? options[0] : options}"/></td></tr>`;
        }
        }).join(``)
      } </table>`;

        return content;
  }


    /* See readme at github.com/trioderegion/warpgate */
    static async dialog(data = {}, title = 'Prompt', submitLabel = 'Ok') {
      data = data instanceof Array ? data : [data];

      return await new Promise((resolve) => {
        let content = MODULE.dialogInputs(data); 
        new Dialog({
          title,
          content,
          buttons: {
            Ok: {
              label: submitLabel,
              callback: (html) => {
                resolve(Array(data.length).fill(0).map((_, i) => {
                  let {
                    type
                  } = data[i];
                  if (type.toLowerCase() === `select`) {
                    return html[0].find(`select#${i}qd`).val();
                  } else {
                    switch (type.toLowerCase()) {
                      case `text`:
                      case `password`:
                        return html[0].find(`input#${i}qd`)[0].value;
                      case `radio`:
                        return html[0].find(`input#${i}qd`)[0].checked ? html[0].find(`input#${i}qd`)[0].value : false;
                      case `checkbox`:
                        return html[0].find(`input#${i}qd`)[0].checked;
                      case `number`:
                        return html[0].find(`input#${i}qd`)[0].valueAsNumber;
                    }
                  }
                }));
              }
            }
          }
        }).render(true);
      });
    }

    /**
     * Advanced dialog helper providing multiple input type options as well as user defined buttons. This combines the functionality
     * of `buttonDialog` as well as `dialog`
     *
 * @static
 * @param {Object} [{inputs = [], buttons = []}={}] `inputs` follow the same structure as dialog, `buttons` follow the same structure
 *                 as buttonDialog
 * @param {Object} [{title = 'Prompt', defaultButton = 'Ok', options={}}={}] Title of dialog, default button label if no buttons provided,
 *                 and options object passed directly to the Application constructor
 * @return {Promise<any[]>} Same as `dialog` with the chosen button value append to the end IFF the default button was not used
 * @memberof MODULE
 */
/* MENU EXAMPLE *
await warpgate.menu({
  inputs: [{
    label: 'My Way',
    type: 'radio',
    options: 'group1'
  }, {
    label: 'The Highway',
    type: 'radio',
    options: 'group1'
  }],
  buttons: [{
    label: 'Yes',
    value: 1
  }, {
    label: 'No',
    value: 2
  }, {
    label: 'Maybe',
    value: 3
  }, {
    label: 'Eventually',
    value: 4
  }]
}, {
  options: {
    width: '100px',
    height: '100%'
  }
})
****************/
    static async menu({
      inputs = [],
      buttons = []
    } = {}, {
      title = 'Prompt',
      defaultButton = 'Ok',
      options = {}
    } = {}) {

      return await new Promise((resolve) => {
        let content = MODULE.dialogInputs(inputs);
        let buttonData = {}

        buttons.forEach((button) => {
          buttonData[button.label] = {
            label: button.label,
            callback: (html) => {
              const results = {
                inputs: MODULE._innerValueParse(inputs, html),
                buttons: button.value
              }
              resolve(results);
            }
          }
        });

        /* insert standard submit button if none provided */
        if (buttons.length < 1) {
          buttonData = {
            Ok: {
              label: defaultButton,
              callback: (html) => resolve({inputs: MODULE._innerValueParse(inputs, html), buttons: true})
            }
          }
        }

        new Dialog({
          title,
          content,
          close: () => resolve({buttons: false}),
          buttons: buttonData,
        }, options).render(true);
      });
    }

    static _defaultButton(data) {
      return (html) => {
        resolve(MODULE._innerValueParse(data, html));
      }
    }

    static _innerValueParse(data, html) {
      return Array(data.length).fill().map((e, i) => {
        let {
          type
        } = data[i];
        if (type.toLowerCase() === `select`) {
          return html.find(`select#${i}qd`).val();
        } else {
          switch (type.toLowerCase()) {
            case `text`:
            case `password`:
              return html.find(`input#${i}qd`)[0].value;
            case `radio`:
              return html.find(`input#${i}qd`)[0].checked ? html.find(`input#${i}qd`)[0].value : false;
            case `checkbox`:
              return html.find(`input#${i}qd`)[0].checked;
            case `number`:
              return html.find(`input#${i}qd`)[0].valueAsNumber;
          }
        }
      })
    }
  }

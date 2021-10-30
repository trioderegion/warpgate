/** MIT (c) 2021 DnD5e Helpers */

import { logger } from './logger.js';

const NAME = "warpgate";
const PATH = `/modules/${NAME}`;

export class MODULE{
  static async register(){
    logger.info("Initializing Module");
    MODULE.settings();
  }

  static async build(){
    MODULE.data = { 
      name: NAME,
      path: PATH,
      title: "Warp Gate"
    };
    logger.info("Module Data Built");
  }

  static setting(key){
    return game.settings.get(MODULE.data.name, key);
  }

  static localize(...args){
    return game.i18n.localize(...args);
  }

  static format(...args){
    return game.i18n.format(...args);
  }

  static firstGM(){
    return game.users.find(u => u.isGM && u.active);
  }

  static isFirstGM(){
    return game.user.id === MODULE.firstGM()?.id;
  }

  static async wait(ms){
    return new Promise((resolve)=> setTimeout(resolve, ms))
  }

  static async waitFor(fn, maxIter = 600, iterWaitTime = 100, i = 0){
    const continueWait = (current, max) => {

      /* negative max iter means wait forever */
      if (maxIter < 0) return true;
      
      return current < max;
    }

    while(!fn(i, ((i*iterWaitTime)/100)) && continueWait(i, maxIter)){
      i++;
      await MODULE.wait(iterWaitTime);
    }
    return i === maxIter ? false : true;
  }

  static settings() {

  }

  static applySettings(settingsData){
    Object.entries(settingsData).forEach(([key, data])=> {
      game.settings.register(
        MODULE.data.name, key, {
          name : MODULE.localize(`setting.${key}.name`),
          hint : MODULE.localize(`setting.${key}.hint`),
          ...data
        }
      );
    });
  }

  static async getTokenData(actorName, tokenUpdates){
    
    //get source actor
    const sourceActor = game.actors.getName(actorName);
    if(!sourceActor) {
      logger.error(`Could not find world actor named "${actorName}"`);
      return false;
    }

    //get prototoken data -- need to prepare potential wild cards for the template preview
    let protoData = (await sourceActor.getTokenData(tokenUpdates));
    if(!protoData) {
      logger.error(`Could not find proto token data for ${actorName}`);
      return false;
    }
    
    return protoData;
  }

  static getMouseStagePos() {
    const mouse = canvas.app.renderer.plugins.interaction.mouse;
    return mouse.getLocalPosition(canvas.app.stage);
  }

  static unique( object, remove ) {
    // Validate input
    const ts = getType(object);
    const tt = getType(remove);
    if ( (ts !== "Object") || (tt !== "Object")) throw new Error("One of source or template are not Objects!");

    // Define recursive filtering function
    const _filter = function(s, t, filtered) {
      for ( let [k, v] of Object.entries(s) ) {
        let has = t.hasOwnProperty(k);
        let x = t[k];

        // Case 1 - inner object
        if ( has && (getType(v) === "Object") && (getType(x) === "Object") ) {
          filtered[k] = _filter(v, x, {});
        }

        // Case 2 - inner key
        else if ( !has ) {
          filtered[k] = v;
        }
      }
      return filtered;
    };

    // Begin filtering at the outer-most layer
    return _filter(object, remove, {});
  }

  /*
   * Helper function for quickly creating a simple dialog with labeled buttons and associated data. 
   * Useful for allowing a choice of actors to spawn prior to `warpgate.spawn`.
   *
   * @param `data` {Array of Objects}: Contains two keys `label` and `value`. Label corresponds to the 
   *     button's text. Value corresponds to the return value if this button is pressed. Ex. 
   *     `const data = [{label: 'First Choice, value: {token {name: 'First'}}, {label: 'Second Choice',
   *         value: {token: {name: 'Second}}}]`
   * @param `direction` {String} (optional): `'column'` or `'row'` accepted. Controls layout direction of dialog.
   */
  static async buttonDialog(data, direction = 'row') {
    return await new Promise(async (resolve) => {
      let buttons = {}, dialog;

      data.buttons.forEach((button) => {
        buttons[button.label] = {
          label: button.label,
          callback: () => resolve(button.value)
        }
      });

      dialog = new Dialog({
        title: data.title,
        content: data.content,
        buttons,
        close: () => resolve(true)
      }, {
        /*width: '100%',*/ height: '100%' 
      });

      await dialog._render(true);
      dialog.element.find('.dialog-buttons').css({'flex-direction': direction});
    });
  }

  /* See readme at github.com/trioderegion/warpgate */
  static async dialog(data = {}, title = 'Prompt', submitLabel = 'Ok') {
    data = data instanceof Array ? data : [data];

    return await new Promise((resolve) => {
      let content = `
    <table style="width:100%">
      ${data.map(({type, label, options}, i) => {
        if (type.toLowerCase() === 'button') { return '' }
        if (type.toLowerCase() === 'header') {
            return `<tr><td colspan="2"><h2>${label}</h2></td></tr>`;
        } else if (type.toLowerCase() === 'info') {
            return `<tr><td colspan="2">${label}</td></tr>`;
        } else if (type.toLowerCase() === `select`) {
          return `<tr><th style="width:50%"><label>${label}</label></th><td style="width:50%"><select id="${i}qd">${options.map((e, i) => `<option value="${e}">${e}</option>`).join(``)}</td></tr>`;
        } else if (type.toLowerCase() === `checkbox` || type.toLowerCase() == `radio` ) {
          return `<tr><th style="width:50%"><label>${label}</label></th><td style="width:50%"><input type="${type}" id="${i}qd" value="${label}" name="${options instanceof Array ? options[0] : options}"/></td></tr>`;
        } else {
          return `<tr><th style="width:50%"><label>${label}</label></th><td style="width:50%"><input type="${type}" id="${i}qd" value="${options instanceof Array ? options[0] : options}"/></td></tr>`;
        }
      }).join(``)}
    </table>`;

      new Dialog({
        title, content,
        buttons: {
          Ok: {
            label: submitLabel, callback: (html) => {
              resolve(Array(data.length).fill().map((e, i) => {
                let {type} = data[i];
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
              }));
            }
          }
        }
      }).render(true);
    });
  }
}

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

  static async waitFor(fn, m = 200, w = 100, i = 0){
    while(!fn(i, ((i*w)/100)) && i < m){
      i++;
      await MODULE.wait(w);
    }
    return i === m ? false : true;
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

/*
 * ex. warpgate.buttonDialog({
 *  title: 'press one', 
 *  buttons: [
 *    {
 *      label: 'Hello World',
 *      value : {token: {name: 'test'}}
 *    }]
 *  })
 */
  static async buttonDialog(data) {
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
        width: 300, height: 'auto' 
      });

      await dialog._render(true);
      dialog.element.find('.dialog-buttons').css({'flex-direction': 'column'});
    });
  }

  /* example
   * warpgate.dialog([
   *  {
   *    type: 'select', label: "Selection dropdown", 
   *    options: ['hehe', 'harhar', 'trololol']
   *  },{
   *    type:'header', label:'Test Header'
   *  },{
   *    type: 'button', label: 'Button is completely ignored' 
   *  },{
   *    type: 'radio', label: '<h2>HTML+label</h2>', options: 'group1'
   *  },{
   *    type: 'info', label: 'Just informative text'
   *  }],
   *  "Select some things",
   *  "Custom submit button text")
   */
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
            return `<tr><td>${label}</td></tr>`;
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

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

export class UserInterface {

  static register() {
    UserInterface.hooks();
  }

  static hooks() {
    Hooks.on("renderActorSheet", UserInterface._renderActorSheet);
  }

  static _renderActorSheet(app, html, data) {
    logger.debug("app |", app);
    logger.debug("html |", html);
    logger.debug("data |", data);
    
    UserInterface.addDismissButton(app, html, data);
  }

  static addDismissButton(app, html, data) {
    const token = data.options.token;

    const controlData = token.actor.getFlag(MODULE.data.name, 'control');

    /** this is not a warpgate spawned actor */
    if (!controlData) return;

    /** do not add the button if we are not the controlling actor AND we arent the GM */
    if ( !(controlData.user === game.user.id) &&
          !game.user.isGM) return;

    let dismissButton = $(`<a class="dismiss-warpgate" title="dismiss"><i class="fas fa-user-slash"></i>${MODULE.localize("display.dismiss")}</a>`);

    dismissButton.click( (/*event*/) => {
      if (!token) {
        logger.error("Could not find token associated with this sheet.");
        return;
      }
      const {id, parent} = token;
      Gateway.dismissSpawn(id, parent?.id, app);

      /** close the actor sheet if provided */
      app?.close({submit: false});
    });

    let title = html.closest('.app').find('.window-title');
    dismissButton.insertAfter(title);

  }
}

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
import {queueUpdate} from './update-queue.js'
import { Mutator } from './mutator.js'

export class UserInterface {

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

  static _renderActorSheet(app, html, data) {
    logger.debug("app |", app);
    logger.debug("html |", html);
    logger.debug("data |", data);
    
    UserInterface.addDismissButton(app, html, data);
    UserInterface.addRevertMutation(app, html, data);
  }

  static _shouldAddDismiss(token) {

    if ( !(token instanceof TokenDocument) ) return false;

    switch (MODULE.setting('dismissButtonScope')){
      case 'disabled':
        return false;
      case 'spawned':
        
        const controlData = token?.actor.getFlag(MODULE.data.name, 'control');

        /** do not add the button if we are not the controlling actor AND we arent the GM */
        if ( !(controlData?.user === game.user.id) &&
          !game.user.isGM) return false;

        return !!controlData;
      case 'all':
        return true;
    }

  }

  static addDismissButton(app, html/*, data*/) {
    const token = app.token;

    /** this is not a warpgate spawned actor */
    if (!UserInterface._shouldAddDismiss(token)) return;

    /* do not add duplicate buttons! */
    if(html.closest('.app').find('.dismiss-warpgate').length !== 0) {
      logger.debug(MODULE.localize('debug.dismissPresent'));  
      return;
    }

    const label = MODULE.setting('showDismissLabel') ? MODULE.localize("display.dismiss") : ""
    let dismissButton = $(`<a class="dismiss-warpgate" title="${MODULE.localize('display.dismiss')}"><i class="fas fa-user-slash"></i>${label}</a>`);

    dismissButton.click( (/*event*/) => {
      if (!token) {
        logger.error(MODULE.localize('error.sheetNoToken'));
        return;
      }
      const {id, parent} = token;
      Gateway.dismissSpawn(id, parent?.id);

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
      const linkedToken = candidates.find( t => t.data.actorLink )?.document ?? null;
      
      return linkedToken;
      
    }

    return token;
  }

  static addRevertMutation(app, html, data) {

    /* do not add duplicate buttons! */
    let foundButton = html.closest('.app').find('.revert-warpgate')

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
    const label = MODULE.setting('showRevertLabel') ? MODULE.localize("display.revert") : ""
    const stackCount = mutateStack.length > 1 ? ` 1/${mutateStack.length}` : '';
    let revertButton = $(`<a class="revert-warpgate" title="${MODULE.localize('display.revert')}${stackCount}"><i class="fas fa-undo-alt"></i>${label}</a>`);

    revertButton.click( async (event) => {
      const shouldShow = (shiftKey) => {
        const mode = MODULE.setting('revertButtonBehavior')
        const show = mode == 'menu' ? !shiftKey : shiftKey;
        return show;
      }

      let name = undefined;
      const showMenu = shouldShow(event.shiftKey);

      if (showMenu) {
        const buttons = mutateStack.map( mutation => {return {label: mutation.name, value: mutation.name}} )
        name = await warpgate.buttonDialog({buttons, title: MODULE.localize('display.revertDialogTitle')}, 'column');
        if (name === false) return;
      }

      /* need to queue this since 'click' could
       * happen at any time.
       * Do not need to remove the button here 
       * as it will be refreshed on the render call
       */
      queueUpdate( async () => {
        await Mutator.revertMutation(token, name);
        app?.render(false);
      });

    });

    let title = html.closest('.app').find('.window-title');
    revertButton.insertAfter(title);
  }

}

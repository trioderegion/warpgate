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
import { MODULE } from './module.js'

export class Crosshairs extends MeasuredTemplate {

  /* @todo need to make a proper constructor with
   * the fields that I am adding to MeasuredTemplate
   */
  static fromToken(tokenData) {

    const templateData = {
      t: "circle",
      user: game.user.id,
      //distance: 2.5, //@todo scale by token/grid size instead
      distance: (canvas.scene.data.gridDistance / 2) * tokenData.width,
      x: 0,
      y: 0,
      fillColor: game.user.color,
      //layer: canvas.activeLayer
    }

    //create the MeasuredTemplate document
    const template = new CONFIG.MeasuredTemplate.documentClass(templateData, {parent: canvas.scene});
    const templateObject = new this(template);
    templateObject.tokenData = tokenData;
    templateObject.inFlight = false;

    return templateObject;
  }

  /**
   * Set the displayed ruler tooltip text and position
   * @private
   */
    //BEGIN WARPGATE
  _setRulerText() {
    this.ruler.text = this.tokenData.name;
    /** swap the X and Y to use the default dx/dy of a ray (pointed right)
    //to align the text to the bottom of the template */
    this.ruler.position.set(this.ray.dy + 10, this.ray.dx + 5);
    //END WARPGATE
  }

  /* -----------EXAMPLE CODE FROM MEASUREDTEMPLATE.JS--------- */
  /* Portions of the core package (MeasuredTemplate) repackaged 
   * in accordance with the "Limited License Agreement for Module 
   * Development, found here: https://foundryvtt.com/article/license/ 
   * Changes noted where possible
   */

  /** @override */
  async draw() {
    this.clear();

    // Load the texture
    if ( this.data.texture ) {
      this.texture = await loadTexture(this.data.texture, {fallback: 'icons/svg/hazard.svg'});
    } else {
      this.texture = null;
    }

    // Template shape
    this.template = this.addChild(new PIXI.Graphics());

    // Rotation handle
    //BEGIN WARPGATE
    //this.handle = this.addChild(new PIXI.Graphics());
    //END WARPGATE

    // Draw the control icon
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
   * @private
   */
  _drawRulerText() {
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = Math.max(Math.round(canvas.dimensions.size * 0.36 * 12) / 12, 36);
    const text = new PreciseText(null, style);
    //BEGIN WARPGATE
    text.anchor.set(0.5, 0);
    //END WARPGATE
    return text;
  }

  /**
   * Draw the ControlIcon for the MeasuredTemplate
   * @return {ControlIcon}
   * @private
   */
  _drawControlIcon() {
    const size = Math.max(Math.round((canvas.dimensions.size * 0.5) / 20) * 20, 40);

    //BEGIN WARPGATE
    let icon = new ControlIcon({texture: this.tokenData.img, size: size});
    //END WARPGATE

    icon.pivot.set(size*0.5, size*0.5);
    //icon.x -= (size * 0.5);
    //icon.y -= (size * 0.5);
    icon.angle = this.tokenData.rotation;
    return icon;
  }

  /** @override */
  refresh() {
    let d = canvas.dimensions;
    this.position.set(this.data.x, this.data.y);

    // Extract and prepare data
    let {direction, distance} = this.data;
    distance *= (d.size / d.distance);
    //BEGIN WARPGATE
    //width *= (d.size / d.distance);
    //END WARPGATE
    direction = Math.toRadians(direction);

    // Create ray and bounding rectangle
    this.ray = Ray.fromAngle(this.data.x, this.data.y, direction, distance);

    // Get the Template shape
    switch ( this.data.t ) {
      case "circle":
        this.shape = this._getCircleShape(distance);
        break;
      default: logger.error("Non-circular Crosshairs is unsupported!");
    }

    // Draw the Template outline
    this.template.clear()
      .lineStyle(this._borderThickness, this.borderColor, 0.75)
      .beginFill(0x000000, 0.0);

    // Fill Color or Texture
    if ( this.texture ) this.template.beginTextureFill({
      texture: this.texture
    });
    else this.template.beginFill(0x000000, 0.0);

    // Draw the shape
    this.template.drawShape(this.shape);

    // Draw origin and destination points
    this.template.lineStyle(this._borderThickness, 0x000000)
      .beginFill(0x000000, 0.5)
    //BEGIN WARPGATE
      //.drawCircle(0, 0, 6)
      //.drawCircle(this.ray.dx, this.ray.dy, 6);
    //END WARPGATE

    // Update visibility
    this.controlIcon.visible = true;//this.layer._active;
    this.controlIcon.border.visible = this._hover;
    this.controlIcon.angle = this.tokenData.rotation;

    // Draw ruler text
    //BEGIN WARPGATE
    //this._refreshRulerText();
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
  drawPreview() {
    // Draw the template and switch to the template layer
    this.initialLayer = canvas.activeLayer;
    this.inFlight = true;
    this.layer.activate();
    this.draw();
    this.layer.preview.addChild(this);

    // Hide the sheet that originated the preview
    //BEGIN WARPGATE
    //Handled by the api
    //if ( this.actorSheet ) this.actorSheet.minimize();
    //END WARPGATE

    // Activate interactivity
    this.activatePreviewListeners();
    return MODULE.waitFor( () => !this.inFlight )
  }

  /* -------------------------------------------- */

  _mouseMoveHandler(event){
    event.stopPropagation();
    let now = Date.now(); // Apply a 20ms throttle
    if ( now - this.moveTime <= 20 ) return;
    const center = event.data.getLocalPosition(this.layer);
    const snapped = canvas.grid.getSnappedPosition(center.x, center.y, 2);
    this.data.update({x: snapped.x, y: snapped.y});
    this.refresh();
    this.moveTime = now;
  }

  _leftClickHandler(event){
    this.clearHandlers(event);
    const destination = canvas.grid.getSnappedPosition(this.data.x, this.data.y, 2);
    this.data.update(destination);

    //BEGIN WARPGATE
    //this.callback(this.data.toObject());
    //END WARPGATE
  }

  // Rotate the template by 3 degree increments (mouse-wheel)
  _mouseWheelHandler(event) {
    if ( event.ctrlKey ) event.preventDefault(); // Avoid zooming the browser window
    event.stopPropagation();
    let delta = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 30 : 15;
    let snap = event.shiftKey ? delta : 5;
    //BEGIN WARPGATE
    const direction = this.data.direction + (snap * Math.sign(event.deltaY))
    this.data.update({direction});
    this.tokenData.rotation = direction
    logger.debug(`New Rotation: ${this.tokenData.rotation}`);
    //END WARPGATE
    this.refresh();
  }

  _clearHandlers(event) {
    this.layer.preview.removeChildren();
    canvas.stage.off("mousemove", this.activeMoveHandler);
    canvas.stage.off("mousedown", this.activeLeftClickHandler);
    canvas.app.view.oncontextmenu = null;
    canvas.app.view.onwheel = null;
    this.initialLayer.activate();

    //BEGIN WARPGATE
    // Show the sheet that originated the preview
    if ( this.actorSheet ) this.actorSheet.maximize();
    this.inFlight = false;
    //END WARPGATE
  }

  /**
   * Activate listeners for the template preview
   */
  activatePreviewListeners() {
    this.moveTime = 0;
    //BEGIN WARPGATE
    /* Activate listeners */
    this.activeMoveHandler = this._mouseMoveHandler.bind(this);
    this.activeLeftClickHandler = this._leftClickHandler.bind(this);
    this.activeWheelHandler = this._mouseWheelHandler.bind(this);

    this.clearHandlers = this._clearHandlers.bind(this);

    // Update placement (mouse-move)
    canvas.stage.on("mousemove", this.activeMoveHandler);

    // Confirm the workflow (left-click)
    canvas.stage.on("mousedown", this.activeLeftClickHandler);

    // Mouse Wheel rotate
    canvas.app.view.onwheel = this.activeWheelHandler;
    
    // Right click cancel
    canvas.app.view.oncontextmenu = this.clearHandlers;
    // END WARPGATE
  }

  /** END ABILITY-TEMPLATE.JS USAGE */
}

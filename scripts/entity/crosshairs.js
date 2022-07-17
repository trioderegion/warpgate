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

  //constructor(gridSize = 1, data = {}){
  constructor(config, callbacks = {}){
     const templateData = {
      t: "circle",
      user: game.user.id,
      distance: (canvas.scene.data.gridDistance / 2) * config.size,
      x: config.x,
      y: config.y,
      fillColor: config.fillColor,
      width: config.size,
      texture: config.texture,
    }   

    const template = new CONFIG.MeasuredTemplate.documentClass(templateData, {parent: canvas.scene});
    super(template);

    /** @TODO all of these fields should be part of the source data schema for this class **/

    /* image path to display in the center (under mouse cursor) */
    this.icon = config.icon ?? Crosshairs.ERROR_TEXTURE;

    /* text to display below crosshairs' circle */
    this.label = config.label;

    /* Offsets the default position of the label (in pixels) */
    this.labelOffset = config.labelOffset;

    /* Arbitrary field used to identify this instance
     * of a Crosshairs in the canvas.templates.preview
     * list
     */
    this.tag = config.tag;

    /* Should the center icon be shown? */
    this.drawIcon = config.drawIcon;

    /* Should the outer circle be shown? */
    this.drawOutline = config.drawOutline;

    /* Opacity of the fill color */
    this.fillAlpha = config.fillAlpha;

    /* Should the texture (if any) be tiled
     * or scaled and offset? */
    this.tileTexture = config.tileTexture;

    /* locks the size of crosshairs (shift+scroll) */
    this.lockSize = config.lockSize;

    /* locks the position of crosshairs */
    this.lockPosition = config.lockPosition;

    /* Number of quantization steps along
     * a square's edge (N+1 snap points 
     * along each edge, conting endpoints)
     */
    this.interval = config.interval;

    /* Callback functions to execute
     * at particular times
     */
    this.callbacks = callbacks;

    /* Indicates if the user is actively 
     * placing the crosshairs.
     * Setting this to true in the show
     * callback will stop execution
     * and report the current mouse position
     * as the chosen location
     */
    this.inFlight = false;

    /* indicates if the placement of
     * crosshairs was canceled (with
     * a right click)
     */
    this.cancelled = true;

    /* current radius in pixels */
    this.radius = this.data.distance / this.scene.data.gridDistance * this.scene.data.grid;
  }

  static ERROR_TEXTURE = 'icons/svg/hazard.svg'

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
    this.ruler.position.set(-this.ruler.width/2 + this.labelOffset.x, this.template.height/2 + 5 + this.labelOffset.y);
    //END WARPGATE
  }

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
   * @private
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
   * @private
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
    icon.angle = this.data.direction;
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
      .lineStyle(this._borderThickness, this.borderColor, this.drawOutline ? 0.75 : 0)
    //BEGIN WARPGATE
      //.beginFill(/*0x000000, 0.0*/this.fillColor, this.alpha);
    //END WARPGATE


    // Fill Color or Texture

    if ( this.texture ) {
      /* assume 0,0 is top left of texture
       * and scale/offset this texture (due to origin
       * at center of template). tileTexture indicates
       * that this texture is tilable and does not 
       * need to be scaled/offset */
      const scale = this.tileTexture ? 1 : distance * 2 / this.texture.width;
      const offset = this.tileTexture ? 0 : distance;
      this.template.beginTextureFill({
        texture: this.texture,
        matrix: new PIXI.Matrix().scale(scale, scale).translate(-offset,-offset)
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
      this.controlIcon.border.visible = this._hover
      this.controlIcon.angle = this.data.direction;
    }

    // Draw ruler text
    //BEGIN WARPGATE
    this._setRulerText()
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

    // Hide the sheet that originated the preview
    //BEGIN WARPGATE
    this.inFlight = true;
    
    // Activate interactivity
    this.activatePreviewListeners();
    
    // Callbacks
    if (this.callbacks?.show) {
      //await
      this.callbacks.show(this);
      //if (this.inFlight == false) {
      //  this._clearHandlers();
      //}
    }

    /* wait _indefinitely_ for placement to be decided. */
    await MODULE.waitFor( () => !this.inFlight, -1 )
    if (this.activeHandlers) {
      this.clearHandlers();
    }

    //END WARPGATE
    return this;
  }

  /* -------------------------------------------- */

  _mouseMoveHandler(event){
    event.stopPropagation();

    // WARPGATE BEGIN
    /* if our position is locked, do not update it */
    if (this.lockPosition) return;
    // WARPGATE END
    
    // Apply a 20ms throttle
    let now = Date.now(); 
    if ( now - this.moveTime <= 20 ) return;

    const center = event.data.getLocalPosition(this.layer);
    const {x,y} = Crosshairs.getSnappedPosition(center, this.interval);
    this.data.update({x, y});
    this.refresh();
    this.moveTime = now;
  }

  _leftClickHandler(event){
    const destination = Crosshairs.getSnappedPosition(this.data, this.interval);
    const width = this.data.distance / (canvas.scene.data.gridDistance / 2);
    const radius = this.data.distance / this.scene.data.gridDistance * this.scene.data.grid;
    this.radius = radius;
    this.data.update({destination, width, cancelled: false});
    this.cancelled = false;

    this.clearHandlers(event);
  }

  // Rotate the template by 3 degree increments (mouse-wheel)
  _mouseWheelHandler(event) {

    if ( event.ctrlKey ) event.preventDefault(); // Avoid zooming the browser window
    event.stopPropagation();

    let delta = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 30 : 15;
    let snap = event.shiftKey ? delta : 5;
    //BEGIN WARPGATE
    if (event.shiftKey && !this.lockSize) {
      const distance = this.data.distance + canvas.scene.data.gridDistance / 2 * (Math.sign(event.deltaY));
      this.data.update({distance : Math.max(distance,canvas.scene.data.gridDistance/2)});
      const radius = this.data.distance / this.scene.data.gridDistance * this.scene.data.grid;
      this.radius = radius;
    } else {
      const direction = this.data.direction + (snap * Math.sign(event.deltaY))
      this.data.update({direction});
      logger.debug(`New Rotation: ${direction}`);
    }
    //END WARPGATE
    this.refresh();
  }

  _cancelHandler(event) {
    this.cancelled = true;
    this.clearHandlers(event);
  }

  _clearHandlers(event) {
    //WARPGATE BEGIN
    /* remove only ourselves, in case of multiple */
    this.layer.preview.removeChild(this);
    //WARPGATE END
    canvas.stage.off("mousemove", this.activeMoveHandler);
    canvas.stage.off("mousedown", this.activeLeftClickHandler);
    canvas.app.view.oncontextmenu = null;
    canvas.app.view.onwheel = null;

    /* moving off this layer also deletes ALL active previews?
     * unexpected, but manageable
     */
    if(this.layer.preview.children.length == 0){
      this.initialLayer.activate();
    }

    //BEGIN WARPGATE
    // Show the sheet that originated the preview
    if ( this.actorSheet ) this.actorSheet.maximize();
    this.activeHandlers = false;
    this.inFlight = false;

    /* mark this pixi element as destroyed */
    this._destroyed = true;
    //END WARPGATE
  }

  /**
   * Activate listeners for the template preview
   */
  activatePreviewListeners() {
    this.moveTime = 0;
    //BEGIN WARPGATE
    this.activeHandlers = true;

    /* Activate listeners */

    this.activeMoveHandler = this._mouseMoveHandler.bind(this);
    this.activeLeftClickHandler = this._leftClickHandler.bind(this);
    this.cancelHandler = this._cancelHandler.bind(this);
    this.activeWheelHandler = this._mouseWheelHandler.bind(this);

    this.clearHandlers = this._clearHandlers.bind(this);

    // Update placement (mouse-move)
    canvas.stage.on("mousemove", this.activeMoveHandler);

    // Confirm the workflow (left-click)
    canvas.stage.on("mousedown", this.activeLeftClickHandler);

    // Mouse Wheel rotate
    canvas.app.view.onwheel = this.activeWheelHandler;
    
    // Right click cancel
    canvas.app.view.oncontextmenu = this.cancelHandler;

    // END WARPGATE
  }

  /** END ABILITY-TEMPLATE.JS USAGE */
}

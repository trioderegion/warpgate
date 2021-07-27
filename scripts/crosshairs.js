export class Crosshairs extends MeasuredTemplate {

  static fromToken(tokenData) {

    const templateData = {
      t: "circle",
      user: game.user.id,
      //distance: 2.5, //@todo scale by token/grid size instead
      distance: 2.5 * tokenData.width,
      x: 0,
      y: 0,
      fillColor: game.user.color
    }

    //create the MeasuredTemplate document
    const template = new CONFIG.MeasuredTemplate.documentClass(templateData, {parent: canvas.scene});
    const templateObject = new this(template);
    templateObject.tokenData = tokenData;

    return templateObject;
  }

  /* -----------EXAMPLE CODE FROM MEASUREDTEMPLATE.JS--------- */
  /* get license 

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
    this.handle = this.addChild(new PIXI.Graphics());

    // Draw the control icon
    this.controlIcon = this.addChild(this._drawControlIcon());

    // Draw the ruler measurement
    this.ruler = this.addChild(this._drawRulerText());

    // Update the shape and highlight grid squares
    this.refresh();
    this.highlightGrid();

    // Enable interactivity, only if the Tile has a true ID
    if ( this.id ) this.activateListeners();
    return this;
  }

  /**
   * Draw the ControlIcon for the MeasuredTemplate
   * @return {ControlIcon}
   * @private
   */
  _drawControlIcon() {
    const size = Math.max(Math.round((canvas.dimensions.size * 0.5) / 20) * 20, 40);

    //BEGIN WARPGATE
    let icon = new ControlIcon({texture: this.protoToken.img, size: size});
    //END WARPGATE
    icon.x -= (size * 0.5);
    icon.y -= (size * 0.5);
    return icon;
  }
  
  /**
   * Update the displayed ruler tooltip text
   * @private
   */
  _refreshRulerText() {
    //BEGIN WARPGATE
    this.ruler.text = this.protoToken.name;
    //END WARPGATE
    this.ruler.position.set(this.ray.dx + 10, this.ray.dy + 5);
  }
  /* -----------EXAMPLE CODE FROM ABILITY-TEMPLATE.JS--------- */
  /* GPL 3

  /**
   * Creates a preview of the spell template
   */
  drawPreview() {
    this.initialLayer = canvas.activeLayer;

    // Draw the template and switch to the template layer
    this.draw();
    this.layer.activate();
    this.layer.preview.addChild(this);

    // Hide the sheet that originated the preview
    if ( this.actorSheet ) this.actorSheet.minimize();

    // Activate interactivity
    this.activatePreviewListeners();
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
    this.callBack(this.data);
    //END WARPGATE
  }

  _clearHandlers(event) {
    this.layer.preview.removeChildren();
    canvas.stage.off("mousemove", this.activeMoveHandler);
    canvas.stage.off("mousedown", this.activeLeftClickHandler);
    canvas.app.view.oncontextmenu = null;
    canvas.app.view.onwheel = null;
    this.initialLayer.activate();
    this.actorSheet.maximize();

  }

  /**
   * Activate listeners for the template preview
   * @param {CanvasLayer} initialLayer  The initially active CanvasLayer to re-activate after the workflow is complete
   */
  activatePreviewListeners() {
    this.moveTime = 0;
    //BEGIN WARPGATE
    /* Activate listeners */
    this.activeMoveHandler = this._mouseMoveHandler.bind(this);
    this.activeLeftClickHandler = this._leftClickHandler.bind(this);
    this.clearHandlers = this._clearHandlers.bind(this);

    // Update placement (mouse-move)
    canvas.stage.on("mousemove", this.activeMoveHandler);

    // Confirm the workflow (left-click)
    canvas.stage.on("mousedown", this.activeLeftClickHandler);

    canvas.app.view.oncontextmenu = this.clearHandlers;
    // END WARPGATE
  }
}

export class Crosshairs extends MeasuredTemplate {

  static fromToken(tokenData) {

    const templateData = {
      t: "circle",
      user: game.user.id,
      distance: 2.5, //scale by token/grid size instead
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

  /* -----------EXAMPLE CODE FROM ABILITY-TEMPLATE.JS--------- */

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
    this.callBack(this.data);
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
    /* Activate listeners */
    this.activeMoveHandler = this._mouseMoveHandler.bind(this);
    this.activeLeftClickHandler = this._leftClickHandler.bind(this);
    this.clearHandlers = this._clearHandlers.bind(this);

    // Update placement (mouse-move)
    canvas.stage.on("mousemove", this.activeMoveHandler);

    // Confirm the workflow (left-click)
    canvas.stage.on("mousedown", this.activeLeftClickHandler);

    canvas.app.view.oncontextmenu = this.clearHandlers;
  }
}

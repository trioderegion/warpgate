const fields = foundry.data.fields;

/**
 *
 *
 * @class CrosshairsDocument
 * @extends {MeasuredTemplateDocument}
 *
 */
class CrosshairsDocument extends MeasuredTemplateDocument {

  static defineSchema() {
    return foundry.utils.mergeObject(super.defineSchema(), {
      borderDisplay: new fields.BooleanField(),
      icon: new fields.SchemaField({
        display: new fields.BooleanField(),
        texture: new fields.FilePathField({categories: ["IMAGE", "VIDEO"]}),
      }),
      snap: new fields.SchemaField({
        position: new fields.NumberField({initial: CONST.GRID_SNAPPING_MODES.VERTEX}),
        size: new fields.NumberField({initial: CONST.GRID_SNAPPING_MODES.VERTEX | CONST.GRID_SNAPPING_MODES.CENTER | CONST.GRID_SNAPPING_MODES.EDGE_MIDPOINT}),
      }),
      fillAlpha: new fields.AlphaField(),
      label: new fields.SchemaField({
        display: new fields.BooleanField(),
        text: new fields.StringField(),
        dx: new fields.NumberField(),
        dy: new fields.NumberField(),
      }),
      textureTile: new fields.NumberField(),
    })
  }

  

  static get placeableClass() {
    return CrosshairsPlaceable;
  }
  
  /** @inheritdoc */
  constructor() {
    super({
      t:"cone",
      user: game.user.id,
      distance: 10,
    }, {parent: canvas.scene});

  }

  #layer;
  token;

  get layer() {
    if (this.#layer) return this.#layer;
    const create = (doc) => new this.constructor.placeableClass(doc);
    const sink = {
      get(target, prop) {
        switch (prop) {
          case 'createObject':
            return create;
          default:
            return target[prop];
        }
      }
    }

    this.#layer = new Proxy(canvas.activeLayer, sink);
    return this.#layer;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const gridUnits = this.distance / this.parent.grid.distance;
    this.radius = gridUnits * this.parent.grid.size;
    this.token ??= {};
    if (this.t !== CONST.MEASURED_TEMPLATE_TYPES.RECTANGLE) {
      this.token.x = this.x - this.radius;
      this.token.y = this.y - this.radius;
    }

    this.token.width = gridUnits * 2;
    this.token.height = gridUnits * 2;
  }

  show() {
    this._destroyed = false;
    this.#layer = null;
    return this.object.show();
  }

}

class CrosshairsPlaceable extends MeasuredTemplate {

  /** @inheritdoc */
  //refresh(options={}) {
  //  //if (this.destroyed) {
  //  //  this._destroyed = false;
  //  //  this.draw().then( () => this.layer.preview.addChild(this) )
  //  //}
  //  else super.refresh(options);
  //  return this;
  //}

  #handlers = {
    confirm: null,
    cancel: null,
    move: null,
    wheel: null
  }

  #promise = {
    resolve: null,
    reject: null,
  }

  #isDrag = false;

  async show() {
    await this.draw();
    this.layer.addChild(this);
    this.layer.interactiveChildren = false;
    return this.activateShowListeners();
  }

  async activateShowListeners() {
    return new Promise( (resolve, reject) => {
      this.#promise.resolve = resolve;
      this.#promise.reject = reject;
      this.#handlers.move = this._onMove.bind(this); 
      this.#handlers.confirm = this._onConfirm.bind(this);
      this.#handlers.cancel = this._onCancel.bind(this);
      this.#handlers.wheel = this._onWheel.bind(this);
      //canvas.stage.removeAllListeners();
      canvas.stage.on("mousemove", this.#handlers.move);
      canvas.stage.on("mouseup", this.#handlers.confirm);
      canvas.app.view.oncontextmenu = this.#handlers.cancel;
      canvas.app.view.onwheel = this.#handlers.wheel;
    });
  }

  getSnappedPoint(point, mode = this.document.snap.position) {
    return canvas.grid.getSnappedPoint(point, {mode, resolution: 1});
  }

  _onMove(evt) {

    //evt.stopPropagation();

    // Apply a 20ms throttle
    const now = Date.now();
    const leftDown = (evt.buttons & 1) > 0;
    if (canvas.mouseInteractionManager.isDragging) {
      this.#isDrag = true;
      if (leftDown) {
        canvas.mouseInteractionManager.cancel(evt);
      }
    }
    //console.debug('mouse tick. left button =', leftDown);
    if (now - this.moveTime <= 20) return;

    const center = evt.data.getLocalPosition(this.layer);
    if(this.#isDrag && leftDown) {
      //console.debug('left dragging');
      //canvas.mouseInteractionManager.cancel(evt);
      //evt.preventDefault();
      //evt.stopPropagation();
      canvas.activeLayer.preview.removeChildren();
      const drag = new Ray(this.document, this.getSnappedPoint(center, this.document.snap.size));
      const distance = drag.distance / this.document.parent.grid.size * this.document.parent.grid.distance
      this.document.updateSource({distance: distance, direction: Math.toDegrees(drag.angle)});
    } else if (!this.#isDrag && !leftDown) {
      //console.debug('no drag');
      const {x,y} = this.getSnappedPoint(center);
      this.document.updateSource({x, y});
    } 

    this.refresh();
    this.moveTime = now;
  }

  destroy(options={}) {
    this._clearHandlers();
    super.destroy();
  }

  _clearHandlers(evt) {
    canvas.stage.off("mousemove", this.#handlers.move);
    canvas.stage.off("mouseup", this.#handlers.confirm);
    canvas.app.view.oncontextmenu = null;
    canvas.app.view.onwheel = null;
    this.layer.interactiveChildren = true;
  }

  _onConfirm(evt) {
    if (this.#isDrag) {
      this.#isDrag = false;
      return;
    }
    evt.preventDefault();
    this.destroy();
    this.#promise.resolve(this.document);
  }

  _onCancel(evt) {
    if (this.#isDrag) {
      this.#isDrag = false;
      return;
    }
    this.destroy();
    this.#promise.reject(this.document);
  }

  _onWheel(evt) {
    if (evt.altKey) return;
    evt.stopPropagation();

    /* scroll up = bigger */
    const step = this.document.parent.grid.distance / 2
    const delta = step * Math.sign(-evt.deltaY);
    const distance = this.document.distance + delta;
    this.document.updateSource({distance: distance.toNearest(step)});
    this.refresh();
  }
}

Hooks.on("ready", () => {
  console.log('Crosshairs2 loaded'); 
  globalThis.Crosshairs = CrosshairsDocument;
});

export default class CrosshairsPlaceable extends MeasuredTemplate {

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

    const now = Date.now();
    const leftDown = (evt.buttons & 1) > 0;
    if (canvas.mouseInteractionManager.isDragging) {
      this.#isDrag = true;
      if (leftDown) {
        canvas.mouseInteractionManager.cancel(evt);
        //TODO try 'canvas.activeLayer._onDragLeftCancel(evt)'
      }
    }
    
    // Apply a 20ms throttle
    if (now - this.moveTime <= 20) return;

    const center = evt.data.getLocalPosition(this.layer);
    if(this.#isDrag && leftDown) {
      //canvas.activeLayer.preview.removeChildren();
      const drag = new Ray(this.document, this.getSnappedPoint(center, this.document.snap.size));
      const distance = drag.distance / this.document.parent.grid.size * this.document.parent.grid.distance
      this.document.updateSource({distance: distance, direction: Math.toDegrees(drag.angle)});
    } else if (!this.#isDrag && !leftDown) {
      const {x,y} = this.getSnappedPoint(center);
      this.document.updateSource({x, y});
    } 

    this.refresh();
    this.moveTime = now;
  }

  /** @override */
  _destroy(options={}) {
    this._clearHandlers();
    super._destroy(options);
  }

  _clearHandlers(evt) {
    canvas.stage.off("mousemove", this.#handlers.move);
    canvas.stage.off("mouseup", this.#handlers.confirm);
    canvas.app.view.oncontextmenu = null;
    canvas.app.view.onwheel = null;
    this.layer.interactiveChildren = true;
  }

  _onConfirm(evt) {
    evt.preventDefault();

    if (this.#isDrag) {
      this.#isDrag = false;
      return;
    }

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
    if (!evt.altKey || !evt.ctrlKey || !evt.shiftKey) return;

    evt.stopPropagation();
    if (evt.shiftKey) {

      /* scroll up = bigger */
      const step = this.document.parent.grid.distance / 2
      const delta = step * Math.sign(-evt.deltaY);
      const distance = this.document.distance + delta;
      this.document.updateSource({distance: distance.toNearest(step)});
      this.refresh();
    }

    if (evt.altKey) {
      // TODO rotate
    }

    if (evt.ctrlKey) {
      // TODO widen
    }
  }
}

// try to use a proper type
declare global {
  interface LenientGlobalVariableTypes {
    game: game; 
    canvas: canvas;
  }
}

declare class ClientDocument extends ClientDocumentMixin(Document<>) {
  get constructor(): any; 
}

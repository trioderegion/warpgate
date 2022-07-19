//class ClientDocument extends ClientDocumentMixin(Document<>) {
//  get constructor(): any; 
//}


type ClientDocument = ClientDocumentMixin<foundry.abstract.Document<ConcreteDocumentData, Document<any,any>, ConcreteMetadata>>
type Shorthand = Object<string, object>;

type EmbeddedUpdateEntry = {
  collectionName: string,
  shorthand: Shorthand,
  options: object,
  comparisonKey: string,
};

type EmbeddedUpdate = Object<string, Array<EmbeddedUpdateEntry>>;

type Delta = {
  document: {
    update: object,
    options: object,
  },
  embedded: EmbeddedUpdate
}

type StackCallbackEntry = {
  fn: Function,
  context: object;
};

type StackCallbacks = Object<string, Array<StackCallbackEntry>>;

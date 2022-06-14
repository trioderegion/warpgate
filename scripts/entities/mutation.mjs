import {MODULE} from '../module.js'
import {MutationStack} from '../mutation-stack.js'

export class Mutation {

  static STAGE = {
    PRE_MUTATE: 0,
    POST_MUTATE: 1,
    POST_REVERT: 2,
  }

  static _parseUpdateShorthand(collection, updates, comparisonKey) {
    let parsedUpdates = Object.keys(updates).map((key) => {
      if (updates[key] === warpgate.CONST.DELETE) return { _id: null };
      const _id = collection.find( element => getProperty(element.data,comparisonKey) === key )?.id ?? null;
      return {
        ...updates[key],
        _id,
      }
    });
    parsedUpdates = parsedUpdates.filter( update => !!update._id);
    return parsedUpdates;
  }

  static _parseDeleteShorthand(collection, updates, comparisonKey) {
    let parsedUpdates = Object.keys(updates).map((key) => {
      if (updates[key] !== warpgate.CONST.DELETE) return null;
      return collection.find( element => getProperty(element.data, comparisonKey) === key )?.id ?? null;
    });

    parsedUpdates = parsedUpdates.filter( update => !!update);
    return parsedUpdates;
  }

  static _parseAddShorthand(collection, updates, comparisonKey){
    let parsedAdds = Object.keys(updates).map((key) => {

      /* ignore deletes */
      if (updates[key] === warpgate.CONST.DELETE) return false;

      /* ignore item updates for items that exist */
      if (collection.find( element => getProperty(element.data, comparisonKey) === key)) return false;
      
      let data = updates[key];
      setProperty(data, comparisonKey, key);
      return data;
    });
    parsedAdds = parsedAdds.filter( update => !!update);
    return parsedAdds;

  }

  static _invertShorthand(collection, updates, comparisonKey){
    let inverted = {};
    Object.keys(updates).forEach( (key) => {
      /* this is a delete */
      if (updates[key] === warpgate.CONST.DELETE) {
        /* find this item currently and copy off its data */ 
        const currentData = collection.find( element => getProperty(element.data, comparisonKey) === key );
        /* hopefully we found something */
        if(currentData)
          setProperty(inverted, key, currentData.toObject());
        return;
      }

      /* this is an update */
      const foundItem = collection.find( element => getProperty(element.data, comparisonKey) === key)
      if (foundItem){
        /* grab the current value of any updated fields and store */
        const expandedUpdate = expandObject(updates[key]);
        const sourceData = foundItem.toObject();
        const updatedData = mergeObject(sourceData, expandedUpdate, {inplace: false});
        const diff = diffObject(updatedData, sourceData)

        setProperty(inverted, updatedData[comparisonKey], diff);
        return;
      }

      /* must be an add, so we delete */
      setProperty(inverted, key, warpgate.CONST.DELETE);

    });

    return inverted;
  }

  constructor(document, {id = randomID(), config = {}} = {}){
    this._document = document;
    this._id = id;

    /* prefill valid embedded types */
    Object.keys(document.constructor.implementation.metadata.embedded).forEach(embeddedKey => this._embeddedShorthand[embeddedKey] = {})

    /* prefill remaining default config options */
    this._config.name = id;

    /* merge in any provided configs */
    mergeObject(this._config, config);
  }

  /* @private */
  _document = null;

  get document() {
    return this._document;
  }

  /* @private */
  _id = null;

  get id() {
    return this._id;
  }

  /* @private */
  _update = {};

  /* @private */
  _embeddedShorthand = {};

  /* @private */
  _embeddedComparisonKey = { default: 'name', ActiveEffect: 'label'};

  /* @private */
  _callbacks = {};

  /* @private */
  _revertData = null; 

  /* @private */
  _config = {
    permanent: false,
    name: null,
    description: '',
    hidden: false,
  };

  get config() {
    return this._config;
  }

  get metadata() {

    const data = { 
      class: this.constructor.name,
      name: this.config.name,
      id: this._id,
      description: this.config.description,
      hidden: this.config.hidden
    };

    return data;

  }

  /* @private */
  _links = [];
  

  /**************
   * Configuration
   *************/

  permanent(bool) {
    if(bool == undefined) return this._config.permanent;

    this._config.permanent = bool;
    return this;
  }

  name(string) {
    if(string == undefined) return this._config.name;

    this._config.name = string;
    return this;
  }

  description(string) {
    if(string == undefined) return this._config.description;

    this._config.description = string;
    return this;
  }

  hidden(bool) {
    if(bool == undefined) return this._config.hidden;

    this._config.hidden = bool;
    return this;
  }

  /*
   * @param {undefined|Boolean|Object} data
   */
  revertData(data) {

    /* get request, generate data lazily */
    if(data == undefined || data === true){

      if(!this._revertData || data === true) {
        this._revertData = this._invertUpdate();
      }

      return this._revertData;
    }

    this._revertData = data;
    return this;
  }

  _invertUpdate() {
    const docData = this._rootDocumentData();
    const reverseDelta = diffObject(this.getUpdate(), docData, {inner: true});

    let embeddedInvert = {};
    for (const [embeddedName, embeddedData] of Object.entries(this.getEmbeddedShorthand()) ){

      /* do not process null or empty embedded data */
      if(isObjectEmpty(embeddedData.updateShorthand ?? {})) continue;

      const collection = this._document.getEmbeddedCollection(embeddedName);
      const invertedShorthand = this.constructor._invertShorthand(collection, embeddedData.updateShorthand , embeddedData.comparisonKey)
      embeddedInvert[embeddedName] = {
        ...embeddedData,
        embeddedShorthand: invertedShorthand,
      }
    }

    return {document: reverseDelta, embedded: embeddedInvert};
  }

  _rootDocumentData() {
    let docData = this._document.toObject();

    /* get the key NAME of the embedded document type.
     * ex. not 'ActiveEffect' (the class name), 'effect' the collection's field name
     */
    const embeddedFields = Object.values(this._document.constructor.metadata.embedded).map( thisClass => thisClass.metadata.collection );

    /* delete any embedded fields from the actor data */
    embeddedFields.forEach( field => { delete docData[field] } )

    return docData;
  }

  /************
   * Mutation commands
   * *********/

  add(data, updateOptions = null) {
    const expanded = expandObject(data); 
    mergeObject(this._update, expanded);

    if(updateOptions) {
      mergeObject(this._updateOptions, updateOptions);
    }

    return this;
  }

  callback(stage, fn, context) {

    /* allocate space for this callback */
    if (!this._callbacks[stage]) {
      this._callbacks[stage] = [];
    }

    /* store it */
    this._callbacks[stage] = {fn, context};

    return this;
  }

  addEmbedded(collectionName, updateShorthand, {comparisonKey = this._embeddedComparisonKey.default, updateOptions = null} = {}) {
    
    /* valid embedded collection? */
    if (_embeddedUpdate[collectionName]) {

      updateShorthand = expandObject(updateShorthand);

      let data = {
        collectionName,
        updateShorthand,
        updateOptions,
        comparisonKey,
      }

      /* merge into current embedded shorthand */
      mergeObject(this._embeddedShorthand[collectionName], data);

      return this;
    }

    logger.error(MODULE.format('error.badCollection',
      {name: collectionName, docType: this._document.documentName}
    ));

    return false;
  }

  link(otherMutator, biDirectional = false) {

    if(biDirectional) {
      /* two way, they know about us */
      otherMutator.link(this);
    } else {
      /* one way, we are managing them */ 
      otherMutator.hidden( true );
    }

    this._links.push(otherMutator);
    return this;
  }

  getUpdate() {
    return this._update;
  }

  getEmbeddedShorthand(collectionName = null) {
    if(collectionName == undefined) return this._embeddedShorthand;
    return this._embeddedShorthand[collectionName];
  }

  getComparisonKey(collectionName) {
    return this._embeddedComparisonKey[collectionName];
  }

  updateMutationStack() {
    const stack = new MutationStack(this._document);

    stack.create(this.metadata, this.revertData());

    /* Create a new mutation stack flag data and store it in the update object */
    const flags = {[MODULE.data.name]: {mutate: stack.stack}};
    this.add({flags});

    return this;
  }

  bin() {
    return [this, ...this._links]; 
  }

}

export class EmbeddedMutation extends Mutation {

  static _collectionChangeToArray(collectionChanges) {
    return {};
  }

  getUpdate() {
    let update = super.getUpdate()

    const collectionChanges = super.getEmbeddedShorthand();
    const directCollectionUpdate = EmbeddedMutation._collectionChangeToArray(collectionChanges);
    mergeUpdate(update, directCollectionUpdate);
    return update;
  }

  getEmbeddedShorthand() {
    return {};
  }
}


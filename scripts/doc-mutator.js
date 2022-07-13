import {Mutation} from "./entities/mutation.mjs";
import {logger} from "./logger.js";
import {MODULE} from "./module.js";
import {Mutator} from "./mutator.js";
import {MutationStack, StackData} from "./mutation-stack.js"

const NAME = "DocMutator";

export class DocMutator {
  static register() {
    Hooks.once("ready", () => {
      globalThis.DocMutator = DocMutator;
      globalThis.Mutation = Mutation;
    });
  }

  /**
   * @param {Mutation} mutation
   */
  static async apply(mutation) {
    logger.debug("Mutate Info", mutation);

    let callbackRet = {};

    /* premutate callback */
    const preRet = await Promise.all(
      mutation.callAll(Mutation.STAGE.PRE_MUTATE)
    );

    /* can be cancelled, if so, bail */
    if (preRet.some((ret) => ret === false)) return false;
    callbackRet[Mutation.STAGE.PRE_MUTATE] = preRet;

    const docRet = await DocMutator._updateDocument(mutation);
    const embedRet = await DocMutator._updateEmbedded(mutation);

    /* post mutate callback (no cancel to be had) */
    callbackRet[Mutation.STAGE.POST_MUTATE] = await Promise.all(
      mutation.callAll(Mutation.STAGE.POST_MUTATE)
    );

    return { doc: docRet, embed: embedRet, callbacks: callbackRet };
  }

  /** 
   * updates the document from pre-prepared mutation
   * @param {Mutation} mutation
   */
  static async _updateDocument(mutation) {

    const doc = mutation.document;
    const {update, options} = mutation.getUpdate();

    logger.debug('Performing update:',doc, update);
    
    await MODULE.wait(MODULE.setting('updateDelay')); // @workaround for semaphore bug

    /** perform the updates */
    if (update) await doc?.update(update, options);

    return;
  }

  /**
   * embeddedUpdates keyed by embedded name, contains shorthand
   * @param {Mutation} mutation
   */
  static async _updateEmbedded(mutation){

    const doc = mutation.document;
    const embeddedUpdates = mutation.getEmbedded();

    for(const embedded of Object.values(embeddedUpdates)){
      await Mutator._performEmbeddedUpdates(
        doc, 
        embedded.collectionName, 
        embedded.shorthand,
        embedded.comparisonKey
      );
    }

  }

  /*
  static async revertTest(document, mutationName = undefined) {

    const mutateData = await Mutator._popMutation(document, mutationName);

    await Mutator._updateDocument(document, mutateData.delta, {
      comparisonKeys: mutateData.comparisonKeys,
    });

  }
  */

  /**
   * @param {ClientDocument} document
   * @param {object} [options]
   * @param {string} [options.name]
   * @param {string} [options.id]
   */
  static async revert(document, {name = '', id = ''} = {}) {

    const stack = new MutationStack(document);


    /** @type StackData */
    let entry = id ? stack.get(id) : name ? stack.getName(name) : stack.pop();

    //TODO check permissions, route to owner as remote mutate
    const docUpdate = stack.unroll(entry.id);
    
    //construct Mutation derived class from class field
    /** @type Mutation */
    const revivedMut = globalThis.warpgate.mutators[entry.cls].fromStackData(document, docUpdate);
    
    let callbackRet = {}
    //run pre-revert callbacks
    const preRet = await Promise.all(
      revivedMut.callAll(Mutation.STAGE.PRE_REVERT, stack)
    );

    /* can be cancelled, if so, bail */
    if (preRet.some((ret) => ret === false)) return false;
    callbackRet[Mutation.STAGE.PRE_MUTATE] = preRet;

    /* Add stack (flags.warpgate.mutate) to the update */
    revivedMut.add(stack.toObject(true)); 

    //apply the changes
    const result = await DocMutator.apply(revivedMut);
    
    //run through the links array and call revert (ourself) from on each muid in that list
    //TODO

    //Post revert callback
    //TODO

    return result;
  }

  /**
   * @param {Mutation} mutation
   */
  static async mutate(mutation) {

    /* if not permanent, we need to create revert data */
    if (!mutation.permanent()) {
      mutation.updateMutationStack();
    }

    const binnedMutations = mutation.bin();

    const promises = binnedMutations.map((mut) => DocMutator.apply(mut));

    const results = await Promise.all(promises);

    return mutation.cleanup(results);
  }

  static async _popMutation(doc, mutationName) {

    let mutateStack = doc?.getFlag(MODULE.data.name, 'mutate');

    if (!mutateStack || !doc){
      logger.debug(`Could not pop mutation named ${mutationName} from actor ${doc?.name}`);
      return undefined;
    }

    let mutateData = undefined;

    if (!!mutationName) {
      /* find specific mutation */
      const index = mutateStack.findIndex( mutation => mutation.name === mutationName );

      /* check for no result and error */
      if ( index < 0 ) {
        logger.error(`Could not locate mutation named ${mutationName} in actor ${doc.name}`);
        return undefined;
      }

      /* otherwise, retrieve and remove */
      mutateData = mutateStack.splice(index, 1)[0];

      for( let i = index; i < mutateStack.length; i++){

        /* get the values stored in our delta and push any overlapping ones to
         * the mutation next in the stack
         */
        const stackUpdate = filterObject(mutateData.delta, mutateStack[i].delta);
        mergeObject(mutateStack[i].delta, stackUpdate);

        /* remove any changes that exist higher in the stack, we have
         * been overriden and should not restore these values
         */
        mutateData.delta = MODULE.unique(mutateData.delta, mutateStack[i].delta)
      }

    } else {
      /* pop the most recent mutation */
      mutateData = mutateStack?.pop();
    }

    /* if there are no mutations left on the stack, remove our flag data
     * otherwise, store the remaining mutations */
    if (mutateStack.length == 0) {
      await doc.unsetFlag(MODULE.data.name, 'mutate');
    } else {
      await doc.setFlag(MODULE.data.name, 'mutate', mutateStack);
    }
    logger.debug(MODULE.localize('debug.finalRevertUpdate'), mutateData);
    return mutateData;
  }
}

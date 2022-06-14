
import {logger} from './logger.js'
import {MODULE} from './module.js'
import {Mutator} from './mutator.js'
import {Mutation} from './entities/mutation.mjs'

const NAME = "DocMutator";

export class DocMutator {

  static register() {

    Hooks.once('ready', ()=>{
      globalThis.DocMutator = DocMutator;
      globalThis.Mutation = Mutation;
    });
  }


  static async apply(mutation) {


    //logger.debug('Document Delta', MODULE.localize('debug.actorDelta'), docDelta, MODULE.localize('debug.embeddedDelta'), embeddedDelta);

    logger.debug('Mutate Info', mutation);

    await Mutator._updateDocument(mutation);

    await Mutator._updateEmbedded(mutation);
  }

  static async revertTest(document, mutationName = undefined) {
    const mutateData = await Mutator._popMutation(document, mutationName);
    await Mutator._updateDocument(document, mutateData.delta, {comparisonKeys: mutateData.comparisonKeys});
  }

  static async mutate(mutation) {
    
    /* if not permanent, we need to create revert data */
    if(!mutation.permanent()) {

      // @TODO placeholder for callback execution -- should the mutation handle it directly? or the doc mutator (as shown)
      //const continueExecution = await DocMutator._runCallbacks(Mutation.STAGE.PRE_MUTATE, mutation);
      //if (!continueExecution) return mutation;

      mutation.updateMutationStack();

    }

    const binnedMutations = mutation.bin(); 

    const promises = binnedMutations.map( mut => DocMutator.apply(mut) );

    await Promise.all(promises);

    return mutation;
  }

}

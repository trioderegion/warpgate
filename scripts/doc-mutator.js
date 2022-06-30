import { logger } from "./logger.js";
import { MODULE } from "./module.js";
import { Mutator } from "./mutator.js";
import { Mutation } from "./entities/mutation.mjs";

const NAME = "DocMutator";

export class DocMutator {
  static register() {
    Hooks.once("ready", () => {
      globalThis.DocMutator = DocMutator;
      globalThis.Mutation = Mutation;
    });
  }

  /**
   * @parm {Mutation} mutation
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
    const embedRet = await Mutator._updateEmbedded(mutation);

    /* post mutate callback (no cancel to be had) */
    callbackRet[Mutation.STAGE.POST_MUTATE] = await Promise.all(
      mutation.callAll(Mutation.STAGE.POST_MUTATE)
    );

    return { doc: docRet, embed: embedRet, callbacks: callbackRet };
  }

  /* updates the document and any embedded documents of this document */
  static async _updateDocument(mutation) {

    const doc = mutation.document;
    const {update, options} = mutation.getUpdate();
    const stack = mutation.stack;

    logger.debug('Performing update:',doc, update, stack);
    await warpgate.wait(MODULE.setting('updateDelay')); // @workaround for semaphore bug

    /** perform the updates */
    if (update) await doc.update(update, options);

    return;
  }

  static async revertTest(document, mutationName = undefined) {
    const mutateData = await Mutator._popMutation(document, mutationName);
    await Mutator._updateDocument(document, mutateData.delta, {
      comparisonKeys: mutateData.comparisonKeys,
    });
  }

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
}

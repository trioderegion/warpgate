# Warp Gate

**Reinforcements have arrived**

Warp Gate, in its current form, is a system-agnostic library module for Foundry VTT that provides a select few number of public API functions to make programmatically spawning tokens and modifying those tokens easier for players and GMs alike.

https://user-images.githubusercontent.com/14878515/127940403-40301919-8a12-42e0-b3c4-7711f6e64b3b.mp4

## Usage

Be sure to check out the [Warp Gate Wiki](https://github.com/trioderegion/warpgate/wiki) for specific examples and further discussion!

### `await warpgate.spawn(actorName, updates = {}, callbacks = {}, options = {})`
Parameters:
1. `String` Name of actor to spawn
3. `Object` Updates to the spawned actor (optional). See "Update Shorthand".
4. `Object` Callback functions (optional). See "Callback Functions".
5. `Object` (optional) Currently, only expects `controllingActor` and simply minimizes its open sheet for a clearer view of the canvas during placement.

The primary function of Warp Gate. When executed, it will create a custom MeasuredTemplate that is used to place the spawned token and handle any customizations provided in the Update object. `spawn` will return a Promise that can be awaited, which can be used in loops to spawn multiple tokens, one after another. The player spawning the token will also be given Owner permissions for that specific token actor. This means that players can spawn any creature in the world.

Example:
```
const updates = {
    token : {name: "Giant Paw"}, //renaming the token
    actor : {name: "Badger's Weapon"}, //renaming the actor
    item: {
            "New Feature": { name: "Badger Whack!" }, //updating the "New Feature" of the spawn
            "DeleteMe" : warpgate.CONST.DELETE //deleting the feature "DeleteMe" of the spawn
            "Eat Bacon" : { type: 'feature' }
    }
}

const callbacks = {
    pre: async (template, update) => {
        console.log("Spawning in 2 seconds...");
        await warpgate.wait(2000);
    },
    post: (template, token) => { console.log("Reinforcements have arrived.")}
}

const options: {controllingActor: actor}
warpgate.spawn("Name of actor to warp in", updates, callbacks, options)
```


### `async warpgate.wait(timeMs)`
Helper function. Waits for a specified amount of time (be sure to await!). Useful for timings with animations in the pre/post callbacks.

### `warpgate.dismiss(tokenId, sceneId)`
Deletes the specified token from the specified scene. This function allows anyone to delete any specified token unless this functionality is restricted to only owned tokens in Warp Gate's module settings. This is the same function called by the "Dismiss" header button on owned actor sheets.

## Update Shorthand
The `update` object can contain up to three keys: `token`, `actor`, and `item`. The `token` and `actor` key values are standard update objects as one would use in `actor.update({...data})`.
The `item` key uses a shorthand notation to make creating the updates easier. Notably, it does not require the `_id` field to be part of the update object for a given item.  There are three operations that this dict object controls -- adding, updating, deleting (in that order).

### Add
Given a dict key of a **non-existing** item, the value contains the data object for item creation compatible with `Item.create({...value})`. This object can be constructed in-place by hand, or gotten from a template item and modified using `"Item To Add": game.items.getName("Name of Item").data`. Note: the name contained in the dict key will override the `name` field in any provided creation data.

### Update
Given a dict key of an existing item, the value contains the data object compatible with `Item.update({...value})`

### Delete
Assigning the dict key to the special constant `warpgate.CONST.DELETE` will remove this item (if it exists) from the spawned actor.
`{"Item Name To Delete": warpgate.CONST.DELETE}`

## Callback Functions
The `callbacks` object has two expected keys: `pre` and `post` and provide a way to execute custom code during the spawning process. Both key values are type `async function`.
* `async pre(templateData, updates)`: Executed after placement has been decided, but before updates have been issued. Used for modifying the updates based on position of the placement.
* `async post(templateData, spawnedTokenDoc)`: Executed after the token has been spawned and any updates applied. Good for animation triggers, or chat messages.
 

## Future Work
* Additional system-specific helper functions

## Special Thanks
* siliconsaint for the inspiration to turn a set of absurd macros into something usable.
* LorduFreeman for the pre and post callbacks and immediately using it for beautiful things.

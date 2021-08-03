# Warp Gate

**Reinforcements have arrived**

Warp Gate, in its current form, is a system-agnostic library module for Foundry VTT that provides a select few number of public API functions to make programmatically spawning tokens and modifying those tokens easier for players and GMs alike.

![Demo](.github/assets/warpgate_demo.mp4)

## Usage
### `warpgate.spawn(actorName, updates = {}, callbacks = {}, options = {})`
Parameters:
1. `String` Name of actor to spawn
3. `Object` Updates to the spawned actor (optional). See "Update Shorthand".
4. `Object` Callback functions (optional). See "Callback Functions".
5. `object` Currently, only expects `controllingActor` and simply minimizes its open sheet for a clearer view of the canvas.

The player spawning the token will also be given Owner permissions for that specific token actor. This means that players can spawn any creature in the world.

Example:
```
const updates = {
    token : {name: "Giant Paw"}, //renaming the token
    actor : {name: "Badger's Weapon"}, //renaming the actor
    item: {
            "New Feature": { name: "Badger Whack!" }, //updating the "New Feature" of the spawn
            "DeleteMe" : warpgate.CONST.DELETE //deleting the feature "DeleteMe" of the spawn
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

The primary function of Warp Gate. When executed, it will create a custom MeasuredTemplate that is used to place the spawned token and handle any customizations provided in the Update object.

### `async warpgate.wait(timeMs)`
Helper function. Waits for a specified amount of time (be sure to await!). Useful for timings with animations in the pre/post callbacks.

## Update Shorthand
The `update` object can contain up to three keys: `token`, `actor`, and `item`. The `token` and `actor` key values are standard update objects as one would use in `actor.update({...data})`.
The `item` key uses a shorthand notation to make creating the updates easier. Notably, it does not require the `_id` field to be part of the update object for a given item.
```
"First Item Name": update object as 'item.update({...data})',
"Second Item Name": warpgate.CONST.DELETE,
"Third Item Name" : ...,
etc
```
* Items can be deleted from a spawned actor via the use of `warpgate.CONST.DELETE`

## Callback Functions
The `callbacks` object has two expected keys: `pre` and `post` and provide a way to execute custom code during the spawning process. Both key values are type `async function`.
* `async pre(templateData, updates)`: Executed after placement has been decided, but before updates have been issued. Used for modifying the updates based on position of the placement.
* `async post(templateData, spawnedTokenDoc)`: Executed after the token has been spawned and any updates applied. Good for animation triggers, or chat messages.
 

## Future Work
* Ability for non-GMs to "dismiss" (delete) tokens that they have spawned.
* Ability to create items for the actor during spawning
* Additional system-specific helper functions

## Special Thanks
* siliconsaint for the inspiration to turn a set of absurd macros into something usable.
* LorduFreeman for the pre and post callbacks and immediately using it for beautiful things.

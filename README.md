# blockchain-state

[![npm version](https://img.shields.io/npm/v/blockchain-state.svg)](https://www.npmjs.com/package/blockchain-state)
[![Build Status](https://travis-ci.org/mappum/blockchain-state.svg?branch=master)](https://travis-ci.org/mappum/blockchain-state)
[![Dependency Status](https://david-dm.org/mappum/blockchain-state.svg)](https://david-dm.org/mappum/blockchain-state)

**A writable stream for applications that consume blocks**

This module should be used whenever you need to process blockchain blocks in order (e.g. wallets or any other application that needs to scan the blockchain). Handling of reorgs (switching from one blockchain fork to another) is simplified, and block sync progress is stored in a LevelUp database.

## Usage

`npm install blockchain-state`

```js
var BlockchainState = require('blockchain-state')

function add (block, tx, cb) {
  // called when a block should be processed
  cb() // call cb when done
}
function remove (block, tx, cb) {
  // called when a block should be un-processed
  cb() // call cb when done
}
var db = level('foo') // a LevelUp-compatible datastore
var state = new BlockchainState(add, remove, db)

// write blocks to the BlockchainState
// 'chain' is an instance of a Blockchain (from the
// 'blockchain-spv' module)
state.getHash(function (err, hash) {
  if (err) return console.log(err)
  // BlockchainState is a writable stream,
  // so we can pipe blocks directly into it
  chain.createReadStream({ from: hash }).pipe(state)
})
```

----
#### `new BlockchainState(add, remove, db, [opts])`

Creates a `BlockchainState` which can process blocks. `BlockchainState` is a writable stream, and expects an input of blocks in the format output by [`chain.createReadStream()`](https://github.com/mappum/blockchain-spv#chaincreatereadstreamopts) from the [`blockchain-spv`](https://github.com/mappum/blockchain-spv) module.

`add(block, tx, cb)` should be a function which will be called every time a new block should be processed. The arguments passed to it are:
- `block`: the block to be processed
- `tx`: a database transaction, which may be used to modify the LevelUp database while ensuring consistency with the blockchain state
- `cb`: a callback function that must be called when done processing the block (optionally with an error)

`remove(block, tx, cb)` is similar to `add`, but is instead called whenever a block should be un-processed (when it is now in an invalid fork)

`db` should be a [`LevelUp`](https://github.com/Level/levelup) instance where block data will be stored. The db should not be shared with another Blockchain (if you need to, use [`level-sublevel`](https://github.com/dominictarr/level-sublevel) to create a sub-section of your db).

----
#### `state.getHash(callback)`

Calls `callback(err, hash)` with the hash of the block most recently processed by the `BlockchainState`. If no blocks have been processed yet, `hash` will be `null`.

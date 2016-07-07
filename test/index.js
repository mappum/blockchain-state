var levelup = require('levelup')
var memdown = require('memdown')
var test = require('tape')
var BlockchainState = require('..')

function createDb (id) {
  return levelup(id || (Math.random() + ''), { db: memdown })
}
var add = function (block, tx, cb) {
  cb()
  this.emit('add', block, tx)
}
var remove = function (block, tx, cb) {
  cb()
  this.emit('remove', block, tx)
}

test('create BlockchainState', function (t) {
  t.test('normal constructor', function (t) {
    var db = createDb()
    var state = new BlockchainState(function () {}, function () {}, db)
    t.ok(state instanceof BlockchainState, 'got BlockchainState instance')
    t.end()
  })
  t.test('constructor without "new"', function (t) {
    var db = createDb()
    var state = BlockchainState(function () {}, function () {}, db)
    t.ok(state instanceof BlockchainState, 'got BlockchainState instance')
    t.end()
  })
  t.test('constructor with opts', function (t) {
    var db = createDb()
    var opts = { streamOpts: { highWaterMark: 123 } }
    var state = new BlockchainState(function () {}, function () {}, db, opts)
    t.ok(state instanceof BlockchainState, 'got BlockchainState instance')
    t.equal(state._writableState.highWaterMark, 123, 'stream highWaterMark set correctly')
    t.end()
  })
  t.test('constructor without "add" arg', function (t) {
    try {
      var state = new BlockchainState()
      t.notOk(state, 'should have thrown error')
    } catch (err) {
      t.ok(err, 'error thrown')
      t.equal(err.message, 'Argument "add" must be a function', 'correct error message')
    }
    t.end()
  })
  t.test('constructor without "remove" arg', function (t) {
    try {
      var state = new BlockchainState(function () {})
      t.notOk(state, 'should have thrown error')
    } catch (err) {
      t.ok(err, 'error thrown')
      t.equal(err.message, 'Argument "remove" must be a function', 'correct error message')
    }
    t.end()
  })
  t.test('constructor without "db" arg', function (t) {
    try {
      var state = new BlockchainState(function () {}, function () {})
      t.notOk(state, 'should have thrown error')
    } catch (err) {
      t.ok(err, 'error thrown')
      t.equal(err.message, 'Argument "db" must be a LevelUp instance', 'correct error message')
    }
    t.end()
  })
})

test('loading state', function (t) {
  var state
  var db = createDb()
  t.test('initialize new state', function (t) {
    state = new BlockchainState(add, remove, db, { interval: 0 })
    t.equal(state.ready, false, 'state.ready is false')
    state.once('ready', function (_state) {
      t.pass('"ready" event emitted')
      t.equal(state.ready, true, 'state.ready is true')
      t.equal(state.state, null, 'state.state is null')
      t.equal(_state, state.state, 'state emitted in event')
      t.end()
    })
  })

  t.test('write block to state', function (t) {
    t.plan(4)
    state.once('add', function () {
      t.pass('block added to state')
      t.ok(state.state.height, 123, 'state height is 123')
      t.equal(state.state.hash.toString('hex'),
        Buffer(32).fill('a').toString('hex'),
        'state hash is correct')
    })
    state.once('finish', function () {
      t.pass('stream finished')
    })
    state.write({
      height: 123,
      add: true,
      header: {
        getHash: function () { return Buffer(32).fill('a') }
      }
    })
    state.end()
  })

  t.test('load existing state', function (t) {
    var state = new BlockchainState(add, remove, db, { interval: 0 })
    t.equal(state.ready, false, 'state.ready is false')
    state.once('ready', function (_state) {
      t.pass('"ready" event emitted')
      t.equal(state.ready, true, 'state.ready is true')
      t.notEqual(state.state, null, 'state.state is not null')
      t.equal(state.state.height, 123, 'state height is 123')
      t.equal(state.state.hash.toString('hex'),
        Buffer(32).fill('a').toString('hex'),
        'state hash is correct')
      t.equal(_state, state.state, 'state emitted in event')
      t.end()
    })
  })
})

test('block order', function (t) {
  var db = createDb()
  var state

  t.test('create blockchain', function (t) {
    state = new BlockchainState(add, remove, db)
    state.once('ready', t.end)
  })

  t.test('write first blocks', function (t) {
    state.once('add', function () {
      t.equal(state.state.height, 0, 'state height is correct')
      t.equal(state.state.hash.toString('hex'),
        Buffer(32).fill(0).toString('hex'),
        'state hash is correct')
      state.once('add', function () {
        t.equal(state.state.height, 1, 'state height is correct')
        t.equal(state.state.hash.toString('hex'),
          Buffer(32).fill(1).toString('hex'),
          'state hash is correct')
        t.end()
      })
    })
    state.write({
      height: 0,
      add: true,
      header: {
        getHash: function () { return Buffer(32).fill(0) },
        prevHash: Buffer(32).fill(0)
      }
    })
    state.write({
      height: 1,
      add: true,
      header: {
        getHash: function () { return Buffer(32).fill(1) },
        prevHash: Buffer(32).fill(0)
      }
    })
  })

  t.test('write third block', function (t) {
    state.once('add', function () {
      t.equal(state.state.height, 2, 'state height is correct')
      t.equal(state.state.hash.toString('hex'),
        Buffer(32).fill(2).toString('hex'),
        'state hash is correct')
      t.end()
    })
    state.write({
      height: 2,
      add: true,
      header: {
        getHash: function () { return Buffer(32).fill(2) },
        prevHash: Buffer(32).fill(1)
      }
    })
  })

  t.test('remove third block', function (t) {
    state.once('add', function () {
      t.fail('should not have emitted "add"')
    })
    state.once('remove', function () {
      t.equal(state.state.height, 1, 'state height is correct')
      t.equal(state.state.hash.toString('hex'),
        Buffer(32).fill(1).toString('hex'),
        'state hash is correct')
      t.end()
    })
    state.write({
      height: 2,
      add: false,
      header: {
        getHash: function () { return Buffer(32).fill(2) },
        prevHash: Buffer(32).fill(1)
      }
    })
  })

  t.test('add block with incorrect height', function (t) {
    state.once('add', function () {
      t.fail('should not have emitted "add"')
    })
    state.once('error', function (err) {
      t.ok(err, '"error" event emitted')
      t.equal(err.message, 'Got block with incorrect height. Expected 2, but got 10', 'correct error message')
      t.end()
    })
    state.write({
      height: 10,
      add: true,
      header: {
        getHash: function () { return Buffer(32).fill(10) },
        prevHash: Buffer(32).fill(9)
      }
    })
  })

  t.test('add block with incorrect prevHash', function (t) {
    state.once('add', function () {
      t.fail('should not have emitted "add"')
    })
    state.once('remove', function () {
      t.fail('should not have emitted "remove"')
    })
    state.once('error', function (err) {
      t.ok(err, '"error" event emitted')
      t.equal(err.message, 'Got block with incorrect prevHash. Expected "0101010101010101010101010101010101010101010101010101010101010101" but got "0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a"', 'correct error message')
      t.end()
    })
    state.write({
      height: 2,
      add: true,
      header: {
        getHash: function () { return Buffer(32).fill(2) },
        prevHash: Buffer(32).fill(10)
      }
    })
  })

  t.test('remove block with incorrect height', function (t) {
    state.once('add', function () {
      t.fail('should not have emitted "add"')
    })
    state.once('remove', function () {
      t.fail('should not have emitted "remove"')
    })
    state.once('error', function (err) {
      t.ok(err, '"error" event emitted')
      t.equal(err.message, 'Got block with incorrect height. Expected 1, but got 10', 'correct error message')
      t.end()
    })
    state.write({
      height: 10,
      add: false,
      header: {
        getHash: function () { return Buffer(32).fill(1) },
        prevHash: Buffer(32).fill(0)
      }
    })
  })

  t.test('remove block with incorrect hash', function (t) {
    state.once('add', function () {
      t.fail('should not have emitted "add"')
    })
    state.once('remove', function () {
      t.fail('should not have emitted "remove"')
    })
    state.once('error', function (err) {
      t.ok(err, '"error" event emitted')
      t.equal(err.message, 'Got block with incorrect hash. Expected "0101010101010101010101010101010101010101010101010101010101010101" but got "0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a"', 'correct error message')
      t.end()
    })
    state.write({
      height: 1,
      add: false,
      header: {
        getHash: function () { return Buffer(32).fill(10) },
        prevHash: Buffer(32).fill(9)
      }
    })
  })
})

test('ready', function (t) {
  t.test('write before ready', function () {
    var db = createDb()
    var state = new BlockchainState(add, remove, db)
    state.write({
      height: 0,
      add: true,
      header: {
        getHash: function () { return Buffer(32).fill(0) },
        prevHash: Buffer(32).fill(0)
      }
    })
    state.once('add', function () {
      t.pass('"add" emitted')
      t.end()
    })
  })

  t.test('call getHash before ready', function (t) {
    var db = createDb()
    var state = new BlockchainState(add, remove, db)
    state.getHash(function (err, hash) {
      t.error(err, 'no error')
      t.equal(hash, null, 'got hash')
      t.end()
    })
  })
})

test('write', function (t) {
  t.test('write block without "add" property', function () {
    var db = createDb()
    var state = new BlockchainState(add, remove, db)
    state.once('error', function (err) {
      t.ok(err, 'error emitted')
      t.equal(err.message, 'block must have an "add" property', 'correct error message')
      t.end()
    })
    state.write({
      height: 0,
      header: {
        getHash: function () { return Buffer(32).fill(0) },
        prevHash: Buffer(32).fill(0)
      }
    })
  })
})

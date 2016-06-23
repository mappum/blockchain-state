var levelup = require('levelup')
var memdown = require('memdown')
var test = require('tape')
var BlockchainState = require('..')

function createDb (id) {
  return levelup(id || (Math.random() + ''), { db: memdown })
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
  var add = function (block, tx, cb) {
    cb()
    this.emit('add', block, tx)
  }
  var remove = function (block, tx, cb) {
    cb()
    this.emit('remove', block, tx)
  }

  var state
  var db = createDb()
  t.test('initialize new state', function (t) {
    state = new BlockchainState(add, remove, db)
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
      t.ok(state.state.height, 123, 'state.state.height is 123')
      t.equal(state.state.hash.toString('hex'),
        Buffer(32).fill('a').toString('hex'),
        'state.state.hash is correct')
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
    var state = new BlockchainState(add, remove, db)
    t.equal(state.ready, false, 'state.ready is false')
    state.once('ready', function (_state) {
      t.pass('"ready" event emitted')
      t.equal(state.ready, true, 'state.ready is true')
      t.notEqual(state.state, null, 'state.state is not null')
      t.equal(state.state.height, 123, 'state.state.height is 123')
      t.equal(state.state.hash.toString('hex'),
        Buffer(32).fill('a').toString('hex'),
        'state.state.hash is correct')
      t.equal(_state, state.state, 'state emitted in event')
      t.end()
    })
  })
})

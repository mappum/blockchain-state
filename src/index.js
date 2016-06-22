const { Writable } = require('stream')
const assign = require('object-assign')
const old = require('old')
const sublevel = require('sublevelup')
const transaction = require('level-transactions')

class BlockchainState extends Writable {
  constructor (add, remove, db, opts = {}) {
    if (typeof add !== 'function') {
      throw new Error('Argument "add" must be a function')
    }
    if (typeof remove !== 'function') {
      throw new Error('Argument "remove" must be a function')
    }
    if (!db) {
      throw new Error('Argument "db" must be a LevelUP instance')
    }
    opts.streamOpts = opts.streamOpts || {}
    opts.streamOpts.objectMode = true
    super(opts.streamOpts)
    this.opts = opts

    this.add = add
    this.remove = remove

    this.db = sublevel(db)
    this.stateDb = this.db.sublevel('chainstate')
    this.dataDb = this.db.sublevel('data')

    this.state = null
    this.start = null
    this.ready = false

    this._init(opts)
  }

  getHeight () {
    this._assertReady()
    return this.state.height
  }

  getHash () {
    this._assertReady()
    return this.state.hash
  }

  getPrevHash () {
    this._assertReady()
    return this.state.prevHash
  }

  getStart () {
    this._assertReady()
    return this.start
  }

  _error (err) {
    if (err) this.emit('error', err)
  }

  _assertReady () {
    if (this.ready) return
    throw new Error('BlockchainState is not ready yet (wait for "ready" event)')
  }

  _init (opts) {
    var ready = (state, start) => {
      this.state = state
      this.start = start
      this.ready = true
      this.emit('ready', state, start)
    }
    var loadState = (start) => {
      this.stateDb.get('height', (err, height) => {
        if (err && err.notFound) return ready(null, start)
        if (err) return this._error(err)
        this.stateDb.get('hash', { valueEncoding: 'hex' }, (err, hash) => {
          if (err) return this._error(err)
          ready({ height: +height, hash }, start)
        })
      })
    }
    this.stateDb.get('start', { valueEncoding: 'json' }, (err, start) => {
      if (err && !err.notFound) return this._error(err)
      if (err && err.notFound) {
        start = assign({
          time: 0,
          height: 0,
          hash: null
        }, opts.start)
        this.stateDb.put('start', start, { valueEncoding: 'json' }, (err) => {
          if (err) return this._error(err)
          loadState(start)
        })
      } else {
        loadState(start)
      }
    })
  }

  _transform (block, enc, cb) {
    if (block.add == null) {
      return cb(new Error('block must have an "add" property'))
    }
    try {
      this._checkBlockOrder(block)
    } catch (err) {
      return cb(err)
    }

    var tx = transaction(this.dataDb)

    var process = block.add ? this.add : this.remove
    process.call(this, block, tx, (err) => {
      if (err) {
        tx.rollback(err)
        return cb(err)
      }
      this._updateState(tx, block)
      tx.commit(cb)
    })
  }

  _checkBlockOrder (block) {
    if (!this.state) return

    var actualHeight = block.height
    var expectedHeight = this.state.height + (block.add ? 1 : 0)
    if (actualHeight !== expectedHeight) {
      throw new Error('Got block with incorrect height. Expected ' +
        `${expectedHeight}, but got ${actualHeight}`)
    }

    var actualHash = block.add ? block.header.prevHash : block.header.getHash()
    var expectedHash = this.state.hash
    if (!actualHash.equals(expectedHash)) {
      throw new Error('Got block with incorrect hash. Expected ' +
        `"${expectedHash.toString('hex')}" but got ` +
        `"${actualHash.toString('hex')}"`)
    }
  }

  _updateState (tx, block) {
    var height = block.add ? block.height : block.height - 1
    var hash = block.add ? block.header.getHash() : block.header.prevHash
    this.state = { height, hash }
    tx.put('height', height, { prefix: this.stateDb })
    tx.put('hash', hash, {
      prefix: this.stateDb,
      valueEncoding: 'hex'
    })
  }
}

module.exports = old(BlockchainState)

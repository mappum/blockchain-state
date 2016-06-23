const { Writable } = require('stream')
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
      throw new Error('Argument "db" must be a LevelUp instance')
    }
    opts.streamOpts = opts.streamOpts || {}
    opts.streamOpts.objectMode = true
    super(opts.streamOpts)

    this.add = add
    this.remove = remove

    this.db = sublevel(db)
    this.stateDb = this.db.sublevel('chainstate')
    this.dataDb = this.db.sublevel('data')

    this.state = null
    this.ready = false

    this._init(opts)
  }

  getHash (cb) {
    this.onceReady(() => {
      cb(null, this.state ? this.state.hash : null)
    })
  }

  getDB () {
    return this.dataDb
  }

  onceReady (f) {
    if (this.ready) return f()
    this.once('ready', f)
  }

  _error (err) {
    if (err) this.emit('error', err)
  }

  _init () {
    var ready = (state) => {
      this.state = state
      this.ready = true
      this.emit('ready', state)
    }
    this.stateDb.get('height', (err, height) => {
      if (err && err.notFound) return ready(null)
      if (err) return this._error(err)
      this.stateDb.get('hash', { valueEncoding: 'hex' }, (err, hash) => {
        if (err) return this._error(err)
        ready({ height: +height, hash })
      })
    })
  }

  _write (block, enc, cb) {
    this.onceReady(() => {
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
      throw new Error(`Got block with incorrect ${block.add ? 'prevH' : 'h'}ash. Expected ` +
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

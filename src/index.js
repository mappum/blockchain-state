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

    this.interval = opts.interval != null ? opts.interval : 1000
    this.commitTimeout = null
    this.periodStart = null
    this.processing = false

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
      this.stateDb.get('hash', { valueEncoding: 'binary' }, (err, hash) => {
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

      var tx = this.tx || transaction(this.dataDb)

      var commit = (cb) => {
        tx.put('height', this.state.height, { prefix: this.stateDb })
        tx.put('hash', this.state.hash, {
          prefix: this.stateDb,
          valueEncoding: 'binary'
        })
        this.tx = null
        if (this.commitTimeout) {
          clearTimeout(this.commitTimeout)
          this.commitTimeout = null
        }
        tx.commit(cb)
      }
      var rollback = (err) => {
        tx.rollback(err)
        this.tx = null
        if (this.commitTimeout) clearTimeout(this.commitTimeout)
        this.commitTimeout = null
        cb(err)
      }

      if (this.interval && !this.commitTimeout) {
        this.tx = tx
        this.periodStart = Date.now()
        this.commitTimeout = setTimeout(() => {
          if (this.processing) return
          commit(this._error.bind(this))
        }, this.interval)
      }

      var process = block.add ? this.add : this.remove
      this.processing = true
      process.call(this, block, tx, (err) => {
        this.processing = false
        if (err) return rollback(err)
        this._updateState(tx, block)
        this.emit('block', block)
        this.emit(block.add ? 'add' : 'remove', block)
        var elapsed = Date.now() - this.periodStart
        if (this.interval === 0 || elapsed >= this.interval) {
          commit(cb)
        } else {
          cb(null)
        }
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
  }
}

module.exports = old(BlockchainState)

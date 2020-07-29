const t = require('tap')
const fs = require('fs')

// delete this so that we don't have configs from the fact that it
// is being run by 'npm test'
for (env of Object.keys(process.env).filter(e => /^npm_/.test(e))) {
  delete process.env[env]
}

const { resolve } = require('path')

const actualPlatform = process.platform

const beWindows = () => {
  Object.defineProperty(process, 'platform', {
    value: 'win32',
    configurable: true
  })
}

const bePosix = () => {
  Object.defineProperty(process, 'platform', {
    value: 'posix',
    configurable: true
  })
}

const npmlog = require('npmlog')
const npmconf = require('../../lib/config/core.js')

const logs = []
for (const level of ['silly', 'verbose', 'timing', 'notice', 'warn', 'error']) {
  npmlog[level] = (...msg) => logs.push([level, ...msg])
}

const npm = require('../../lib/npm.js')

const CACHE = t.testdir()

t.test('not yet loaded', t => {
  t.match(npm, {
    started: Number,
    command: null,
    config: {
      loaded: false,
      get: Function,
      set: Function
    },
    version: String,
  })
  t.throws(() => npm.config.set('foo', 'bar'))
  t.throws(() => npm.config.get('foo'))
  const list = npm.commands.list
  t.throws(() => npm.commands.list())
  t.equal(npm.commands.ls, list)
  t.equal(npm.commands.list, list)
  t.equal(npm.commands.asdfasdf, undefined)
  t.equal(npm.deref('list'), 'ls')
  t.same(logs, [])
  logs.length = 0
  t.end()
})

t.test('npm.load', t => {
  t.test('must be called with proper args', t => {
    const er = new TypeError('must call as: npm.load(options, callback)')
    t.throws(() => npm.load(), er)
    t.throws(() => npm.load({}), er)
    t.throws(() => npm.load(() => {}), er)
    t.same(logs, [])
    logs.length = 0
    t.end()
  })

  t.test('load error', t => {
    const { load } = npmconf
    const loadError = new Error('load error')
    npmconf.load = async () => { throw loadError }
    npm.load({}, er => {
      t.equal(er, loadError)
      t.equal(npm.loadErr, loadError)
      npmconf.load = load
      // loading again just returns the same error
      npm.load({}, er => {
        t.equal(er, loadError)
        t.equal(npm.loadErr, loadError)
        npm.loaded = false
        npm.loadErr = null
        t.end()
      })
    })
  })

  t.test('basic loading', t => {
    const dir = t.testdir({
      node_modules: {}
    })
    let firstCalled = false
    const first = (er) => {
      if (er) {
        throw er
      }
      firstCalled = true
      t.equal(npm.loaded, true)
      t.equal(npm.config.loaded, true)
      t.equal(npm.config.get('force'), false)
    }

    let secondCalled = false
    const second = () => { secondCalled = true }

    t.equal(npm.loading, false, 'not loading yet')
    const p = npm.load({ global: false, cache: CACHE }, first).then(() => {
      npm.config.set('prefix', dir)
      t.match(npm, {
        loaded: true,
        loading: false,
        // flatOptions only loaded when we run an actual command
        flatOptions: null
      })
      t.equal(firstCalled, true, 'first callback got called')
      t.equal(secondCalled, true, 'second callback got called')
      let thirdCalled = false
      const third = () => { thirdCalled = true }
      npm.load({}, third)
      t.equal(thirdCalled, true, 'third callbback got called')
      t.match(logs, [
        ['timing', 'npm:load', /Completed in [0-9]+ms/]
      ])
      logs.length = 0

      t.equal(resolve(npm.cache), resolve(CACHE), 'cache is cache')
      const newCache = t.testdir()
      npm.cache = newCache
      t.equal(npm.config.get('cache'), newCache, 'cache setter sets config')
      t.equal(npm.cache, newCache, 'cache getter gets new config')
      t.equal(npm.log, npmlog, 'npmlog getter')
      t.equal(npm.lockfileVersion, 2, 'lockfileVersion getter')
      t.equal(npm.prefix, npm.localPrefix, 'prefix is local prefix')
      t.notEqual(npm.prefix, npm.globalPrefix, 'prefix is not global prefix')
      npm.globalPrefix = npm.prefix
      t.equal(npm.prefix, npm.globalPrefix, 'globalPrefix setter')
      npm.localPrefix = dir + '/extra/prefix'
      t.equal(npm.prefix, npm.localPrefix, 'prefix is local prefix after localPrefix setter')
      t.notEqual(npm.prefix, npm.globalPrefix, 'prefix is not global prefix after localPrefix setter')

      npm.prefix = dir + '/some/prefix'
      t.equal(npm.prefix, npm.localPrefix, 'prefix is local prefix after prefix setter')
      t.notEqual(npm.prefix, npm.globalPrefix, 'prefix is not global prefix after prefix setter')
      t.equal(npm.bin, npm.localBin, 'bin is local bin after prefix setter')
      t.notEqual(npm.bin, npm.globalBin, 'bin is not global bin after prefix setter')
      t.equal(npm.dir, npm.localDir, 'dir is local dir after prefix setter')
      t.notEqual(npm.dir, npm.globalDir, 'dir is not global dir after prefix setter')

      npm.config.set('global', true)
      t.equal(npm.prefix, npm.globalPrefix, 'prefix is global prefix after setting global')
      t.notEqual(npm.prefix, npm.localPrefix, 'prefix is not local prefix after setting global')
      t.equal(npm.bin, npm.globalBin, 'bin is global bin after setting global')
      t.notEqual(npm.bin, npm.localBin, 'bin is not local bin after setting global')
      t.equal(npm.dir, npm.globalDir, 'dir is global dir after setting global')
      t.notEqual(npm.dir, npm.localDir, 'dir is not local dir after setting global')

      npm.prefix = dir + '/new/global/prefix'
      t.equal(npm.prefix, npm.globalPrefix, 'prefix is global prefix after prefix setter')
      t.notEqual(npm.prefix, npm.localPrefix, 'prefix is not local prefix after prefix setter')
      t.equal(npm.bin, npm.globalBin, 'bin is global bin after prefix setter')
      t.notEqual(npm.bin, npm.localBin, 'bin is not local bin after prefix setter')

      t.equal(npm.config.get('metrics-registry'), npm.config.get('registry'))

      beWindows()
      t.equal(npm.bin, npm.globalBin, 'bin is global bin in windows mode')
      t.equal(npm.dir, npm.globalDir, 'dir is global dir in windows mode')
      bePosix()

      const tmp = npm.tmp
      t.match(tmp, String, 'npm.tmp is a string')
      t.equal(tmp, npm.tmp, 'getter only generates it once')
    })

    t.equal(npm.loaded, false, 'not loaded yet')
    t.equal(npm.loading, true, 'working on it tho')
    t.isa(p, Promise, 'npm.load() returned a Promise first time')
    t.equal(npm.load({ global: true }, second), undefined,
      'npm.load() returns nothing second time')

    return p
  })

  t.test('forceful loading', t => {
    // also, don't get thrown off if argv[0] isn't found for some reason
    const [ argv0 ] = process.argv
    t.teardown(() => {
      process.argv[0] = argv0
    })
    process.argv[0] = 'this exe does not exist or else this test will fail'
    npm.config.set('force', true)
    npm.loaded = false
    return npm.load({force: true}, er => {
      if (er) {
        throw er
      }
      t.match(logs, [
        [
          'warn',
          'using --force',
          'Recommended protections disabled.'
        ],
        [
          'timing',
          'npm:load',
          /Completed in [0-9]+ms/
        ],
      ])
      logs.length = 0
    })
  })

  t.test('node is a symlink', t => {
    const node = actualPlatform === 'win32' ? 'node.exe' : 'node'
    const dir = t.testdir({
      '.npmrc': 'foo = bar'
    })

    // create manually to set the 'file' option in windows
    fs.symlinkSync(process.execPath, resolve(dir, node), 'file')

    const PATH = process.env.PATH || process.env.Path
    process.env.PATH = dir
    const { execPath } = process
    const [ argv0 ] = process.argv
    process.argv[0] = node

    npm.loaded = false
    npm.config.loaded = false
    const { log } = console
    const consoleLogs = []
    console.log = (...msg) => consoleLogs.push(msg)

    t.teardown(() => {
      console.log = log
      process.env.PATH = PATH
      npm.loaded = false
      logs.length = 0
      process.execPath = execPath
      process.argv[0] = argv0
    })

    logs.length = 0
    return npm.load({
      'metrics-registry': 'http://example.com',
      prefix: dir,
      userconfig: `${dir}/.npmrc`,
      usage: true,
      scope: 'foo'
    }, er => {
      if (er) {
        throw er
      }
      t.equal(npm.config.get('scope'), '@foo', 'added the @ sign to scope')
      t.equal(npm.config.get('metrics-registry'), 'http://example.com')
      t.match(logs, [
        [
          'verbose',
          'node symlink',
          resolve(dir, node)
        ],
        [
          'verbose',
          'config',
          'Skipping project config: %s. (matches userconfig)',
          /\.npmrc$/
        ],
        [
          'timing',
          'npm:load',
          /Completed in [0-9]+ms/,
        ],
      ])
      logs.length = 0
      t.equal(process.execPath, resolve(dir, node))
    }).then(() => {
      return npm.commands.ll([], (er) => {
        if (er) {
          throw er
        }
        t.same(consoleLogs, [[require('../../lib/ls.js').usage]], 'print usage')
        consoleLogs.length = 0
        npm.config.set('usage', false)
        t.equal(npm.commands.ll, npm.commands.la, 'same command, different name')
        logs.length = 0
        return npm.commands.get(['scope', '\u2010not-a-dash'], (er) => {
          if (er) {
            throw er
          }
          t.match(logs, [
            [
              'error',
              'arg',
              'Argument starts with non-ascii dash, this is probably invalid:',
              '\u2010not-a-dash',
            ],
            [
              'timing',
              'command:config',
              /Completed in [0-9]+ms/,
            ],
            [
              'timing',
              'command:get',
              /Completed in [0-9]+ms/,
            ],
          ])
          t.same(consoleLogs, [['@foo']])
        })
      })
    })
  })

  t.end()
})

t.test('loading as main will load the cli', t => {
  const { spawn } = require('child_process')
  const npm = require.resolve('../../lib/npm.js')
  const p = spawn(process.execPath, [npm, 'ls', '-h'])
  const out = []
  p.stdout.on('data', c => out.push(c))
  p.on('close', (code, signal) => {
    t.equal(code, 0)
    t.equal(signal, null)
    t.equal(Buffer.concat(out).toString().trim(), require('../../lib/ls.js').usage)
    t.end()
  })
})

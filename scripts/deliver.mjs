// Installs dist/spicy-lyrics into the PulseSync addons folder and asks the
// running PulseSync client to (re)load it into Yandex Music.
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIRECTORY = 'spicy-lyrics'
const SETTINGS_FILE = 'pulsesync.settings.json'
const CLIENT_URL = process.env.PULSESYNC_CLIENT_URL || 'http://127.0.0.1:2007'

const appData =
    process.platform === 'win32'
        ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
        : process.platform === 'darwin'
          ? path.join(os.homedir(), 'Library', 'Application Support')
          : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
const addonsDir = process.env.PULSESYNC_ADDONS_DIR || path.join(appData, 'PulseSync', 'addons')

const exists = (p) => fs.access(p).then(() => true, () => false)

async function install() {
    const source = path.join(root, 'dist', DIRECTORY)
    if (!(await exists(path.join(source, 'metadata.json')))) throw new Error(`Build output not found: ${source}`)

    const target = path.join(addonsDir, DIRECTORY)
    const targetMeta = path.join(target, 'metadata.json')
    if (await exists(targetMeta)) {
        const meta = JSON.parse(await fs.readFile(targetMeta, 'utf8'))
        if (meta.installSource === 'store') throw new Error(`Refusing to overwrite a store-managed addon at ${target}`)
    }

    const staging = path.join(addonsDir, `.${DIRECTORY}-staging-${process.pid}`)
    const backup = path.join(addonsDir, `.${DIRECTORY}-previous-${process.pid}`)
    await fs.rm(staging, { recursive: true, force: true })
    await fs.cp(source, staging, { recursive: true })
    await fs.rm(path.join(staging, SETTINGS_FILE), { force: true })
    if (await exists(path.join(target, SETTINGS_FILE))) {
        await fs.copyFile(path.join(target, SETTINGS_FILE), path.join(staging, SETTINGS_FILE))
    }

    let moved = false
    try {
        if (await exists(target)) {
            await fs.rename(target, backup)
            moved = true
        }
        await fs.rename(staging, target)
    } catch (error) {
        if (moved && !(await exists(target))) await fs.rename(backup, target)
        throw error
    }
    if (moved) await fs.rm(backup, { recursive: true, force: true })
    return target
}

async function reload() {
    const url = new URL('/dev/addons/reload', CLIENT_URL)
    url.searchParams.set('directory', DIRECTORY)
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'X-PulseSync-Addon-Dev': '1' },
            signal: AbortSignal.timeout(3000),
        })
        const payload = await response.json().catch(() => ({}))
        return { status: response.status, ...payload }
    } catch (error) {
        return { ok: false, error: `PulseSync is not reachable: ${error instanceof Error ? error.message : String(error)}` }
    }
}

const target = await install()
console.log(`Installed: ${target}`)
const result = await reload()
console.log(`Reload: ${JSON.stringify(result)}`)

import type { AddonManifest } from '@pulsesync/addon-sdk/vite'

declare const addonConfig: AddonManifest & { readonly directoryName: string }

export default addonConfig

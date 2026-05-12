import React from 'react'

import ZhinengchuangzuoPlugin from '../main'

// Plugin context
const PluginContext = React.createContext<ZhinengchuangzuoPlugin | undefined>(
  undefined,
)

export const PluginProvider = ({
  children,
  plugin,
}: {
  children: React.ReactNode
  plugin: ZhinengchuangzuoPlugin
}) => {
  return (
    <PluginContext.Provider value={plugin}>{children}</PluginContext.Provider>
  )
}

export const usePlugin = () => {
  const plugin = React.useContext(PluginContext)
  if (!plugin) {
    throw new Error('UsePlugin must be used within a PluginProvider')
  }
  return plugin
}

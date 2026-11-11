import { App } from 'obsidian'
import React from 'react'

// App context
const AppContext = React.createContext<App | undefined>(undefined)

export const AppProvider = ({
  children,
  app,
}: {
  children: React.ReactNode
  app: App
}) => {
  return <AppContext.Provider value={app}>{children}</AppContext.Provider>
}

export const useApp = () => {
  const app = React.useContext(AppContext)
  if (!app) {
    throw new Error('The App must be used within a App provider')
  }
  return app
}

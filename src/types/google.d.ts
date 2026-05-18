interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string
          callback: (response: { credential: string }) => void
          auto_select?: boolean
        }) => void
        prompt: (callback?: (notification: {
          isNotDisplayed: () => boolean
          isSkippedMoment: () => boolean
        }) => void) => void
        disableAutoSelect: () => void
        renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
      }
    }
  }
}
